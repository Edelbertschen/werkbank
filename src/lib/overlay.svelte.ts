// Elemente, die im Viewer auf Seiten gelegt werden, bevor sie ins PDF geschrieben werden.
// Koordinaten: Anteile (0..1) der angezeigten Seite, Ursprung oben links.
import type { Doc } from './doc.svelte';
import { app, toast } from './app.svelte';
import { plLoad, plSave, geom, embedFont, wrapText, safeText, color, degrees, rgb } from './ops';
import { pyRun } from './engines';
import { uid, dataUrlToBytes, hexToRgb01 } from './util';

import { L } from './i18n';
interface Base { id: string; page: number }
export type OItem = Base & (
  | { kind: 'rect' | 'ellipse'; x: number; y: number; w: number; h: number; stroke: string; fill: string; width: number; opacity: number }
  | { kind: 'line' | 'arrow'; x1: number; y1: number; x2: number; y2: number; stroke: string; width: number; opacity: number }
  | { kind: 'note'; x: number; y: number; text: string; color: string }
  | { kind: 'image'; x: number; y: number; w: number; h: number; src: string; role: 'sign' | 'stamp' | 'image' }
  | { kind: 'redact' | 'whiteout'; x: number; y: number; w: number; h: number }
  | { kind: 'text'; x: number; y: number; w: number; text: string; size: number; color: string; bold: boolean }
  | { kind: 'textedit'; x: number; y: number; w: number; h: number; text: string; orig: string; size: number; color: string; bold: boolean }
  | { kind: 'link'; x: number; y: number; w: number; h: number; url: string; toPage: number }
  | { kind: 'field'; ftype: 'text' | 'check' | 'radio' | 'choice' | 'signature'; x: number; y: number; w: number; h: number; name: string; options: string; multiline: boolean; group: string }
  | { kind: 'underline' | 'strike'; rects: [number, number, number, number][]; color: string }
);

export const overlay = $state({
  items: {} as Record<string, OItem[]>,
  selected: null as string | null,
  editing: null as string | null,
  undoLast(doc: Doc) {
    const list = overlay.items[doc.id];
    if (!list?.length) return;
    list.pop();
    overlay.selected = null;
    sync(doc);
  },
});

function sync(doc: Doc) { doc.overlayCount = overlay.items[doc.id]?.length || 0; }
const EMPTY: OItem[] = [];
/** Lesen ohne Zustandsänderung (sicher in Templates/$derived) */
export function itemsOf(doc: Doc): OItem[] { return overlay.items[doc.id] || EMPTY; }
function listOf(doc: Doc): OItem[] {
  // Wichtig: erst zuweisen, dann neu lesen – nur der gelesene Wert ist der reaktive Proxy
  if (!overlay.items[doc.id]) overlay.items[doc.id] = [];
  return overlay.items[doc.id];
}
export function addItem(doc: Doc, item: Omit<OItem, 'id'> & { id?: string }) {
  const it = { ...item, id: item.id || uid() } as OItem;
  listOf(doc).push(it);
  overlay.selected = it.id;
  sync(doc);
  return it;
}
export function removeItem(doc: Doc, id: string) {
  const list = listOf(doc);
  const i = list.findIndex(x => x.id === id);
  if (i >= 0) list.splice(i, 1);
  if (overlay.selected === id) overlay.selected = null;
  sync(doc);
}
export function clearOverlay(doc: Doc) { overlay.items[doc.id] = []; overlay.selected = null; sync(doc); }
export function findItem(doc: Doc, id: string | null) { return id ? itemsOf(doc).find(x => x.id === id) || null : null; }

const PY_KINDS = new Set(['rect', 'ellipse', 'line', 'arrow', 'note', 'redact', 'textedit', 'link', 'underline', 'strike']);

