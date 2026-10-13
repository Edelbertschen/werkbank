// Inhalte einer Seite, die sich anfassen lassen: Textblöcke und Bilder (für „Elemente verschieben“).
// Koordinaten wie das Overlay: Anteile der angezeigten Seite, Ursprung oben links.
import { pyRun } from './engines';

export interface PageObject { sub: 'text' | 'image' | 'annot'; x: number; y: number; w: number; h: number; xref?: number; fonts?: string[]; text?: string; atype?: string }

const cache = new WeakMap<Uint8Array, Map<number, Promise<PageObject[]>>>();

export function pageObjects(bytes: Uint8Array, page: number): Promise<PageObject[]> {
  let m = cache.get(bytes);
  if (!m) cache.set(bytes, (m = new Map()));
  if (!m.has(page)) m.set(page, load(bytes, page).catch(e => { console.error(e); m!.delete(page); return []; }));
  return m.get(page)!;
}

async function load(bytes: Uint8Array, page: number): Promise<PageObject[]> {
  const r = await pyRun(`
page = open_in()[int(ARGS['page'])]
W, H = page.rect.width, page.rect.height
rot = page.rotation_matrix
def frac(bbox):
    r = pymupdf.Rect(bbox) * rot
    return [r.x0 / W, r.y0 / H, r.width / W, r.height / H]
out = []
for info in page.get_image_info(xrefs=True):
    r = pymupdf.Rect(info['bbox'])
    if info['xref'] and not r.is_empty and r.width > 2 and r.height > 2:
        out.append({'sub': 'image', 'b': frac(r), 'xref': info['xref']})
for b in page.get_text('dict')['blocks']:
    if b['type'] != 0:
        continue
    text = ' '.join(''.join(s['text'] for s in l['spans']) for l in b['lines']).strip()
    if text:
        fonts = sorted({s['font'] for l in b['lines'] for s in l['spans'] if s['text'].strip()})
        out.append({'sub': 'text', 'b': frac(b['bbox']), 'fonts': fonts, 'text': text[:60]})
# Anmerkungen, die sich als Element bearbeiten lassen (nicht: solche mit Antworten)
EDITABLE = ('Square', 'Circle', 'Line', 'Ink', 'Highlight', 'Underline', 'StrikeOut', 'FreeText', 'Text')
replied = set()
for a in page.annots():
    irt = page.parent.xref_get_key(a.xref, 'IRT')
    if irt[0] == 'xref':
        replied.add(int(irt[1].split()[0]))
for a in page.annots():
    if a.type[1] in EDITABLE and a.xref not in replied:
        out.append({'sub': 'annot', 'b': frac(a.rect), 'xref': a.xref, 'atype': a.type[1], 'text': (a.info.get('content') or '')[:60]})
json.dumps(out)
`, { files: { 'in.pdf': bytes }, vars: { page: String(page) } });
  return (JSON.parse(r.result) as any[]).map(o => ({ sub: o.sub, x: o.b[0], y: o.b[1], w: o.b[2], h: o.b[3], xref: o.xref, fonts: o.fonts, text: o.text, atype: o.atype }));
}

