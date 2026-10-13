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
  | { kind: 'textedit'; x: number; y: number; w: number; h: number; text: string; orig: string; size: number; color: string; bold: boolean; italic?: boolean; family?: 'sans' | 'serif' | 'mono'; fontName?: string; css?: string }
  | { kind: 'link'; x: number; y: number; w: number; h: number; url: string; toPage: number }
  | { kind: 'field'; ftype: 'text' | 'check' | 'radio' | 'choice' | 'signature'; x: number; y: number; w: number; h: number; name: string; options: string; multiline: boolean; group: string }
  | { kind: 'underline' | 'strike' | 'highlight'; rects: [number, number, number, number][]; color: string }
  | { kind: 'ink'; paths: [number, number][][]; stroke: string; width: number; opacity: number }
  | { kind: 'comment'; x: number; y: number; w: number; h?: number; text: string; size: number; color: string; bold: boolean }
  // Inhalt des PDFs (Textblock oder Bild), der verschoben, skaliert oder gelöscht wird; o* = ursprüngliche Lage
  | { kind: 'move'; sub: 'text' | 'image'; x: number; y: number; w: number; h: number; ox: number; oy: number; ow: number; oh: number; xref?: number; fonts?: string[]; snap: string; remove?: boolean }
);

/** Angefasst, aber nicht verändert – zählt nicht als Änderung */
export function isNoop(it: OItem) {
  if (it.kind !== 'move' || it.remove) return false;
  const e = 1e-4;
  return Math.abs(it.x - it.ox) < e && Math.abs(it.y - it.oy) < e && Math.abs(it.w - it.ow) < e && Math.abs(it.h - it.oh) < e;
}

export const overlay = $state({
  selected: null as string | null,
  editing: null as string | null,
});

/** Lesen ohne Zustandsänderung (sicher in Templates/$derived) */
export function itemsOf(doc: Doc): OItem[] { return doc.objects; }

/** Angefangen, aber (noch) ohne Wirkung – zählt nicht als Änderung und wird nicht eingeschrieben */
export function isPending(it: OItem) {
  if (isNoop(it)) return true;
  if ((it.kind === 'text' || it.kind === 'textedit' || it.kind === 'comment') && !(it as any).text?.trim()) return true;
  if (it.kind === 'textedit') {
    const t = it as any;
    return t.text === t.orig && t.size === t.origSize && !!t.bold === !!t.origBold && t.color === t.origColor;
  }
  return false;
}

const KIND: Record<string, string> = {
  rect: L("Rechteck"), ellipse: L("Ellipse"), line: L("Linie"), arrow: L("Pfeil"), note: L("Notiz"), image: L("Bild"), redact: L("Schwärzung"),
  whiteout: L("Abdeckung"), text: 'Text', textedit: 'Text', link: 'Link', field: L("Formularfeld"), underline: L("Unterstreichung"),
  strike: L("Durchstreichung"), highlight: L("Markierung"), ink: L("Freihand"), comment: L("Textkommentar"), move: L("Element"),
};
function labelOf(it: OItem) {
  if (it.kind === 'move') return it.remove ? L("Element gelöscht") : L("Element verschoben");
  if (it.kind === 'textedit') return L("Text geändert");
  if (it.kind === 'image') return ({ sign: L("Unterschrift eingefügt"), stamp: L("Stempel eingefügt"), image: L("Bild eingefügt") } as any)[it.role] || L("Bild eingefügt");
  return L("{0} eingefügt", KIND[it.kind] || L("Element"));
}
const GEOMETRY = new Set(['x', 'y', 'x1', 'y1', 'x2', 'y2', 'rects', 'paths']);
/** Bezeichnung für den Verlauf: neu, verschoben, Größe geändert oder geändert */
function changeLabel(doc: Doc, it: OItem) {
  const prev = doc.history[doc.pos].objects.find(o => o.id === it.id) as any;
  if (!prev) return labelOf(it);
  const cur = $state.snapshot(it) as any;
  if (it.kind === 'move' && cur.remove && !prev.remove) return L("Element gelöscht");
  const keys = Object.keys(cur).filter(k => JSON.stringify(cur[k]) !== JSON.stringify(prev[k]));
  if (keys.length && keys.every(k => GEOMETRY.has(k))) return L("Element verschoben");
  if (keys.length && keys.every(k => GEOMETRY.has(k) || k === 'w' || k === 'h')) return L("Größe geändert");
  return L("{0} geändert", KIND[it.kind] || L("Element"));
}

