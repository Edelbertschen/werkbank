// Inhalte einer Seite, die sich anfassen lassen: Textblöcke und Bilder (für „Elemente verschieben“).
// Koordinaten wie das Overlay: Anteile der angezeigten Seite, Ursprung oben links.
import { pyRun } from './engines';

export interface PageObject { sub: 'text' | 'image'; x: number; y: number; w: number; h: number; xref?: number; fonts?: string[]; text?: string }

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
json.dumps(out)
`, { files: { 'in.pdf': bytes }, vars: { page: String(page) } });
  return (JSON.parse(r.result) as any[]).map(o => ({ sub: o.sub, x: o.b[0], y: o.b[1], w: o.b[2], h: o.b[3], xref: o.xref, fonts: o.fonts, text: o.text }));
}