const applying = new Map<string, Promise<void>>();
/** Alle offenen Overlay-Elemente ins PDF schreiben (ein neuer Stand). Doppelte Aufrufe teilen sich einen Durchlauf. */
export function applyOverlay(doc: Doc): Promise<void> {
  const running = applying.get(doc.id);
  if (running) return running;
  const p = applyOverlayNow(doc).finally(() => applying.delete(doc.id));
  applying.set(doc.id, p);
  return p;
}
async function applyOverlayNow(doc: Doc) {
  const all = [...itemsOf(doc)];
  // leere Textfelder (angeklickt, nichts geschrieben) ignorieren
  const items = all.filter(i => !((i.kind === 'text' || i.kind === 'textedit') && !(i as any).text?.trim()));
  if (!items.length) { overlay.items[doc.id] = []; sync(doc); return; }
  let bytes = doc.bytes;
  const contentItems = items.filter(i => !PY_KINDS.has(i.kind));
  const pyItems = items.filter(i => PY_KINDS.has(i.kind));

  if (contentItems.length) bytes = await bakeContent(bytes, contentItems);
  if (pyItems.length) bytes = await bakeWithMuPdf(bytes, pyItems);

  overlay.items[doc.id] = [];
  overlay.selected = null;
  sync(doc);
  const redactions = items.filter(i => i.kind === 'redact').length;
  const label = redactions === items.length ? L("{0} {1} geschwärzt", redactions, redactions === 1 ? L("Stelle") : L("Stellen"))
    : items.length === 1 ? labelOf(items[0])
    : L("{0} Änderungen übernommen{1}", items.length, redactions ? L(", davon {0} geschwärzt", redactions) : '');
  await doc.commit(bytes, label);
  app.viewerRev++;
}

function labelOf(it: OItem) {
  return ({ rect: L("Rechteck"), ellipse: L("Ellipse"), line: L("Linie"), arrow: L("Pfeil"), note: L("Notiz"), image: L("Bild"), redact: L("Schwärzung"), whiteout: L("Abdeckung"), text: 'Text', textedit: L("Text geändert"), link: 'Link', field: L("Formularfeld"), underline: L("Unterstreichung"), strike: L("Durchstreichung") } as any)[it.kind] + L(" eingefügt");
}

async function bakeContent(bytes: Uint8Array, items: OItem[]) {
  const pl = await plLoad(bytes);
  const fonts: Record<string, any> = {};
  const font = async (bold: boolean) => (fonts[bold ? 'b' : 'r'] ||= await embedFont(pl, bold ? 'sans-bold' : 'sans'));
  const imgs = new Map<string, any>();
  const form = items.some(i => i.kind === 'field') ? pl.getForm() : null;
  const names = new Set(form ? form.getFields().map(f => f.getName()) : []);
  const uniq = (n: string) => { let s = n || L("Feld"), k = 2; while (names.has(s)) s = `${n || L("Feld")}_${k++}`; names.add(s); return s; };
  const radios = new Map<string, any>();

  for (const it of items) {
    const page = pl.getPage(it.page);
    const g = geom(page);
    const rot = degrees(g.r);
    if (it.kind === 'image') {
      let img = imgs.get(it.src);
      if (!img) { const b = dataUrlToBytes(it.src); img = it.src.startsWith('data:image/jpeg') ? await pl.embedJpg(b) : await pl.embedPng(b); imgs.set(it.src, img); }
      const W = it.w * g.dw, H = it.h * g.dh, p = g.map(it.x * g.dw, (it.y + it.h) * g.dh);
      page.drawImage(img, { x: p.x, y: p.y, width: W, height: H, rotate: rot });
    } else if (it.kind === 'whiteout') {
      const W = it.w * g.dw, H = it.h * g.dh, p = g.map(it.x * g.dw, (it.y + it.h) * g.dh);
      page.drawRectangle({ x: p.x, y: p.y, width: W, height: H, rotate: rot, color: rgb(1, 1, 1) });
    } else if (it.kind === 'text') {
      const f = await font(it.bold);
      const X = it.x * g.dw, Y = it.y * g.dh, W = it.w * g.dw;
      wrapText(f, it.size, safeText(f, it.text), W + 1).forEach((ln, k) => {
        const p = g.map(X, Y + it.size * (0.93 + 1.2 * k));
        page.drawText(ln, { x: p.x, y: p.y, size: it.size, font: f, color: color(it.color), rotate: rot });
      });
    } else if (it.kind === 'field' && form) {
      const a = g.map(it.x * g.dw, it.y * g.dh), b = g.map((it.x + it.w) * g.dw, (it.y + it.h) * g.dh);
      const r = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y), borderColor: rgb(0.55, 0.6, 0.68), borderWidth: 0.75, backgroundColor: rgb(0.95, 0.97, 1) };
      const helv = await font(false);
      if (it.ftype === 'text' || it.ftype === 'signature') {
        const f = form.createTextField(uniq(it.name || (it.ftype === 'signature' ? L("Unterschrift") : L("Textfeld"))));
        if (it.multiline) f.enableMultiline();
        f.addToPage(page, { ...r, font: helv });
      } else if (it.ftype === 'check') {
        form.createCheckBox(uniq(it.name || L("Kontrollkästchen"))).addToPage(page, r);
      } else if (it.ftype === 'choice') {
        const f = form.createDropdown(uniq(it.name || L("Auswahl")));
        const opts = it.options.split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
        if (opts.length) f.addOptions(opts);
        f.addToPage(page, { ...r, font: helv });
      } else if (it.ftype === 'radio') {
        const gname = it.group || L("Optionsgruppe");
        let grp = radios.get(gname);
        if (!grp) { try { grp = form.getRadioGroup(gname); } catch { grp = form.createRadioGroup(uniq(gname)); } radios.set(gname, grp); }
        grp.addOptionToPage(it.name || L("Option {0}", grp.getOptions().length + 1), page, r);
      }
    }
  }
  return plSave(pl);
}