/** Den aktuellen Zustand der Elemente als Stand festhalten (unverändert: kein Stand) */
export function commit(doc: Doc, label: string) {
  const snap = ($state.snapshot(doc.objects) as OItem[]).filter(i => !isPending(i));
  return doc.commitObjects(label, snap);
}
/** Änderung an einem Element abschließen – Bezeichnung ergibt sich aus der Art der Änderung */
export function commitItem(doc: Doc, it: OItem) { return commit(doc, changeLabel(doc, it)); }

/** Element hinzufügen; ohne `pending` sofort ein Stand. Text, Notizen und Anfassen werden erst nach der Eingabe festgehalten. */
export function addItem(doc: Doc, item: Omit<OItem, 'id'> & { id?: string }, opts: { pending?: boolean } = {}) {
  const it = { ...item, id: item.id || uid() } as OItem;
  doc.objects.push(it);
  overlay.selected = it.id;
  if (!opts.pending) commit(doc, labelOf(it));
  return it;
}
export function removeItem(doc: Doc, id: string) {
  const i = doc.objects.findIndex(x => x.id === id);
  const it = i >= 0 ? doc.objects[i] : null;
  if (i >= 0) doc.objects.splice(i, 1);
  if (overlay.selected === id) overlay.selected = null;
  if (overlay.editing === id) overlay.editing = null;
  if (it) commit(doc, L("{0} entfernt", KIND[it.kind] || L("Element")));
}
export function findItem(doc: Doc, id: string | null) { return id ? itemsOf(doc).find(x => x.id === id) || null : null; }

const PY_KINDS = new Set(['rect', 'ellipse', 'line', 'arrow', 'note', 'redact', 'textedit', 'link', 'underline', 'strike', 'highlight', 'ink', 'comment', 'move']);

