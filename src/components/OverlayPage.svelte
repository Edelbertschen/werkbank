<script lang="ts">
  import { L, intlLocale } from '../lib/i18n';
  import { onMount, tick } from 'svelte';
  import { app, active } from '../lib/app.svelte';
  import { overlay, itemsOf, addItem, removeItem, commitItem, type OItem } from '../lib/overlay.svelte';
  import { pageObjects, liftAnnotation, type PageObject } from '../lib/pageobjects';
  import { toast } from '../lib/app.svelte';
  import { dialog } from '../lib/dialogs.svelte';
  import * as I from '../lib/icons';
  import { groupLines, paragraphAt, classifyFont, FONT_STACK, type Box, type FontStyle } from '../lib/textedit';
  import { previewFamily } from '../lib/sysfonts';
  import TextToolbar, { trackSelection } from './TextToolbar.svelte';
  import { BUILTIN_STACK, escapeHtml } from '../lib/richtext';
  import { embeddedFontCovers } from '../lib/pageobjects';

  let { index }: { index: number } = $props();
  let host: HTMLDivElement;
  let k = $state(1); // Bildschirmpixel je pt
  const doc = $derived(active());
  const page = $derived(doc?.pages[index]);
  const items = $derived(doc ? itemsOf(doc).filter(i => i.page === index) : []);
  let draft = $state<null | { kind: string; x0: number; y0: number; x1: number; y1: number }>(null);

  // ---------------- Elemente verschieben: Inhalte des PDFs ----------------
  const moving = $derived(app.mode === 'move');
  let objs = $state<PageObject[]>([]);
  $effect(() => {
    if (!moving || !doc) { objs = []; return; }
    const bytes = doc.bytes, pno = index;
    pageObjects(bytes, pno).then(o => { if (doc?.bytes === bytes) objs = o; });
  });
  const same = (a: number, b: number) => Math.abs(a - b) < 1e-6;
  // Bereits angefasste Inhalte werden als Element dargestellt, nicht mehr als Rahmen
  const freeObjs = $derived(objs.filter(o => !items.some(i => i.kind === 'move' && same(i.ox, o.x) && same(i.oy, o.y) && same(i.ow, o.w))).sort((a, b) => +(a.sub === 'annot') - +(b.sub === 'annot')));

  /** Ausschnitt der gerenderten Seite als Vorschau des angefassten Inhalts */
  function snapshot(o: PageObject): string {
    const cv = (host.closest('.page') as HTMLElement)?.querySelector('canvas') as HTMLCanvasElement | null;
    if (!cv) return '';
    const sx = o.x * cv.width, sy = o.y * cv.height, sw = Math.max(1, o.w * cv.width), sh = Math.max(1, o.h * cv.height);
    const c = document.createElement('canvas'); c.width = Math.round(sw); c.height = Math.round(sh);
    c.getContext('2d')!.drawImage(cv, sx, sy, sw, sh, 0, 0, c.width, c.height);
    try { return c.toDataURL('image/png'); } catch { return ''; }
  }
  /** Anmerkung aus dem PDF anfassen: wird zum Element; gezogen wird, sobald sie bereitsteht */
  let lifting = false;
  async function liftAnnot(e: PointerEvent, o: PageObject) {
    if (!doc || lifting) return;
    lifting = true;
    const d = doc;
    // Bewegung während der Umwandlung festhalten
    let down = true, last = { clientX: e.clientX, clientY: e.clientY };
    const rect = host.getBoundingClientRect(); // Lage der Seite bleibt beim Neuzeichnen gleich
    const track = (ev: PointerEvent) => { last = { clientX: ev.clientX, clientY: ev.clientY }; };
    const release = (ev: PointerEvent) => { track(ev); down = false; };
    addEventListener('pointermove', track); addEventListener('pointerup', release);
    try {
      const { item, bytes } = await liftAnnotation(d.bytes, index, o.xref!);
      await d.replaceBase(bytes);
      const it = addItem(d, { ...item, origin: item } as any, { pending: true });
      const live = itemsOf(d).find(i => i.id === it.id)!;
      const moved = Math.hypot(last.clientX - e.clientX, last.clientY - e.clientY) > 3;
      removeEventListener('pointermove', track); removeEventListener('pointerup', release);
      if (down || moved) startDrag(e, live, 'move', host, { moved: moved ? last : undefined, released: !down, rect });
    } catch (err: any) {
      toast(L(String(err?.message || err)), { kind: 'error' });
    } finally {
      lifting = false;
      removeEventListener('pointermove', track); removeEventListener('pointerup', release);
    }
  }
  async function lift(e: PointerEvent, o: PageObject) {
    if (!doc || e.button !== 0) return;
    e.stopPropagation(); e.preventDefault();
    if (o.sub === 'annot') return liftAnnot(e, o);
    const it = addItem(doc, { page: index, kind: 'move', sub: o.sub, x: o.x, y: o.y, w: o.w, h: o.h, ox: o.x, oy: o.y, ow: o.w, oh: o.h, xref: o.xref, fonts: o.fonts, snap: snapshot(o) } as any, { pending: true });
    const live = itemsOf(doc).find(i => i.id === it.id)!;
    startDrag(e, live, 'move', host);
  }

  onMount(() => {
    trackSelection();
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
    if (m === 'ink') {
      e.preventDefault();
      host.setPointerCapture(e.pointerId);
      ink = [[p.x, p.y]];
      return;
    }
    if (RECT_MODES[m] || m === 'shape:line' || m === 'shape:arrow') {
      e.preventDefault();
      host.setPointerCapture(e.pointerId);
      draft = { kind: RECT_MODES[m] || (m === 'shape:line' ? 'line' : 'arrow'), x0: p.x, y0: p.y, x1: p.x, y1: p.y };
      return;
    }
    if (m === 'note') {
      const it = addItem(doc, { page: index, kind: 'note', x: p.x, y: p.y, text: '', color: '#F2B705' } as any, { pending: true });
      overlay.editing = it.id;
      e.preventDefault();
      return;
    }
    if (m === 'text:add' || m === 'comment:text') {
      e.preventDefault(); // sonst nimmt der Browser dem neuen Textfeld sofort den Fokus wieder
      const it = addItem(doc, { page: index, kind: m === 'text:add' ? 'text' : 'comment', x: p.x, y: p.y - (app.style.fontSize * 0.55) / page!.h, w: Math.min(m === 'text:add' ? 0.5 : 0.32, 0.98 - p.x), text: '', size: app.style.fontSize, color: app.style.textColor, bold: false } as any, { pending: true });
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
  let ink = $state<number[][] | null>(null);
  function onMove(e: PointerEvent) {
    if (ink) {
      const p = frac(e), last = ink[ink.length - 1];
      if (Math.hypot((p.x - last[0]) * page!.w, (p.y - last[1]) * page!.h) >= 1.2) ink.push([Math.max(0, Math.min(1, p.x)), Math.max(0, Math.min(1, p.y))]);
      return;
    }
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
    if (ink && doc) {
      const pts = ink; ink = null;
      if (pts.length > 1) addItem(doc, { page: index, kind: 'ink', paths: [pts], stroke: app.style.ink, width: app.style.inkWidth, opacity: 1 } as any);
      return;
    }
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
    const text = (multi ? para.box.text : lines[iHit].text).normalize('NFC');
    const lineH = multi ? para.lineHeight : bottom - top;
    const glyphH = Math.min(...(multi ? para.lines : [lines[iHit]]).map(l => l.height));
    const sizePt = glyphH / k * 0.92;
    // Textfarbe aus dem Seitenbild schätzen
    const color = await sampleColor(pageEl, left, top, right, bottom);
    const fx = (left - hr.left) / hr.width, fy = (top - hr.top) / hr.height, fw = (right - left) / hr.width, fh = (bottom - top) / hr.height;
    const it = addItem(doc, { page: index, kind: 'textedit', x: fx, y: fy, w: fw, h: fh, text, orig: text, size: Math.max(4, Math.round(sizePt * 10) / 10), color, bold: false, multi, lineHeight: lineH / k, origSize: Math.max(4, Math.round(sizePt * 10) / 10), origBold: false, origColor: color } as any, { pending: true });
    overlay.editing = it.id;
    await tick(); focusText(it.id, true);
    // Schrift des Originals nachziehen, ohne das Tippen aufzuhalten
    const d = doc;
    fontAt(fx, fy, fx + fw, fy + fh).then(f => {
      const live = itemsOf(d).find(x => x.id === it.id) as any;
      if (!live) return;
      live.bold = f.bold; live.italic = f.italic; live.family = f.family; live.fontName = f.name;
      live.origSize = live.size; live.origBold = f.bold; live.origItalic = f.italic; live.origColor = live.color;
      // Welche Schrift wird geschrieben? Eingebettet (vollständig) > installiert > Ersatz – sichtbar in Leiste und am Text
      Promise.all([
        f.name ? previewFamily(f.name, f.bold, f.italic) : Promise.resolve(null),
        embeddedFontCovers(d.bytes, index, { x: fx, y: fy, w: fw, h: fh }, text).catch(() => ({ complete: false })),
      ]).then(([fam, emb]) => {
        if (fam) live.css = fam;
        live.fstate = emb.complete ? 'original' : fam ? 'installed' : 'substitute';
      });
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
  function startDrag(e: PointerEvent, it: OItem, mode: 'move' | 'resize' | 'p1' | 'p2', capture?: HTMLElement, opts: { moved?: { clientX: number; clientY: number }; released?: boolean; rect?: DOMRect } = {}) {
    if (e.button !== 0) return;
    if (overlay.editing === it.id) return; // im Text wird markiert, nicht gezogen
    e.stopPropagation(); e.preventDefault();
    overlay.selected = it.id;
    // Nach dem Neuzeichnen der Seite (angefasste Anmerkung) gilt die neue Overlay-Ebene dieser Seite
    const h = host.isConnected ? host : (document.querySelector(`.page[data-page-number="${index + 1}"] .ov`) as HTMLElement | null) || host;
    const r = opts.rect || h.getBoundingClientRect(); const sx = e.clientX, sy = e.clientY;
    const o = JSON.parse(JSON.stringify(it));
    const t0 = capture || (e.currentTarget as HTMLElement);
    const target: HTMLElement | Window = t0?.isConnected ? t0 : window;
    try { if (target !== window) (target as HTMLElement).setPointerCapture(e.pointerId); } catch { /* Zeiger schon losgelassen */ }
    const ratio = it.kind === 'image' || (it.kind === 'move' && it.sub === 'image') ? ((it as any).h * page!.h) / ((it as any).w * page!.w) : 0;
    const mv = (ev: any) => {
      const dx = (ev.clientX - sx) / r.width, dy = (ev.clientY - sy) / r.height;
      const a: any = it;
      if (it.kind === 'line' || it.kind === 'arrow') {
        if (mode === 'move' || mode === 'p1') { a.x1 = o.x1 + dx; a.y1 = o.y1 + dy; }
        if (mode === 'move' || mode === 'p2') { a.x2 = o.x2 + dx; a.y2 = o.y2 + dy; }
      } else if (it.kind === 'underline' || it.kind === 'strike' || it.kind === 'highlight') {
        a.rects = o.rects.map((q: number[]) => [q[0] + dx, q[1] + dy, q[2], q[3]]);
      } else if (it.kind === 'ink') {
        a.paths = o.paths.map((ps: number[][]) => ps.map(([x, y]) => [x + dx, y + dy]));
      } else if (mode === 'move') { a.x = o.x + dx; a.y = o.y + dy; }
      else {
        a.w = Math.max(0.01, o.w + dx);
        if ('h' in o) a.h = ratio ? (a.w * page!.w * ratio) / page!.h : Math.max(0.006, o.h + dy);
      }
    };
    const d0 = doc;
    const up = () => { target.removeEventListener('pointermove', mv); target.removeEventListener('pointerup', up); if (d0) commitItem(d0, it); };
    // Schon geschehene Bewegung (während eine Anmerkung angefasst wurde) nachholen
    if (opts.moved) mv(opts.moved);
    if (opts.released) { if (d0) commitItem(d0, it); return; }
    target.addEventListener('pointermove', mv); target.addEventListener('pointerup', up);
  }

  async function edit(it: OItem) {
    if (!doc) return;
    if (it.kind === 'link') { const r = await linkDialog(it); if (r) { Object.assign(it, r); commitItem(doc, it); } }
    else if (it.kind === 'field') { const r = await fieldDialog(it.ftype, it); if (r) { Object.assign(it, r); commitItem(doc, it); } }
    else if (it.kind === 'text' || it.kind === 'comment' || it.kind === 'textedit' || it.kind === 'note') {
      if (overlay.editing === it.id) return; // schon in Bearbeitung: Doppelklick markiert ein Wort
      overlay.editing = it.id; await tick(); focusText(it.id);
    }
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

  // Elemente ohne eigenen Rahmen (Linien, Freihand, Markierungen, Notizen) bekommen eine schwebende Leiste
  const FLOATING = new Set(['line', 'arrow', 'ink', 'highlight', 'underline', 'strike', 'note']);
  const floating = $derived(items.find(i => i.id === overlay.selected && FLOATING.has(i.kind)) || null);
  function bboxOf(it: any): { x: number; y: number } {
    const pts: number[][] = it.kind === 'ink' ? it.paths.flat() : 'x1' in it ? [[it.x1, it.y1], [it.x2, it.y2]] : it.rects ? it.rects.map((q: number[]) => [q[0], q[1]]) : [[it.x, it.y]];
    const x = Math.min(...pts.map(p => p[0])), y = Math.min(...pts.map(p => p[1]));
    return { x, y: Math.max(0, y - 30 / (page!.h * k)) };
  }
  /** Freihand als geglätteter Pfad (Mittelpunkte als Stützstellen) */
  function inkPath(paths: number[][][]) {
    return paths.map(ps => {
      const P = ps.map(([x, y]) => [pt(x, 'x') * k, pt(y, 'y') * k]);
      if (P.length < 3) return `M${P.map(p => p.join(',')).join(' L')}`;
      let d = `M${P[0][0]},${P[0][1]}`;
      for (let i = 1; i < P.length - 1; i++) d += ` Q${P[i][0]},${P[i][1]} ${(P[i][0] + P[i + 1][0]) / 2},${(P[i][1] + P[i + 1][1]) / 2}`;
      return d + ` L${P[P.length - 1][0]},${P[P.length - 1][1]}`;
    }).join(' ');
  }
  function arrowPath(it: any) {
    const x1 = pt(it.x1, 'x') * k, y1 = pt(it.y1, 'y') * k, x2 = pt(it.x2, 'x') * k, y2 = pt(it.y2, 'y') * k;
    const a = Math.atan2(y2 - y1, x2 - x1), len = Math.max(8, it.width * 4) * k;
    return `M${x2 - len * Math.cos(a - 0.45)},${y2 - len * Math.sin(a - 0.45)} L${x2},${y2} L${x2 - len * Math.cos(a + 0.45)},${y2 - len * Math.sin(a + 0.45)}`;
  }
  /** Inhalt eines editierbaren Feldes nur einmal setzen, damit der Cursor beim Tippen bleibt */
  /** Inhalt eines editierbaren Feldes setzen – beim Tippen nicht anfassen (Cursor), nach Rückgängig/Formatierung neu */
  function initText(node: HTMLElement, v: { text: string; html?: string; rev?: number }) {
    const set = (x: typeof v) => { if (x.html != null) node.innerHTML = x.html; else node.textContent = x.text; };
    set(v);
    return { update(x: typeof v) { if (document.activeElement !== node && (x.html ?? escapeHtml(x.text)) !== node.innerHTML) set(x); } };
  }
  /** Schrift der Vorschau: gewählte, sonst installierte Originalschrift, sonst ähnlicher Stapel */
  function fontCss(it: any): string | null {
    if (it.fontChoice) return it.choiceCss ? `"${it.choiceCss}", ${BUILTIN_STACK.Helvetica}` : BUILTIN_STACK[it.fontChoice] || null;
    if (it.kind === 'textedit') return (it.css ? `"${it.css}", ` : '') + FONT_STACK[(it.family || 'sans') as 'sans'];
    return null;
  }
  const FIELD_LABEL: Record<string, string> = { text: L("Textfeld"), check: '☐', radio: '◯', choice: L("Auswahl ▾"), signature: L("Unterschrift") };
</script>

<div class="ov" bind:this={host} onpointerdown={onDown} onpointermove={onMove} onpointerup={onUp} role="presentation">
  {#if moving}
    {#each freeObjs as o (o.sub + o.x + ':' + o.y)}
      <div class="obj {o.sub}" style:left={o.x * 100 + '%'} style:top={o.y * 100 + '%'} style:width={o.w * 100 + '%'} style:height={o.h * 100 + '%'}
        title={o.sub === 'image' ? L("Bild") : o.sub === 'annot' ? (o.text || L("Anmerkung")) : o.text} onpointerdown={e => lift(e, o)} role="presentation"></div>
    {/each}
  {/if}
  {#each items.filter(i => i.kind === 'move') as it (it.id + ':cover')}
    {@const m = it as any}
    <div class="mvcover" style:left={m.ox * 100 + '%'} style:top={m.oy * 100 + '%'} style:width={m.ow * 100 + '%'} style:height={m.oh * 100 + '%'}></div>
  {/each}
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
    {:else if it.kind === 'ink'}
      <svg class="shape" class:sel style="left:0;top:0;width:100%;height:100%" role="presentation">
        <path d={inkPath(it.paths)} fill="none" stroke={it.stroke} stroke-width={Math.max(1, it.width * k)} stroke-linecap="round" stroke-linejoin="round" opacity={it.opacity} />
        <path class="hit" d={inkPath(it.paths)} fill="none" stroke="transparent" stroke-width="12" onpointerdown={e => startDrag(e, it, 'move')} role="presentation" />
      </svg>
    {:else if it.kind === 'underline' || it.kind === 'strike' || it.kind === 'highlight'}
      {#each it.rects as q, qi (qi)}
        <div class="mk {it.kind}" style:left={q[0] * 100 + '%'} style:top={q[1] * 100 + '%'} style:width={q[2] * 100 + '%'} style:height={q[3] * 100 + '%'} style:--c={it.color}
          class:sel onpointerdown={e => startDrag(e, it, 'move')} role="presentation"></div>
      {/each}
    {:else if it.kind === 'note'}
      <div class="note" class:sel data-id={it.id} style:left={it.x * 100 + '%'} style:top={it.y * 100 + '%'} onpointerdown={e => startDrag(e, it, 'move')} ondblclick={() => edit(it)} role="presentation">
        <I.StickyNote size={Math.max(14, 18 * k)} strokeWidth={1.6} />
        {#if overlay.editing === it.id || sel}
          <div class="pop" onpointerdown={e => e.stopPropagation()} role="presentation">
            <textarea class="textarea tx" placeholder={L("Notiz schreiben …")} bind:value={it.text} rows="4" onblur={() => { if (it.text.trim()) commitItem(doc!, it); }}></textarea>
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
        {:else if it.kind === 'move'}
          {#if !it.remove && it.snap}<img src={it.snap} alt="" draggable="false" />{/if}
        {:else if it.kind === 'redact'}
          <div class="redactbox"><span>{L("Wird geschwärzt")}</span></div>
        {:else if it.kind === 'whiteout'}
          <div class="whitebox"></div>
        {:else if it.kind === 'link'}
          <div class="linkbox"><I.Link size={12} /><span>{it.url || L("Seite {0}", it.toPage)}</span></div>
        {:else if it.kind === 'field'}
          <div class="fieldbox" class:small={it.ftype === 'check' || it.ftype === 'radio'}><span>{it.ftype === 'check' || it.ftype === 'radio' ? FIELD_LABEL[it.ftype] : it.name}</span></div>
        {:else if it.kind === 'text' || it.kind === 'comment' || it.kind === 'textedit'}
          {#if it.kind === 'textedit'}<div class="cover"></div>{/if}
          {#if it.kind === 'textedit' && !(it as any).fontChoice && (it as any).fstate === 'substitute'}<span class="subst" title={L("Die Originalschrift ist nicht verfügbar – es wird eine Ersatzschrift verwendet.")}>{L("Ersatzschrift")}</span>{/if}
          <div class="tx" contenteditable={!moving || overlay.editing === it.id ? 'true' : 'false'} spellcheck="false" role="textbox" tabindex="0"
            style:font-size={it.size * k + 'px'} style:color={it.color} style:font-weight={it.bold ? 700 : 400} style:font-style={(it as any).italic ? 'italic' : null}
            style:text-decoration={(it as any).underline ? 'underline' : null} style:text-align={(it as any).align || null}
            style:font-family={fontCss(it)} style:line-height={(it as any).lh ? (it as any).lh : it.kind === 'textedit' ? ((it as any).multi ? (it as any).lineHeight * k : box.h * page!.h * k) + 'px' : 1.2}
            class:multi={(it as any).multi} class:plain={it.kind === 'comment' && (it as any).fill === 'transparent'}
            onpointerdown={e => { if (moving && overlay.editing !== it.id) return; e.stopPropagation(); overlay.selected = it.id; }}
            onfocus={() => { overlay.selected = it.id; if (!moving) overlay.editing = it.id; }}
            oninput={e => { const el = e.target as HTMLElement; it.text = el.innerText.replace(/\n$/, ''); if (it.kind !== 'comment') (it as any).html = el.innerHTML; }}
            onpaste={e => { e.preventDefault(); const t = e.clipboardData?.getData('text/plain') || ''; document.execCommand('insertText', false, t); }}
            onblur={e => { overlay.editing = null; if (it.kind === 'comment') (it as any).h = (e.currentTarget as HTMLElement).offsetHeight / host.clientHeight; if (!it.text.trim() && it.kind !== 'textedit') removeItem(doc!, it.id); else commitItem(doc!, it); }}
            use:initText={{ text: it.text, html: (it as any).html, rev: (it as any).htmlRev }}></div>
        {/if}
        {#if sel && (it.kind === 'text' || it.kind === 'textedit')}
          <TextToolbar doc={doc!} {it} editor={() => host.querySelector(`[data-id="${it.id}"] .tx`)} />
        {:else if sel}
          <div class="tools" onpointerdown={e => e.stopPropagation()} role="toolbar" aria-label={L("Element")}>
            {#if it.kind === 'comment'}
              <button title={L("Kleiner")} aria-label={L("Kleiner")} onclick={() => { it.size = Math.max(4, +(it.size - 1).toFixed(1)); commitItem(doc!, it); }}>A−</button>
              <button title={L("Größer")} aria-label={L("Größer")} onclick={() => { it.size = +(it.size + 1).toFixed(1); commitItem(doc!, it); }}>A+</button>
              <button title={L("Fett")} aria-label={L("Fett")} class:on={it.bold} onclick={() => { it.bold = !it.bold; commitItem(doc!, it); }}><b>B</b></button>
              <input type="color" title={L("Farbe")} aria-label={L("Textfarbe")} value={it.color} oninput={e => (it.color = (e.target as HTMLInputElement).value)} onchange={() => commitItem(doc!, it)} />
            {/if}
            {#if it.kind === 'rect' || it.kind === 'ellipse'}
              <input type="color" title={L("Farbe")} aria-label={L("Farbe")} value={it.stroke}
                oninput={e => (it.stroke = (e.target as HTMLInputElement).value)} onchange={() => commitItem(doc!, it)} />
            {/if}
            {#if it.kind === 'link' || it.kind === 'field'}<button title={L("Bearbeiten")} aria-label={L("Bearbeiten")} onclick={() => edit(it)}><I.Settings size={12} /></button>{/if}
            <button class="del" title={L("Entfernen (Entf)")} aria-label={L("Entfernen")} onclick={() => { if (it.kind === 'move') { it.remove = true; commitItem(doc!, it); } else removeItem(doc!, it.id); }}><I.Trash2 size={12} /></button>
          </div>
          {#if it.kind !== 'text' && it.kind !== 'comment' && it.kind !== 'textedit' && !(it.kind === 'move' && (it.sub === 'text' || it.remove))}<div class="rs" onpointerdown={e => startDrag(e, it, 'resize')} role="presentation"></div>{/if}
        {/if}
      </div>
    {/if}
  {/each}
  {#if floating}
    {@const fb = bboxOf(floating)}
    {@const f = floating as any}
    <div class="tools floating" style:left={fb.x * 100 + '%'} style:top={fb.y * 100 + '%'} onpointerdown={e => e.stopPropagation()} role="toolbar" aria-label={L("Element")}>
      <input type="color" title={L("Farbe")} aria-label={L("Farbe")} value={'stroke' in f ? f.stroke : f.color}
        oninput={e => { const v = (e.target as HTMLInputElement).value; if ('stroke' in f) f.stroke = v; else f.color = v; }} onchange={() => commitItem(doc!, floating!)} />
      <button class="del" title={L("Entfernen (Entf)")} aria-label={L("Entfernen")} onclick={() => removeItem(doc!, floating!.id)}><I.Trash2 size={12} /></button>
    </div>
  {/if}
  {#if ink}
    <svg class="shape" style="left:0;top:0;width:100%;height:100%"><path d={inkPath([ink])} fill="none" stroke={app.style.ink} stroke-width={Math.max(1, app.style.inkWidth * k)} stroke-linecap="round" stroke-linejoin="round" /></svg>
  {/if}
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
  .obj { position: absolute; pointer-events: auto; cursor: move; border-radius: 2px; outline: 1px dashed transparent; outline-offset: 1px; }
  .obj:hover { outline-color: var(--accent); background: color-mix(in srgb, var(--accent) 7%, transparent); }
  .mvcover { position: absolute; background: #fff; pointer-events: none; }
  .item.move img { width: 100%; height: 100%; display: block; pointer-events: none; }
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
  .subst { position: absolute; right: -2px; top: -18px; font-size: 10px; padding: 1px 6px; border-radius: 999px; background: color-mix(in srgb, #f08c00 22%, var(--surface)); color: #8a5000; pointer-events: none; white-space: nowrap; }
  .item.textedit:has(.subst) { outline: 1.5px dashed #f08c00; outline-offset: 2px; }
  .tools.floating { bottom: auto; pointer-events: auto; }
  .mk.highlight { background: var(--c); opacity: 0.42; mix-blend-mode: multiply; }
  .item.comment .tx { background: #fffad1; border: 1px solid #d9bf59; border-radius: 2px; padding: 2px 4px; color: #222; }
  .item.comment .tx.plain { background: none; border-color: transparent; }
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
