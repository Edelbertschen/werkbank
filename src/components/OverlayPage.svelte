<script lang="ts">
  import { L, intlLocale } from '../lib/i18n';
  import { onMount, tick } from 'svelte';
  import { app, active } from '../lib/app.svelte';
  import { overlay, itemsOf, addItem, removeItem, type OItem } from '../lib/overlay.svelte';
  import { dialog } from '../lib/dialogs.svelte';
  import * as I from '../lib/icons';
  import { groupLines, paragraphAt, classifyFont, FONT_STACK, type Box, type FontStyle } from '../lib/textedit';
  import { previewFamily } from '../lib/sysfonts';

  let { index }: { index: number } = $props();
  let host: HTMLDivElement;
  let k = $state(1); // Bildschirmpixel je pt
  const doc = $derived(active());
  const page = $derived(doc?.pages[index]);
  const items = $derived(doc ? itemsOf(doc).filter(i => i.page === index) : []);
  let draft = $state<null | { kind: string; x0: number; y0: number; x1: number; y1: number }>(null);

  onMount(() => {
    const ro = new ResizeObserver(() => { if (page) k = host.clientWidth / page.w; });
    ro.observe(host);
    return () => ro.disconnect();
  });
  $effect(() => { if (page && host) k = host.clientWidth / page.w; });

  const pt = (frac: number, axis: 'x' | 'y') => frac * (axis === 'x' ? page!.w : page!.h);
  function frac(e: PointerEvent | MouseEvent) {
    const r = host.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  }

  const RECT_MODES: Record<string, string> = { 'shape:rect': 'rect', 'shape:ellipse': 'ellipse', redact: 'redact', whiteout: 'whiteout', link: 'link', 'field:text': 'field', 'field:check': 'field', 'field:radio': 'field', 'field:choice': 'field', 'field:signature': 'field' };

  async function onDown(e: PointerEvent) {
    if (!doc || e.button !== 0 || e.target !== host) return;
    const m = app.mode;
    const p = frac(e);
    overlay.selected = null;
    if (RECT_MODES[m] || m === 'shape:line' || m === 'shape:arrow') {
      e.preventDefault();
      host.setPointerCapture(e.pointerId);
      draft = { kind: RECT_MODES[m] || (m === 'shape:line' ? 'line' : 'arrow'), x0: p.x, y0: p.y, x1: p.x, y1: p.y };
      return;
    }
    if (m === 'note') {
      const it = addItem(doc, { page: index, kind: 'note', x: p.x, y: p.y, text: '', color: '#F2B705' } as any);
      overlay.editing = it.id;
      e.preventDefault();
      return;
    }
    if (m === 'text:add') {
      e.preventDefault(); // sonst nimmt der Browser dem neuen Textfeld sofort den Fokus wieder
      const it = addItem(doc, { page: index, kind: 'text', x: p.x, y: p.y - (app.style.fontSize * 0.55) / page!.h, w: Math.min(0.5, 0.98 - p.x), text: '', size: app.style.fontSize, color: app.style.textColor, bold: false } as any);
      overlay.editing = it.id;
      await tick(); focusText(it.id);
      return;
    }
    if (m === 'text:edit') { e.preventDefault(); editTextAt(e); return; }
    if ((m === 'image' || m === 'sign' || m === 'stamp') && app.placing) {
      const P = app.placing;
      const w = P.width, h = (w * page!.w * P.ratio) / page!.h;
      addItem(doc, { page: index, kind: 'image', x: Math.max(0, Math.min(1 - w, p.x - w / 2)), y: Math.max(0, Math.min(1 - h, p.y - h / 2)), w, h, src: P.src, role: P.kind } as any);
      app.mode = 'select';
      app.placing = null;
    }
  }
  function onMove(e: PointerEvent) {
    if (!draft) return;
    const p = frac(e);
    let x1 = Math.max(0, Math.min(1, p.x)), y1 = Math.max(0, Math.min(1, p.y));
    if (e.shiftKey && (draft.kind === 'ellipse' || draft.kind === 'rect')) {
      const dx = (x1 - draft.x0) * page!.w, dy = (y1 - draft.y0) * page!.h, s = Math.max(Math.abs(dx), Math.abs(dy));
      x1 = draft.x0 + Math.sign(dx || 1) * s / page!.w; y1 = draft.y0 + Math.sign(dy || 1) * s / page!.h;
    }
    if (e.shiftKey && (draft.kind === 'line' || draft.kind === 'arrow')) {
      const dx = (x1 - draft.x0) * page!.w, dy = (y1 - draft.y0) * page!.h;
      if (Math.abs(dx) > Math.abs(dy) * 2) y1 = draft.y0; else if (Math.abs(dy) > Math.abs(dx) * 2) x1 = draft.x0;
    }
    draft.x1 = x1; draft.y1 = y1;
  }
  async function onUp() {
    if (!draft || !doc) return;
    const d = draft; draft = null;
    const x = Math.min(d.x0, d.x1), y = Math.min(d.y0, d.y1), w = Math.abs(d.x1 - d.x0), h = Math.abs(d.y1 - d.y0);
    const s = app.style;
    if (d.kind === 'line' || d.kind === 'arrow') {
      if (Math.hypot((d.x1 - d.x0) * page!.w, (d.y1 - d.y0) * page!.h) < 4) return;
      addItem(doc, { page: index, kind: d.kind, x1: d.x0, y1: d.y0, x2: d.x1, y2: d.y1, stroke: s.stroke, width: s.width, opacity: s.opacity } as any);
      return;
    }
    const tiny = w * page!.w < 4 || h * page!.h < 4;
    const m = app.mode;
    if (d.kind === 'field') {
      const ftype = m.split(':')[1] as any;
      let fw = w, fh = h;
      if (tiny) { fw = (ftype === 'check' || ftype === 'radio' ? 14 : ftype === 'signature' ? 180 : 160) / page!.w; fh = (ftype === 'check' || ftype === 'radio' ? 14 : ftype === 'signature' ? 40 : 20) / page!.h; }
      const n = itemsOf(doc).filter(i => i.kind === 'field').length + 1;
      const props = await fieldDialog(ftype, { name: { text: L("Textfeld"), check: L("Kontrollkästchen"), radio: 'Option', choice: L("Auswahl"), signature: L("Unterschrift") }[ftype as string] + ' ' + n, options: '', multiline: fh * page!.h > 40, group: L("Gruppe 1") });
      if (!props) return;
      addItem(doc, { page: index, kind: 'field', ftype, x, y, w: fw, h: fh, ...props } as any);
      return;
    }
    if (tiny) return;
    if (d.kind === 'link') {
      const r = await linkDialog({ url: '', toPage: 1 });
      if (!r) return;
      addItem(doc, { page: index, kind: 'link', x, y, w, h, ...r } as any);
      return;
    }
    if (d.kind === 'redact' || d.kind === 'whiteout') { addItem(doc, { page: index, kind: d.kind, x, y, w, h } as any); return; }
    addItem(doc, { page: index, kind: d.kind, x, y, w, h, stroke: s.stroke, fill: s.fill, width: s.width, opacity: s.opacity } as any);
  }

  // Schrift des Originals laut pdf.js (Name und Schnitt), für eine passende Vorschau
  async function fontAt(x0: number, y0: number, x1: number, y1: number): Promise<FontStyle & { name: string }> {
    try {
      const pg = await doc!.pdf!.getPage(index + 1);
      const tc = await pg.getTextContent();
      const vp = pg.getViewport({ scale: 1 });
      let best: any = null, n = 0;
      for (const t of tc.items as any[]) {
        if (!t.str?.trim()) continue;
        const [px, py] = vp.convertToViewportPoint(t.transform[4], t.transform[5]);
        const u = px / vp.width, v = py / vp.height;
        if (u >= x0 - 0.01 && u <= x1 && v >= y0 && v <= y1 + 0.01 && t.str.length > n) { best = t; n = t.str.length; }
      }
      if (!best) return { ...classifyFont(''), name: '' };
      const f: any = pg.commonObjs.has(best.fontName) ? pg.commonObjs.get(best.fontName) : null;
      return { ...classifyFont(f?.name || '', { bold: f?.bold || f?.black, italic: f?.italic, mono: f?.isMonospace }), name: f?.name || '' };
    } catch { return { ...classifyFont(''), name: '' }; }
  }

  // ---------------- Text einer Zeile bearbeiten ----------------
  async function editTextAt(e: PointerEvent) {
    const pageEl = (host.closest('.page') as HTMLElement) || host.parentElement!;
    const spans = Array.from(pageEl.querySelectorAll('.textLayer span')) as HTMLElement[];
    const hr = host.getBoundingClientRect();
    const boxes: (Box & { el: HTMLElement })[] = spans.map(s => { const r = s.getBoundingClientRect(); return { el: s, text: s.textContent || '', left: r.left, right: r.right, top: r.top, bottom: r.bottom }; }).filter(b => b.right - b.left > 0 && b.text.trim());
    const lines = groupLines(boxes);
    const iHit = lines.findIndex(l => e.clientX >= l.left - 2 && e.clientX <= l.right + 2 && e.clientY >= l.top - 2 && e.clientY <= l.bottom + 2);
    if (iHit < 0 || !doc) return;
    // Ganzer Absatz, damit der Text beim Ändern neu umbrechen kann; einzelne Zeilen (Überschriften) bleiben einzeilig
    const para = paragraphAt(lines, iHit);
    const multi = para.lines.length > 1;
    const { left, right, top, bottom } = multi ? para.box : lines[iHit];
    const text = multi ? para.box.text : lines[iHit].text;
    const lineH = multi ? para.lineHeight : bottom - top;
    const glyphH = Math.min(...(multi ? para.lines : [lines[iHit]]).map(l => l.height));
    const sizePt = glyphH / k * 0.92;
    // Textfarbe aus dem Seitenbild schätzen
    const color = await sampleColor(pageEl, left, top, right, bottom);
    const fx = (left - hr.left) / hr.width, fy = (top - hr.top) / hr.height, fw = (right - left) / hr.width, fh = (bottom - top) / hr.height;
    const it = addItem(doc, { page: index, kind: 'textedit', x: fx, y: fy, w: fw, h: fh, text, orig: text, size: Math.max(4, Math.round(sizePt * 10) / 10), color, bold: false, multi, lineHeight: lineH / k } as any);
    overlay.editing = it.id;
    await tick(); focusText(it.id, true);
    // Schrift des Originals nachziehen, ohne das Tippen aufzuhalten
    const d = doc;
    fontAt(fx, fy, fx + fw, fy + fh).then(f => {
      const live = itemsOf(d).find(x => x.id === it.id) as any;
      if (live) { live.bold = f.bold; live.italic = f.italic; live.family = f.family; live.fontName = f.name; }
      // Ist die Schrift installiert, zeigt die Vorschau genau diese
      if (f.name) previewFamily(f.name, f.bold, f.italic).then(fam => { if (fam && live) live.css = fam; });
    });
  }
  async function sampleColor(pageEl: HTMLElement, l: number, t: number, r: number, b: number) {
    try {
      const c = pageEl.querySelector('canvas') as HTMLCanvasElement; const cr = c.getBoundingClientRect();
      const sx = c.width / cr.width, sy = c.height / cr.height;
      const d = c.getContext('2d', { willReadFrequently: true })!.getImageData(Math.max(0, (l - cr.left) * sx), Math.max(0, (t - cr.top) * sy), Math.max(1, (r - l) * sx), Math.max(1, (b - t) * sy)).data;
      let best = [0, 0, 0], dark = 766;
      for (let i = 0; i < d.length; i += 4) { const s = d[i] + d[i + 1] + d[i + 2]; if (s < dark) { dark = s; best = [d[i], d[i + 1], d[i + 2]]; } }
      return '#' + best.map(v => v.toString(16).padStart(2, '0')).join('');
    } catch { return '#1C1C1E'; }
  }
  function focusText(id: string, selectAll = false) {
    const el = host.querySelector(`[data-id="${id}"] .tx`) as HTMLElement | null;
    if (!el) return;
    el.focus();
    const r = document.createRange(); r.selectNodeContents(el); if (!selectAll) r.collapse(false);
    const s = getSelection(); s?.removeAllRanges(); s?.addRange(r);
  }

  // ---------------- Verschieben & Größe ----------------
  function startDrag(e: PointerEvent, it: OItem, mode: 'move' | 'resize' | 'p1' | 'p2') {
    if (e.button !== 0) return;
    e.stopPropagation(); e.preventDefault();
    overlay.selected = it.id;
    const r = host.getBoundingClientRect(); const sx = e.clientX, sy = e.clientY;
    const o = JSON.parse(JSON.stringify(it));
    const target = e.currentTarget as HTMLElement; target.setPointerCapture(e.pointerId);
    const ratio = it.kind === 'image' ? (it.h * page!.h) / (it.w * page!.w) : 0;
    const mv = (ev: PointerEvent) => {
      const dx = (ev.clientX - sx) / r.width, dy = (ev.clientY - sy) / r.height;
      const a: any = it;
      if (it.kind === 'line' || it.kind === 'arrow') {
        if (mode === 'move' || mode === 'p1') { a.x1 = o.x1 + dx; a.y1 = o.y1 + dy; }
        if (mode === 'move' || mode === 'p2') { a.x2 = o.x2 + dx; a.y2 = o.y2 + dy; }
      } else if (it.kind === 'underline' || it.kind === 'strike') {
        a.rects = o.rects.map((q: number[]) => [q[0] + dx, q[1] + dy, q[2], q[3]]);
      } else if (mode === 'move') { a.x = o.x + dx; a.y = o.y + dy; }
      else {
        a.w = Math.max(0.01, o.w + dx);
        if ('h' in o) a.h = ratio ? (a.w * page!.w * ratio) / page!.h : Math.max(0.006, o.h + dy);
      }
    };
    const up = () => { target.removeEventListener('pointermove', mv); target.removeEventListener('pointerup', up); };
    target.addEventListener('pointermove', mv); target.addEventListener('pointerup', up);
  }

  async function edit(it: OItem) {
    if (!doc) return;
    if (it.kind === 'link') { const r = await linkDialog(it); if (r) Object.assign(it, r); }
    else if (it.kind === 'field') { const r = await fieldDialog(it.ftype, it); if (r) Object.assign(it, r); }
    else if (it.kind === 'text' || it.kind === 'textedit' || it.kind === 'note') { overlay.editing = it.id; await tick(); focusText(it.id); }
  }

  async function linkDialog(v: { url: string; toPage: number }) {
    const r = await dialog({ title: 'Link', fields: [
      { key: 'kind', type: 'seg', label: L("Ziel"), opts: [['url', L("Webadresse")], ['page', L("Seite im Dokument")]], def: v.url || !v.toPage ? 'url' : 'page' },
      { key: 'url', type: 'text', label: L("Adresse"), def: v.url || 'https://', when: x => x.kind === 'url' },
      { key: 'toPage', type: 'number', label: L("Seite"), def: v.toPage || 1, min: 1, max: doc!.numPages, when: x => x.kind === 'page' },
    ], buttons: [{ label: L("Abbrechen"), value: 'cancel' }, { label: 'OK', value: 'ok', primary: true }] });
    if (!r || r.button !== 'ok') return null;
    return r.values.kind === 'url' ? { url: String(r.values.url || '').trim(), toPage: 0 } : { url: '', toPage: +r.values.toPage || 1 };
  }
  async function fieldDialog(ftype: string, v: any) {
    const r = await dialog({ title: { text: L("Textfeld"), check: L("Kontrollkästchen"), radio: L("Optionsfeld"), choice: L("Auswahlliste"), signature: L("Unterschriftsfeld") }[ftype] || L("Feld"), fields: [
      { key: 'name', type: 'text', label: ftype === 'radio' ? L("Wert dieser Option") : L("Feldname"), def: v.name },
      { key: 'group', type: 'text', label: L("Gruppe (gleicher Name = eine Auswahl)"), def: v.group || L("Gruppe 1"), when: () => ftype === 'radio' },
      { key: 'options', type: 'textarea', label: L("Einträge (je Zeile einer)"), def: v.options || L("Option 1\nOption 2"), when: () => ftype === 'choice' },
      { key: 'multiline', type: 'check', label: L("Mehrzeilig"), def: !!v.multiline, when: () => ftype === 'text' },
    ], buttons: [{ label: L("Abbrechen"), value: 'cancel' }, { label: 'OK', value: 'ok', primary: true }] });
    if (!r || r.button !== 'ok') return null;
    return { name: r.values.name || v.name, group: r.values.group || '', options: r.values.options || '', multiline: !!r.values.multiline };
  }

  function arrowPath(it: any) {
    const x1 = pt(it.x1, 'x') * k, y1 = pt(it.y1, 'y') * k, x2 = pt(it.x2, 'x') * k, y2 = pt(it.y2, 'y') * k;
    const a = Math.atan2(y2 - y1, x2 - x1), len = Math.max(8, it.width * 4) * k;
    return `M${x2 - len * Math.cos(a - 0.45)},${y2 - len * Math.sin(a - 0.45)} L${x2},${y2} L${x2 - len * Math.cos(a + 0.45)},${y2 - len * Math.sin(a + 0.45)}`;
  }
  /** Inhalt eines editierbaren Feldes nur einmal setzen, damit der Cursor beim Tippen bleibt */
  function initText(node: HTMLElement, text: string) { node.textContent = text; }
  const FIELD_LABEL: Record<string, string> = { text: L("Textfeld"), check: '☐', radio: '◯', choice: L("Auswahl ▾"), signature: L("Unterschrift") };