/** Elemente ins PDF schreiben (reine Funktion: Bytes rein, Bytes raus) */
export async function bakeObjects(bytes: Uint8Array, all: OItem[]): Promise<Uint8Array> {
  const items = all.filter(i => !isPending(i));
  if (!items.length) return bytes;
  const contentItems = items.filter(i => !PY_KINDS.has(i.kind));
  const pyItems = items.filter(i => PY_KINDS.has(i.kind));
  if (contentItems.length) bytes = await bakeContent(bytes, contentItems);
  if (pyItems.length) bytes = await bakeWithMuPdf(bytes, pyItems);
  return bytes;
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
  const fontBytes: Record<string, Uint8Array> = items.some(i => i.kind === 'textedit' || i.kind === 'move')
    ? { 'sans.ttf': new Uint8Array(await (await fetch('/engines/pdfjs/standard_fonts/LiberationSans-Regular.ttf')).arrayBuffer()), 'sansb.ttf': new Uint8Array(await (await fetch('/engines/pdfjs/standard_fonts/LiberationSans-Bold.ttf')).arrayBuffer()) }
    : {};
  // Installierte Schriften mit dem Namen der Originalschrift mitgeben (Desktop-App)
  const sysFiles: Record<string, Uint8Array> = {};
  const sysPath = new Map<string, string>();
  for (const i of items) {
    if (i.kind !== 'textedit' || !i.fontName) continue;
    const { systemFont } = await import('./sysfonts');
    const b = await systemFont(i.fontName, i.bold, !!i.italic);
    if (b) { const n = `sys${Object.keys(sysFiles).length}.font`; sysFiles[n] = b; sysPath.set(i.id, '/w/' + n); }
  }
  // Verschobene Textblöcke: installierte Schriften je Schriftname
  const sysMaps = new Map<string, Record<string, string>>();
  for (const i of items) {
    if (i.kind !== 'move' || i.sub !== 'text' || !i.fonts?.length) continue;
    const { systemFont } = await import('./sysfonts');
    const { classifyFont } = await import('./textedit');
    const m: Record<string, string> = {};
    for (const name of i.fonts) {
      const st = classifyFont(name);
      const b = await systemFont(name, st.bold, st.italic);
      if (b) { const n = `sys${Object.keys(sysFiles).length}.font`; sysFiles[n] = b; m[name] = '/w/' + n; }
    }
    sysMaps.set(i.id, m);
  }
  const data = items.map(i => ({ sysfont: sysPath.get(i.id), sysfonts: sysMaps.get(i.id), snap: undefined, ...i, ...('stroke' in i ? { strokeRgb: hexToRgb01(i.stroke) } : {}), ...('fill' in i && i.fill && i.fill !== 'transparent' ? { fillRgb: hexToRgb01(i.fill) } : {}), ...('color' in i ? { colorRgb: hexToRgb01((i as any).color) } : {}) }));
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
# --- Text bearbeiten -------------------------------------------------------
# Ersatzschriften (in MuPDF enthalten, metrisch wie Helvetica/Arial, Times, Courier)
BASE14 = {('sans', 0, 0): 'helv', ('sans', 1, 0): 'hebo', ('sans', 0, 1): 'heit', ('sans', 1, 1): 'hebi',
          ('serif', 0, 0): 'tiro', ('serif', 1, 0): 'tibo', ('serif', 0, 1): 'tiit', ('serif', 1, 1): 'tibi',
          ('mono', 0, 0): 'cour', ('mono', 1, 0): 'cobo', ('mono', 0, 1): 'coit', ('mono', 1, 1): 'cobi'}
SERIF = ('times', 'serif', 'roman', 'georgia', 'garamond', 'cambria', 'minion', 'palatino', 'antiqua', 'baskerville', 'bodoni', 'century', 'caslon', 'tiro', 'nimbusrom')
MONO = ('courier', 'mono', 'consol', 'menlo', 'code', 'fixed', 'typewriter', 'nimbusmon')
BOLD = ('bold', 'black', 'heavy', 'semibold', 'demi', 'extrab')
font_files = {}
def font_style(name, flags=0):
    low = name.split('+')[-1].lower().replace(' ', '').replace('-', '')
    fam = 'mono' if (flags & 8) or any(w in low for w in MONO) else 'sans' if 'sans' in low else 'serif' if any(w in low for w in SERIF) else 'sans'
    return fam, int(bool(flags & 16) or any(w in low for w in BOLD)), int(bool(flags & 2) or 'italic' in low or 'oblique' in low)
def use_font(page, key, buf):
    # Als Datei ablegen: insert_text/insert_textbox betten sie je Seite einmal ein
    if key not in font_files:
        path = '/w/%s.font' % key
        with open(path, 'wb') as fh:
            fh.write(buf)
        font_files[key] = path
    return key, font_files[key]
def text_font(page, r, text, want_bold, sysfont=None):
    """Originalschrift (eingebettet, vollständig) > installierte Schrift gleichen Namens > passende Ersatzschrift"""
    best, cnt = None, 0
    for b in page.get_text('dict', clip=r)['blocks']:
        for l in b.get('lines', []):
            for sp in l['spans']:
                n = len(sp['text'].strip())
                if n > cnt:
                    best, cnt = sp, n
    name = best['font'] if best else ''
    if name:
        for x in page.get_fonts():
            if x[3].split('+')[-1] == name:
                try:
                    buf = doc.extract_font(x[0])[3]
                    if buf:
                        f = pymupdf.Font(fontbuffer=buf)
                        if all(f.has_glyph(ord(c)) for c in text if not c.isspace()):
                            return use_font(page, 'WbO%d' % x[0], buf)
                except Exception:
                    pass
                break
    if sysfont:
        try:
            with open(sysfont, 'rb') as fh:
                sb = fh.read()
            f = pymupdf.Font(fontbuffer=sb)
            if all(f.has_glyph(ord(c)) for c in text if not c.isspace()):
                return use_font(page, 'WbS' + sysfont.split('/')[-1].split('.')[0], sb)
        except Exception:
            pass
    fam, bold, italic = font_style(name, best['flags'] if best else 0)
    code = BASE14[(fam, max(bold, int(bool(want_bold))), italic)]
    try:
        buf = pymupdf.Font(code).buffer
    except Exception:
        with open('/w/sansb.ttf' if bold else '/w/sans.ttf', 'rb') as fh:
            buf = fh.read()
    return use_font(page, 'Wb' + code, buf)
def erase_text(page, r):
    """Genau die Zeichen des Absatzes entfernen (Mitte im Kasten) – Nachbarzeilen bleiben unberührt"""
    hit = 0
    for b in page.get_text('rawdict')['blocks']:
        for l in b.get('lines', []):
            for sp in l['spans']:
                for ch in sp['chars']:
                    q = pymupdf.Rect(ch['bbox'])
                    if q.is_empty or not r.contains((q.tl + q.br) / 2):
                        continue
                    w, h = q.width, q.height
                    page.add_redact_annot(pymupdf.Rect(q.x0 + w * 0.25, q.y0 + h * 0.3, q.x1 - w * 0.25, q.y1 - h * 0.3), fill=False)
                    hit += 1
    if not hit:
        page.add_redact_annot(r, fill=False)
    page.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE, graphics=pymupdf.PDF_REDACT_LINE_ART_NONE)
