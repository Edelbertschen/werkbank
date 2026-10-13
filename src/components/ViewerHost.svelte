<script lang="ts">
  import { L } from '../lib/i18n';
  import { onMount, mount, unmount } from 'svelte';
  import { viewer, type PageHost } from '../lib/viewer.svelte';
  import { app, active } from '../lib/app.svelte';
  import { pdfjsLib } from '../lib/pdf';
  import { addItem } from '../lib/overlay.svelte';
  import OverlayPage from './OverlayPage.svelte';

  let container: HTMLDivElement;
  const doc = $derived(active());
  const hosts = new Map<HTMLElement, { el: HTMLDivElement; comp: any; index: number }>();
  const ET = pdfjsLib.AnnotationEditorType;
  const PT = pdfjsLib.AnnotationEditorParamsType;

  function ensureOverlay(h: PageHost) {
    let host = hosts.get(h.div);
    if (!host || host.index !== h.index) {
      if (host) { unmount(host.comp); host.el.remove(); }
      const el = document.createElement('div');
      el.className = 'ov-host';
      const comp = mount(OverlayPage, { target: el, props: { index: h.index } });
      host = { el, comp, index: h.index };
      hosts.set(h.div, host);
    }
    if (host.el.parentElement !== h.div) h.div.append(host.el);
  }
  function resetOverlays() {
    for (const h of hosts.values()) { try { unmount(h.comp); } catch { /* egal */ } h.el.remove(); }
    hosts.clear();
  }

  onMount(() => {
    let off: (() => void) | undefined;
    viewer.init(container).then(() => {
      off = viewer.onPageHost(ensureOverlay);
      viewer.bus.on('pagesinit', () => { resetOverlays(); for (const h of viewer.pageDivs()) ensureOverlay(h); });
      viewer.show(active());
    });
    // Seitenbreite/ganze Seite nachführen, wenn Seitenleiste oder Aufgabenbereich die Breite ändern
    let raf = 0, lastW = container.clientWidth, lastH = container.clientHeight;
    const ro = new ResizeObserver(() => {
      const w = container.clientWidth, h = container.clientHeight;
      if (Math.abs(w - lastW) < 2 && Math.abs(h - lastH) < 2) return;
      lastW = w; lastH = h;
      cancelAnimationFrame(raf); raf = requestAnimationFrame(() => viewer.refit());
    });
    ro.observe(container);
    return () => { off?.(); resetOverlays(); ro.disconnect(); cancelAnimationFrame(raf); };
  });

  // Dokumentwechsel und neue Stände anzeigen
  $effect(() => {
    const d = doc; const rev = d?.rev;
    void rev;
    if (viewer.inst) viewer.show(d);
  });
  $effect(() => { app.prefs.scroll; app.prefs.spread; viewer.applyLayout(); });

  // Bearbeitungsmodus → pdf.js-Editor
  $effect(() => {
    const m = app.mode;
    if (!viewer.inst || !doc) return;
    const map: Record<string, number> = { 'pdfjs:freetext': ET.FREETEXT, 'pdfjs:ink': ET.INK, 'pdfjs:highlight': ET.HIGHLIGHT, 'pdfjs:stamp': ET.STAMP };
    const type = map[m] ?? ET.NONE;
    viewer.setEditor(type);
    if (type === ET.INK) setTimeout(() => { viewer.editorParam(PT.INK_COLOR, app.style.ink); viewer.editorParam(PT.INK_THICKNESS, Math.max(1, Math.round(app.style.inkWidth * 1.5))); }, 60);
    if (type === ET.HIGHLIGHT) setTimeout(() => viewer.editorParam(PT.HIGHLIGHT_COLOR, app.style.highlight), 60);
    if (type === ET.FREETEXT) setTimeout(() => { viewer.editorParam(PT.FREETEXT_COLOR, app.style.textColor); viewer.editorParam(PT.FREETEXT_SIZE, app.style.fontSize); }, 60);
  });

  // Hand-Werkzeug: Ziehen verschiebt die Ansicht
  let pan: { x: number; y: number; l: number; t: number } | null = null;
  function down(e: PointerEvent) {
    const hand = app.mode === 'hand' || e.button === 1;
    if (!hand) return;
    e.preventDefault();
    pan = { x: e.clientX, y: e.clientY, l: container.scrollLeft, t: container.scrollTop };
    container.setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent) { if (!pan) return; container.scrollLeft = pan.l - (e.clientX - pan.x); container.scrollTop = pan.t - (e.clientY - pan.y); }
  function up() { pan = null; }

  // Strg/⌘ + Mausrad zoomt
  function wheel(e: WheelEvent) {
    if (!(e.ctrlKey || e.metaKey) || !doc) return;
    e.preventDefault();
    viewer.zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1);
  }

  // Unterstreichen / Durchstreichen per Textauswahl
  function mouseup() {
    if (!doc || (app.mode !== 'markup:underline' && app.mode !== 'markup:strike')) return;
    const sel = getSelection();
    if (!sel || sel.isCollapsed) return;
    const byPage = new Map<number, [number, number, number, number][]>();
    for (let r = 0; r < sel.rangeCount; r++) {
      for (const rect of Array.from(sel.getRangeAt(r).getClientRects())) {
        if (rect.width < 1 || rect.height < 1) continue;
        const pageEl = document.elementsFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2).find(el => (el as HTMLElement).classList?.contains('page')) as HTMLElement | undefined;
        if (!pageEl) continue;
        const idx = +(pageEl.dataset.pageNumber || 1) - 1;
        const box = (pageEl.querySelector('.canvasWrapper') || pageEl).getBoundingClientRect();
        const list = byPage.get(idx) || [];
        list.push([(rect.left - box.left) / box.width, (rect.top - box.top) / box.height, rect.width / box.width, rect.height / box.height]);
        byPage.set(idx, list);
      }
    }
    for (const [page, rects] of byPage) addItem(doc, { page, kind: app.mode === 'markup:underline' ? 'underline' : 'strike', rects: mergeLines(rects), color: app.mode === 'markup:underline' ? '#1F4FD1' : '#E5383B' } as any);
    sel.removeAllRanges();
  }
  function mergeLines(rects: [number, number, number, number][]) {
    const sorted = [...rects].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    const out: [number, number, number, number][] = [];
    for (const r of sorted) {
      const last = out[out.length - 1];
      if (last && Math.abs(last[1] - r[1]) < r[3] * 0.5 && r[0] <= last[0] + last[2] + 0.01) {
        const x0 = Math.min(last[0], r[0]), x1 = Math.max(last[0] + last[2], r[0] + r[2]);
        const y0 = Math.min(last[1], r[1]), y1 = Math.max(last[1] + last[3], r[1] + r[3]);
        out[out.length - 1] = [x0, y0, x1 - x0, y1 - y0];
      } else out.push([...r]);
    }
    return out;
  }
</script>

<div class="vc scroll mode-{app.mode.replace(':', '-')}" class:hand={app.mode === 'hand'} class:fieldhl={app.prefs.showFieldHighlight}
  bind:this={container} onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up} onwheel={wheel} onmouseup={mouseup} role="document" aria-label={L("Dokumentansicht")}>
  <div class="pdfViewer"></div>
</div>

<style>
  .vc { position: absolute; inset: 0; overflow: auto; outline: none; }
  .vc.hand { cursor: grab; }
  .vc.hand :global(.textLayer) { pointer-events: none; }
  .vc.hand:active { cursor: grabbing; }
</style>