async function bakeWithMuPdf(bytes: Uint8Array, items: OItem[]) {
  const author = app.prefs.author || '';
  const fontBytes: Record<string, Uint8Array> = items.some(i => i.kind === 'textedit')
    ? { 'sans.ttf': new Uint8Array(await (await fetch('/engines/pdfjs/standard_fonts/LiberationSans-Regular.ttf')).arrayBuffer()), 'sansb.ttf': new Uint8Array(await (await fetch('/engines/pdfjs/standard_fonts/LiberationSans-Bold.ttf')).arrayBuffer()) }
    : {};
  const data = items.map(i => ({ ...i, ...('stroke' in i ? { strokeRgb: hexToRgb01(i.stroke) } : {}), ...('fill' in i && i.fill && i.fill !== 'transparent' ? { fillRgb: hexToRgb01(i.fill) } : {}), ...('color' in i ? { colorRgb: hexToRgb01((i as any).color) } : {}) }));
  const r = await pyRun(`
items = json.loads(ARGS['items'])
author = ARGS['author']
doc = open_in()
redact_pages = set()
def P(page, fx, fy):
    W, H = page.rect.width, page.rect.height
    return pymupdf.Point(fx * W, fy * H) * page.derotation_matrix
def R(page, x, y, w, h):
    a = P(page, x, y); b = P(page, x + w, y + h)
    return pymupdf.Rect(min(a.x, b.x), min(a.y, b.y), max(a.x, b.x), max(a.y, b.y))
def finish(annot, it):
    annot.set_info(title=author)
    annot.update()
for it in items:
    page = doc[it['page']]
    k = it['kind']
    if k in ('rect', 'ellipse'):
        r = R(page, it['x'], it['y'], it['w'], it['h'])
        a = page.add_rect_annot(r) if k == 'rect' else page.add_circle_annot(r)
        a.set_border(width=it['width'])
        a.set_colors(stroke=it['strokeRgb'], fill=it.get('fillRgb'))
        a.set_opacity(it.get('opacity', 1))
        finish(a, it)
    elif k in ('line', 'arrow'):
        a = page.add_line_annot(P(page, it['x1'], it['y1']), P(page, it['x2'], it['y2']))
        a.set_border(width=it['width'])
        a.set_colors(stroke=it['strokeRgb'])
        if k == 'arrow':
            a.set_line_ends(pymupdf.PDF_ANNOT_LE_NONE, pymupdf.PDF_ANNOT_LE_OPEN_ARROW)
        a.set_opacity(it.get('opacity', 1))
        finish(a, it)
    elif k == 'note':
        a = page.add_text_annot(P(page, it['x'], it['y']), it['text'] or ' ', icon='Comment')
        a.set_colors(stroke=it['colorRgb'])
        finish(a, it)
    elif k in ('underline', 'strike'):
        quads = [R(page, *q).quad for q in it['rects']]
        a = page.add_underline_annot(quads) if k == 'underline' else page.add_strikeout_annot(quads)
        a.set_colors(stroke=it['colorRgb'])
        finish(a, it)
    elif k == 'link':
        r = R(page, it['x'], it['y'], it['w'], it['h'])
        if it.get('url'):
            page.insert_link({'kind': pymupdf.LINK_URI, 'from': r, 'uri': it['url']})
        else:
            page.insert_link({'kind': pymupdf.LINK_GOTO, 'from': r, 'page': max(0, min(doc.page_count - 1, int(it.get('toPage', 1)) - 1)), 'to': pymupdf.Point(0, 0)})
    elif k == 'redact':
        page.add_redact_annot(R(page, it['x'], it['y'], it['w'], it['h']), fill=(0, 0, 0))
        redact_pages.add(it['page'])
    elif k == 'textedit':
        r = R(page, it['x'], it['y'], it['w'], it['h'])
        page.add_redact_annot(r, fill=False)
        page.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE, graphics=pymupdf.PDF_REDACT_LINE_ART_NONE)
        ff = '/w/sansb.ttf' if it.get('bold') else '/w/sans.ttf'
        fname = 'WerkbankSansB' if it.get('bold') else 'WerkbankSans'
        if it.get('multi'):
            # Absatz: neu umbrechen. Passt der Text nicht, erst leicht verkleinern, dann den Kasten nach unten verlängern.
            size = it['size']
            lh = max(1.0, min(2.2, it.get('lineHeight', size * 1.2) / size))
            placed = False
            for f in (1.0, 0.95, 0.9, 0.85):
                rc = page.insert_textbox(r, it['text'], fontsize=size * f, fontname=fname, fontfile=ff, color=it['colorRgb'], rotate=page.rotation, lineheight=lh)
                if rc >= 0:
                    placed = True
                    break
            if not placed:
                grow = R(page, it['x'], it['y'], it['w'], min(1 - it['y'], it['h'] * 3))
                page.insert_textbox(grow, it['text'], fontsize=size * 0.85, fontname=fname, fontfile=ff, color=it['colorRgb'], rotate=page.rotation, lineheight=lh)
        else:
            base = P(page, it['x'], it['y'] + it['h'] * 0.80)
            page.insert_text(base, it['text'], fontsize=it['size'], fontname=fname, fontfile=ff, color=it['colorRgb'], rotate=page.rotation)
for pno in redact_pages:
    doc[pno].apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_PIXELS)
if any(it['kind'] == 'textedit' for it in items):
    try:
        doc.subset_fonts()
    except Exception:
        pass
save_out(doc)
len(items)
`, { files: { 'in.pdf': bytes, ...fontBytes }, outputs: ['out.pdf'], vars: { items: JSON.stringify(data), author } });
  const out = r.files['out.pdf'];
  if (!out) { console.error('bake: keine Ausgabe', r.result); throw new Error(L("Änderungen konnten nicht geschrieben werden")); }
  return out;
}

export function warnIfLarge(doc: Doc) {
  if ((overlay.items[doc.id]?.length || 0) > 200) toast(L("Sehr viele offene Elemente – „Übernehmen“ schreibt sie ins PDF."));
}