# --- Elemente verschieben ------------------------------------------------------
def image_ctm(page, src, xref):
    best = None
    for info in page.get_image_info(xrefs=True):
        if info['xref'] == xref:
            r = pymupdf.Rect(info['bbox'])
            d = abs(r.x0 - src.x0) + abs(r.y0 - src.y0) + abs(r.x1 - src.x1) + abs(r.y1 - src.y1)
            if best is None or d < best[0]:
                best = (d, pymupdf.Matrix(info['transform']))
    return best[1] if best else None
def rewrite_do(page, xref, repl):
    """Den einen Zeichenbefehl des Bildes im Seiteninhalt ersetzen; False, wenn nicht eindeutig"""
    names = [i[7] for i in page.get_images(full=True) if i[0] == xref]
    if len(names) != 1:
        return False
    page.clean_contents()
    cont = page.get_contents()
    if len(cont) != 1:
        return False
    s = doc.xref_stream(cont[0])
    pat = ('/%s Do' % names[0]).encode()
    if s.count(pat) != 1:
        return False
    doc.update_stream(cont[0], s.replace(pat, repl(pat)))
    return True
def redact_image(page, src):
    c = (src.tl + src.br) / 2
    if sum(1 for i in page.get_image_info() if pymupdf.Rect(i['bbox']).contains(c)) > 1:
        raise Exception('Dieses Bild liegt über einem anderen Bild und lässt sich nicht einzeln verschieben.')
    page.add_redact_annot(pymupdf.Rect(c.x - 0.5, c.y - 0.5, c.x + 0.5, c.y + 0.5))
    page.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_REMOVE, graphics=pymupdf.PDF_REDACT_LINE_ART_NONE, text=pymupdf.PDF_REDACT_TEXT_NONE)
def move_image(page, src, dst, xref, remove):
    if remove:
        if not rewrite_do(page, xref, lambda pat: b''):
            redact_image(page, src)
        return
    T = image_ctm(page, src, xref)
    if T is not None:
        P = page.transformation_matrix
        # PyMuPDF zählt im Bild-Einheitsquadrat y von oben, PDF von unten
        CTM = pymupdf.Matrix(1, 0, 0, -1, 0, 1) * T * ~P
        Mm = pymupdf.Matrix(1, 0, 0, 1, -src.x0, -src.y0) * pymupdf.Matrix(dst.width / src.width, 0, 0, dst.height / src.height, 0, 0) * pymupdf.Matrix(1, 0, 0, 1, dst.x0, dst.y0)
        M = CTM * (P * Mm * ~P) * ~CTM
        cm = ('q %.6f %.6f %.6f %.6f %.6f %.6f cm ' % (M.a, M.b, M.c, M.d, M.e, M.f)).encode()
        if rewrite_do(page, xref, lambda pat: cm + pat + b' Q'):
            return
    redact_image(page, src)
    page.insert_image(dst, xref=xref)