/** Anmerkung aus dem PDF lösen: Eigenschaften als Element (Overlay-Koordinaten) und die Bytes ohne sie */
export async function liftAnnotation(bytes: Uint8Array, page: number, xref: number): Promise<{ item: any; bytes: Uint8Array }> {
  const r = await pyRun(`
import re
doc = open_in()
page = doc[int(ARGS['page'])]
xref = int(ARGS['xref'])
W, H = page.rect.width, page.rect.height
rot = page.rotation_matrix
def fp(p):
    q = pymupdf.Point(p) * rot
    return [q.x / W, q.y / H]
def fr(r):
    r = pymupdf.Rect(r) * rot
    return [r.x0 / W, r.y0 / H, r.width / W, r.height / H]
def hexc(c):
    return '#%02x%02x%02x' % tuple(int(round(v * 255)) for v in c[:3]) if c and len(c) >= 3 else None
a = next(x for x in page.annots() if x.xref == xref)
t = a.type[1]
col = a.colors or {}
st, fi = hexc(col.get('stroke')), hexc(col.get('fill'))
w = (a.border or {}).get('width') or 1
if w < 0:
    w = 1
op = a.opacity if a.opacity is not None and a.opacity >= 0 else 1
info = a.info
o = {'page': page.number, 'author': info.get('title') or '', 'contents': info.get('content') or ''}
if t in ('Square', 'Circle'):
    r = a.rect + (w / 2, w / 2, -w / 2, -w / 2)  # PyMuPDF schlägt den Rahmen beim Anlegen wieder auf
    x, y, ww, hh = fr(r)
    o.update(kind='rect' if t == 'Square' else 'ellipse', x=x, y=y, w=ww, h=hh, stroke=st or '#000000', fill=fi or 'transparent', width=w, opacity=op)
elif t == 'Line':
    v = a.vertices
    p1, p2 = fp(v[0]), fp(v[1])
    le = a.line_ends or (0, 0)
    arrow = le[1] in (pymupdf.PDF_ANNOT_LE_OPEN_ARROW, pymupdf.PDF_ANNOT_LE_CLOSED_ARROW)
    o.update(kind='arrow' if arrow else 'line', x1=p1[0], y1=p1[1], x2=p2[0], y2=p2[1], stroke=st or '#000000', width=w, opacity=op)
elif t == 'Ink':
    o.update(kind='ink', paths=[[fp(p) for p in path] for path in a.vertices], stroke=st or '#000000', width=w, opacity=op)
elif t in ('Highlight', 'Underline', 'StrikeOut'):
    v = a.vertices
    rects = [fr(pymupdf.Quad(v[i], v[i + 1], v[i + 2], v[i + 3]).rect) for i in range(0, len(v) - 3, 4)]
    o.update(kind={'Highlight': 'highlight', 'Underline': 'underline', 'StrikeOut': 'strike'}[t], rects=rects, color=st or '#ffe066', opacity=op)
elif t == 'FreeText':
    da = doc.xref_get_key(xref, 'DA')[1] or ''
    m = re.search(r'([0-9.]+)\\s+Tf', da)
    size = float(m.group(1)) if m and float(m.group(1)) > 0 else 11
    m = re.search(r'([0-9.]+)\\s+([0-9.]+)\\s+([0-9.]+)\\s+rg', da)
    tc = hexc([float(m.group(i)) for i in (1, 2, 3)]) if m else '#000000'
    x, y, ww, hh = fr(a.rect)
    o.update(kind='comment', x=x, y=y, w=ww, h=hh, text=info.get('content') or '', size=size, color=tc, bold=False, fill=fi or 'transparent', borderWidth=(a.border or {}).get('width') or 0)
elif t == 'Text':
    x, y, ww, hh = fr(a.rect)
    icon = (doc.xref_get_key(xref, 'Name')[1] or '/Note').lstrip('/')
    o.update(kind='note', x=x, y=y, w=ww, h=hh, text=info.get('content') or '', color=st or '#F2B705', icon=icon)
else:
    raise Exception('Diese Anmerkung lässt sich nicht bearbeiten.')
page.delete_annot(a)
save_out(doc)
json.dumps(o)
`, { files: { 'in.pdf': bytes }, outputs: ['out.pdf'], vars: { page: String(page), xref: String(xref) } });
  return { item: JSON.parse(r.result), bytes: r.files['out.pdf'] };
}

/** Ist die Schrift des Textes in diesem Bereich vollständig eingebettet (alle Zeichen des Textes vorhanden)? */
export async function embeddedFontCovers(bytes: Uint8Array, page: number, box: { x: number; y: number; w: number; h: number }, text: string): Promise<{ name: string; complete: boolean }> {
  const r = await pyRun(`
page = open_in()[int(ARGS['page'])]
W, H = page.rect.width, page.rect.height
b = json.loads(ARGS['box'])
r = pymupdf.Rect(b['x'] * W, b['y'] * H, (b['x'] + b['w']) * W, (b['y'] + b['h']) * H) * page.derotation_matrix
best, cnt = None, 0
for bl in page.get_text('dict', clip=r)['blocks']:
    for l in bl.get('lines', []):
        for sp in l['spans']:
            n = len(sp['text'].strip())
            if n > cnt:
                best, cnt = sp, n
name = best['font'] if best else ''
complete = False
for x in page.get_fonts():
    if name and x[3].split('+')[-1] == name:
        try:
            buf = page.parent.extract_font(x[0])[3]
            if buf:
                f = pymupdf.Font(fontbuffer=buf)
                complete = all(f.has_glyph(ord(c)) for c in ARGS['text'] if not c.isspace())
        except Exception:
            pass
        break
json.dumps({'name': name, 'complete': complete})
`, { files: { 'in.pdf': bytes }, vars: { page: String(page), box: JSON.stringify(box), text } });
  return JSON.parse(r.result);
}