</script>

<div class="ov" bind:this={host} onpointerdown={onDown} onpointermove={onMove} onpointerup={onUp} role="presentation">
  {#each items as it (it.id)}
    {@const sel = overlay.selected === it.id}
    {#if it.kind === 'line' || it.kind === 'arrow'}
      <svg class="shape" class:sel style="left:0;top:0;width:100%;height:100%" role="presentation">
        <line x1={pt(it.x1, 'x') * k} y1={pt(it.y1, 'y') * k} x2={pt(it.x2, 'x') * k} y2={pt(it.y2, 'y') * k} stroke={it.stroke} stroke-width={Math.max(1, it.width * k)} stroke-linecap="round" opacity={it.opacity} />
        {#if it.kind === 'arrow'}<path d={arrowPath(it)} fill="none" stroke={it.stroke} stroke-width={Math.max(1, it.width * k)} stroke-linecap="round" stroke-linejoin="round" />{/if}
        <line class="hit" x1={pt(it.x1, 'x') * k} y1={pt(it.y1, 'y') * k} x2={pt(it.x2, 'x') * k} y2={pt(it.y2, 'y') * k} stroke="transparent" stroke-width="12" onpointerdown={e => startDrag(e, it, 'move')} role="presentation" />
        {#if sel}
          <circle class="hd" cx={pt(it.x1, 'x') * k} cy={pt(it.y1, 'y') * k} r="5" onpointerdown={e => startDrag(e, it, 'p1')} role="presentation" />
          <circle class="hd" cx={pt(it.x2, 'x') * k} cy={pt(it.y2, 'y') * k} r="5" onpointerdown={e => startDrag(e, it, 'p2')} role="presentation" />
        {/if}
      </svg>
    {:else if it.kind === 'underline' || it.kind === 'strike'}
      {#each it.rects as q, qi (qi)}
        <div class="mk {it.kind}" style:left={q[0] * 100 + '%'} style:top={q[1] * 100 + '%'} style:width={q[2] * 100 + '%'} style:height={q[3] * 100 + '%'} style:--c={it.color}
          class:sel onpointerdown={e => startDrag(e, it, 'move')} role="presentation"></div>
      {/each}
    {:else if it.kind === 'note'}
      <div class="note" class:sel data-id={it.id} style:left={it.x * 100 + '%'} style:top={it.y * 100 + '%'} onpointerdown={e => startDrag(e, it, 'move')} ondblclick={() => edit(it)} role="presentation">
        <I.StickyNote size={Math.max(14, 18 * k)} strokeWidth={1.6} />
        {#if overlay.editing === it.id || sel}
          <div class="pop" onpointerdown={e => e.stopPropagation()} role="presentation">
            <textarea class="textarea tx" placeholder={L("Notiz schreiben …")} bind:value={it.text} rows="4"></textarea>
            <div class="by">{app.prefs.author || L("Ohne Namen")} · {new Date().toLocaleDateString(intlLocale())}</div>
          </div>
        {/if}
      </div>
    {:else}
      {@const box = it as any}
      <div class="item {it.kind}" class:sel data-id={it.id}
        style:left={box.x * 100 + '%'} style:top={box.y * 100 + '%'} style:width={box.w * 100 + '%'} style:height={it.kind === 'text' || box.multi ? 'auto' : box.h * 100 + '%'} style:min-height={box.multi ? box.h * 100 + '%' : null}
        onpointerdown={e => startDrag(e, it, 'move')} ondblclick={() => edit(it)} role="presentation">
        {#if it.kind === 'rect'}
          <div class="fillbox" style:border={`${Math.max(1, it.width * k)}px solid ${it.stroke}`} style:background={it.fill === 'transparent' ? 'none' : it.fill + '55'} style:opacity={it.opacity}></div>
        {:else if it.kind === 'ellipse'}
          <div class="fillbox round" style:border={`${Math.max(1, it.width * k)}px solid ${it.stroke}`} style:background={it.fill === 'transparent' ? 'none' : it.fill + '55'} style:opacity={it.opacity}></div>
        {:else if it.kind === 'image'}
          <img src={it.src} alt="" draggable="false" />
        {:else if it.kind === 'redact'}
          <div class="redactbox"><span>{L("Wird geschwärzt")}</span></div>
        {:else if it.kind === 'whiteout'}
          <div class="whitebox"></div>
        {:else if it.kind === 'link'}
          <div class="linkbox"><I.Link size={12} /><span>{it.url || L("Seite {0}", it.toPage)}</span></div>
        {:else if it.kind === 'field'}
          <div class="fieldbox" class:small={it.ftype === 'check' || it.ftype === 'radio'}><span>{it.ftype === 'check' || it.ftype === 'radio' ? FIELD_LABEL[it.ftype] : it.name}</span></div>
        {:else if it.kind === 'text' || it.kind === 'textedit'}
          {#if it.kind === 'textedit'}<div class="cover"></div>{/if}
          <div class="tx" contenteditable="true" spellcheck="false" role="textbox" tabindex="0"
            style:font-size={it.size * k + 'px'} style:color={it.color} style:font-weight={it.bold ? 700 : 400} style:font-style={(it as any).italic ? 'italic' : null} style:font-family={it.kind === 'textedit' ? ((it as any).css ? `"${(it as any).css}", ` : '') + FONT_STACK[((it as any).family || 'sans') as 'sans'] : null} style:line-height={it.kind === 'textedit' ? ((it as any).multi ? (it as any).lineHeight * k : box.h * page!.h * k) + 'px' : 1.2}
            class:multi={(it as any).multi}
            onpointerdown={e => { e.stopPropagation(); overlay.selected = it.id; }}
            onfocus={() => { overlay.selected = it.id; overlay.editing = it.id; }}
            oninput={e => { it.text = (e.target as HTMLElement).innerText.replace(/\n$/, ''); }}
            onblur={() => { overlay.editing = null; if (!it.text.trim() && it.kind === 'text') removeItem(doc!, it.id); }}
            use:initText={it.text}></div>
        {/if}
        {#if sel}
          <div class="tools" onpointerdown={e => e.stopPropagation()} role="toolbar" aria-label={L("Element")}>
            {#if it.kind === 'text' || it.kind === 'textedit'}
              <button title={L("Kleiner")} aria-label={L("Kleiner")} onclick={() => (it.size = Math.max(4, +(it.size - 1).toFixed(1)))}>A−</button>
              <button title={L("Größer")} aria-label={L("Größer")} onclick={() => (it.size = +(it.size + 1).toFixed(1))}>A+</button>
              <button title={L("Fett")} aria-label={L("Fett")} class:on={it.bold} onclick={() => (it.bold = !it.bold)}><b>B</b></button>
              <input type="color" title={L("Farbe")} aria-label={L("Textfarbe")} value={it.color} oninput={e => (it.color = (e.target as HTMLInputElement).value)} />
            {/if}
            {#if it.kind === 'link' || it.kind === 'field'}<button title={L("Bearbeiten")} aria-label={L("Bearbeiten")} onclick={() => edit(it)}><I.Settings size={12} /></button>{/if}
            <button class="del" title={L("Entfernen (Entf)")} aria-label={L("Entfernen")} onclick={() => removeItem(doc!, it.id)}><I.Trash2 size={12} /></button>
          </div>
          {#if it.kind !== 'text' && it.kind !== 'textedit'}<div class="rs" onpointerdown={e => startDrag(e, it, 'resize')} role="presentation"></div>{/if}
        {/if}
      </div>
    {/if}
  {/each}
  {#if draft}
    {#if draft.kind === 'line' || draft.kind === 'arrow'}
      <svg class="shape" style="left:0;top:0;width:100%;height:100%"><line x1={pt(draft.x0, 'x') * k} y1={pt(draft.y0, 'y') * k} x2={pt(draft.x1, 'x') * k} y2={pt(draft.y1, 'y') * k} stroke={app.style.stroke} stroke-width={Math.max(1, app.style.width * k)} stroke-linecap="round" /></svg>
    {:else}
      <div class="draft {draft.kind}" class:round={draft.kind === 'ellipse'} style:left={Math.min(draft.x0, draft.x1) * 100 + '%'} style:top={Math.min(draft.y0, draft.y1) * 100 + '%'} style:width={Math.abs(draft.x1 - draft.x0) * 100 + '%'} style:height={Math.abs(draft.y1 - draft.y0) * 100 + '%'} style:--c={app.style.stroke}></div>
    {/if}
  {/if}
</div>

<style>
  .ov { position: absolute; inset: 0; }
  .item, .note, .mk, .shape :global(.hit), .shape .hd { pointer-events: auto; }
  .item { position: absolute; box-sizing: border-box; cursor: move; }
  .item.sel { outline: 1.5px solid var(--accent); outline-offset: 2px; }
  .fillbox { position: absolute; inset: 0; box-sizing: border-box; }
  .fillbox.round { border-radius: 50%; }
  .item img { width: 100%; height: 100%; display: block; pointer-events: none; }
  .redactbox { position: absolute; inset: 0; background: repeating-linear-gradient(-45deg, rgba(0, 0, 0, 0.88), rgba(0, 0, 0, 0.88) 6px, rgba(40, 40, 40, 0.88) 6px, rgba(40, 40, 40, 0.88) 12px); display: grid; place-items: center; overflow: hidden; }
  .redactbox span { color: #fff; font-size: 10px; font-weight: 600; letter-spacing: 0.04em; white-space: nowrap; opacity: 0.8; }
  .whitebox { position: absolute; inset: 0; background: #fff; box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.15); }
  .linkbox { position: absolute; inset: 0; border: 1.5px dashed #1F4FD1; background: rgba(31, 79, 209, 0.08); display: flex; align-items: flex-start; gap: 4px; padding: 2px 4px; color: #1F4FD1; font-size: 10px; overflow: hidden; }
  .linkbox span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .fieldbox { position: absolute; inset: 0; border: 1px solid #7C8BA6; background: rgba(230, 238, 255, 0.85); display: flex; align-items: center; padding: 0 4px; color: #3A4A66; font-size: 10px; overflow: hidden; }
  .fieldbox.small { justify-content: center; padding: 0; }
  .cover { position: absolute; inset: -1px -2px; background: #fff; }
  .tx { position: relative; outline: none; white-space: pre-wrap; word-break: break-word; font-family: "Liberation Sans", Arial, Helvetica, sans-serif; line-height: 1.2; min-height: 1em; cursor: text; }
  .item.textedit .tx { white-space: nowrap; }
  .item.textedit .tx.multi { white-space: pre-wrap; overflow-wrap: anywhere; width: 100%; }
  .item.text .tx:empty::before { content: 'Text eingeben'; color: rgba(0, 0, 0, 0.35); }
  .tools { position: absolute; bottom: calc(100% + 8px); left: -2px; display: flex; align-items: center; gap: 1px; padding: 2px; background: var(--surface); border-radius: 7px; box-shadow: var(--shadow-pop); z-index: 3; white-space: nowrap; }
  .tools button { border: 0; background: none; height: 22px; min-width: 24px; padding: 0 5px; border-radius: 5px; font-size: 11.5px; color: var(--text); display: grid; place-items: center; }
  .tools button:hover { background: var(--hover); }
  .tools button.on { background: var(--accent-soft); color: var(--accent-text); }
  .tools .del:hover { color: var(--danger); }
  .tools input[type=color] { width: 22px; height: 20px; border: 0; padding: 0; background: none; }
  .rs { position: absolute; right: -6px; bottom: -6px; width: 11px; height: 11px; border-radius: 50%; background: var(--surface); border: 1.5px solid var(--accent); cursor: nwse-resize; }
  .shape { position: absolute; overflow: visible; pointer-events: none; }
  .shape :global(.hit) { cursor: move; }
  .shape .hd { fill: var(--surface); stroke: var(--accent); stroke-width: 1.5; cursor: grab; }
  .shape.sel line:first-child { filter: drop-shadow(0 0 2px var(--accent)); }
  .mk { position: absolute; cursor: move; }
  .mk.underline { border-bottom: 2px solid var(--c); }
  .mk.strike::after { content: ''; position: absolute; left: 0; right: 0; top: 50%; border-top: 2px solid var(--c); }
  .mk.sel { outline: 1px dashed var(--accent); }
  .note { position: absolute; transform: translate(-30%, -30%); color: #B8860B; cursor: move; filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3)); }
  .note :global(svg) { fill: #FFE16B; }
  .note.sel :global(svg) { stroke: var(--accent); }
  .note .pop { position: absolute; left: 100%; top: 0; margin-left: 6px; width: 220px; background: #FFF7C2; border-radius: 6px; box-shadow: var(--shadow-pop); padding: 6px; cursor: default; color: #222; }
  .note .pop textarea { background: transparent; border: 0; box-shadow: none; min-height: 70px; color: #222; font-size: 12.5px; }
  .note .pop .by { font-size: 10.5px; color: #8a7a2a; padding: 2px 4px 0; }
  .draft { position: absolute; border: 1.5px solid var(--c); background: color-mix(in srgb, var(--c) 10%, transparent); }
  .draft.round { border-radius: 50%; }
  .draft.redact { background: rgba(0, 0, 0, 0.6); border-color: #000; }
  .draft.whiteout { background: #fff; border-color: #999; }
  .draft.link { border: 1.5px dashed #1F4FD1; background: rgba(31, 79, 209, 0.08); }
  .draft.field { border: 1px solid #7C8BA6; background: rgba(230, 238, 255, 0.8); }
</style>