def move_font(page, name, flags, text, sysfile):
    for x in page.get_fonts():
        if x[3].split('+')[-1] == name:
            try:
                buf = doc.extract_font(x[0])[3]
                if buf:
                    f = pymupdf.Font(fontbuffer=buf)
                    if all(f.has_glyph(ord(c)) for c in text):
                        return f
            except Exception:
                pass
            break
    if sysfile:
        try:
            f = pymupdf.Font(fontfile=sysfile)
            if all(f.has_glyph(ord(c)) for c in text):
                return f
        except Exception:
            pass
    try:
        return pymupdf.Font(BASE14[font_style(name, flags)])
    except Exception:
        return pymupdf.Font(fontfile='/w/sans.ttf')
def move_text(page, src, dst, remove, sysfonts):
    """Zeichen des Blocks entfernen und an derselben relativen Position neu setzen (Zeichen für Zeichen)"""
    d = dst.tl - src.tl
    groups = {}
    for b in page.get_text('rawdict')['blocks']:
        for l in b.get('lines', []):
            for sp in l['spans']:
                for ch in sp['chars']:
                    q = pymupdf.Rect(ch['bbox'])
                    if q.is_empty or not src.contains((q.tl + q.br) / 2) or not ch['c'].strip():
                        continue
                    if abs(l['dir'][1]) > 0.01:
                        raise Exception('Gedrehter Text lässt sich noch nicht verschieben.')
                    groups.setdefault((sp['font'], sp['flags'], sp['color']), []).append((pymupdf.Point(ch['origin']), ch['c'], sp['size']))
    erase_text(page, src)
    if remove:
        return
    for (font, flags, color), chars in groups.items():
        F = move_font(page, font, flags, ''.join(c for _, c, _ in chars), sysfonts.get(font))
        tw = pymupdf.TextWriter(page.rect)
        for o, c, size in chars:
            tw.append(o + d, c, font=F, fontsize=size)
        tw.write_text(page, color=(((color >> 16) & 255) / 255, ((color >> 8) & 255) / 255, (color & 255) / 255))
def move_element(page, it):
    src = R(page, it['ox'], it['oy'], it['ow'], it['oh'])
    dst = R(page, it['x'], it['y'], it['w'], it['h'])
    if it['sub'] == 'image':
        move_image(page, src, dst, it['xref'], it.get('remove'))
    else:
        move_text(page, src, dst, it.get('remove'), it.get('sysfonts') or {})
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
    elif k == 'highlight':
        a = page.add_highlight_annot([R(page, *q).quad for q in it['rects']])
        a.set_colors(stroke=it['colorRgb'])
        finish(a, it)
    elif k == 'ink':
        a = page.add_ink_annot([[tuple(P(page, x, y)) for x, y in path] for path in it['paths']])
        a.set_border(width=it['width'])
        a.set_colors(stroke=it['strokeRgb'])
        a.set_opacity(it.get('opacity', 1))
        finish(a, it)
    elif k == 'comment':
        hh = max(it.get('h') or 0, it['size'] * 1.7 / page.rect.height)
        a = page.add_freetext_annot(R(page, it['x'], it['y'], it['w'], hh), it['text'], fontsize=it['size'], fontname='helv', text_color=it['colorRgb'], fill_color=(1, 0.98, 0.82), border_width=0.6)
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
        fname, ff = text_font(page, r, it['text'], it.get('bold'), it.get('sysfont'))
        erase_text(page, r)
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
    elif k == 'move':
        move_element(page, it)
for pno in redact_pages:
    doc[pno].apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_PIXELS)
save_out(doc)
len(items)
`, { files: { 'in.pdf': bytes, ...fontBytes, ...sysFiles }, outputs: ['out.pdf'], vars: { items: JSON.stringify(data), author } });
  const out = r.files['out.pdf'];
  if (!out) { console.error('bake: keine Ausgabe', r.result); throw new Error(L("Änderungen konnten nicht geschrieben werden")); }
  return out;
}

