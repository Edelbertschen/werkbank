// Beliebige Dateien in PDF umwandeln
import { PDFDocument } from 'pdf-lib';
import MarkdownIt from 'markdown-it';
import { libreConvert, py } from './engines';
import { MM, extOf, baseName } from './util';
import type { Progress } from './engines/rpc';

export const OFFICE_EXT = ['docx', 'doc', 'docm', 'dotx', 'odt', 'ott', 'rtf', 'wpd', 'xlsx', 'xls', 'xlsm', 'ods', 'csv', 'pptx', 'ppt', 'pps', 'ppsx', 'odp', 'odg', 'vsd', 'vsdx', 'pub', 'wps'];
export const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif', 'tif', 'tiff', 'heic', 'heif', 'svg', 'ico'];
export const MUPDF_EXT = ['epub', 'mobi', 'fb2', 'cbz', 'xps', 'oxps'];
export const TEXT_EXT = ['txt', 'md', 'markdown', 'html', 'htm', 'json', 'xml', 'log', 'eml', 'msg'];

export function kindOf(name: string): 'pdf' | 'office' | 'image' | 'mupdf' | 'text' | 'unknown' {
  const e = extOf(name);
  if (e === 'pdf') return 'pdf';
  if (OFFICE_EXT.includes(e)) return 'office';
  if (IMAGE_EXT.includes(e)) return 'image';
  if (MUPDF_EXT.includes(e)) return 'mupdf';
  if (TEXT_EXT.includes(e)) return 'text';
  return 'unknown';
}

export function hasPdfHeader(b: Uint8Array) {
  const head = new TextDecoder('latin1').decode(b.subarray(0, Math.min(1024, b.length)));
  return head.includes('%PDF-');
}

// ---------------------------------------------------------------------------
// Bilder
// ---------------------------------------------------------------------------
async function decodeToCanvas(bytes: Uint8Array, name: string): Promise<HTMLCanvasElement[]> {
  const e = extOf(name);
  let blob: Blob = new Blob([bytes as BlobPart]);
  if (e === 'heic' || e === 'heif') {
    const heic2any = (await import('heic2any')).default as any;
    const r = await heic2any({ blob, toType: 'image/jpeg', quality: 0.92 });
    blob = Array.isArray(r) ? r[0] : r;
  }
  if (e === 'tif' || e === 'tiff') {
    const UTIF: any = await import('utif2');
    const U = UTIF.default || UTIF;
    const ifds = U.decode(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    const out: HTMLCanvasElement[] = [];
    for (const ifd of ifds) {
      U.decodeImage(bytes.buffer, ifd);
      const rgba = U.toRGBA8(ifd);
      if (!ifd.width || !ifd.height) continue;
      const c = document.createElement('canvas'); c.width = ifd.width; c.height = ifd.height;
      c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(rgba), ifd.width, ifd.height), 0, 0);
      out.push(c);
    }
    return out;
  }
  if (e === 'svg') blob = new Blob([bytes as BlobPart], { type: 'image/svg+xml' });
  let src: CanvasImageSource & { width: number; height: number };
  try { src = await createImageBitmap(blob, { imageOrientation: 'from-image' } as any); }
  catch {
    const url = URL.createObjectURL(blob);
    src = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error(`„${name}“ ist kein lesbares Bild`)); im.src = url; });
  }
  let w = src.width || 1000, h = src.height || 1000;
  if (e === 'svg') { const s = Math.max(1, 2000 / Math.max(w, h)); w *= s; h *= s; }
  const c = document.createElement('canvas'); c.width = Math.round(w); c.height = Math.round(h);
  const ctx = c.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(src, 0, 0, c.width, c.height);
  return [c];
}

export interface ImagePdfOptions { size: string; orient: 'auto' | 'port' | 'land'; margin: number; quality?: number }
export async function imagesToPdf(files: { name: string; bytes: Uint8Array }[], opts: ImagePdfOptions = { size: 'A4', orient: 'auto', margin: 0 }) {
  const { PAPER } = await import('./util');
  const doc = await PDFDocument.create();
  for (const f of files) {
    const e = extOf(f.name);
    // JPEGs ohne Drehung direkt übernehmen (keine Qualitätsverluste); sonst über Canvas
    const canvases = await decodeToCanvas(f.bytes, f.name);
    for (const c of canvases) {
      const usePng = ['png', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(e) && c.width * c.height < 6e6;
      const blob: Blob = await new Promise(r => c.toBlob(b => r(b!), usePng ? 'image/png' : 'image/jpeg', opts.quality ?? 0.92));
      const ib = new Uint8Array(await blob.arrayBuffer());
      const img = usePng ? await doc.embedPng(ib) : await doc.embedJpg(ib);
      let pw: number, ph: number;
      if (opts.size === 'image') { pw = c.width * 0.75; ph = c.height * 0.75; const s = Math.min(1, 1400 / Math.max(pw, ph)); pw *= s; ph *= s; }
      else {
        const p = PAPER.find(x => x[0] === opts.size) || PAPER[1];
        pw = p[1] * MM; ph = p[2] * MM;
        if (opts.orient === 'land' || (opts.orient === 'auto' && c.width > c.height)) [pw, ph] = [ph, pw];
      }
      const page = doc.addPage([pw, ph]);
      const m = opts.size === 'image' ? 0 : opts.margin * MM;
      const s = Math.min((pw - 2 * m) / c.width, (ph - 2 * m) / c.height);
      page.drawImage(img, { x: (pw - c.width * s) / 2, y: (ph - c.height * s) / 2, width: c.width * s, height: c.height * s });
      c.width = 0;
    }
  }
  return doc.save();
}

// ---------------------------------------------------------------------------
// Text, Markdown, HTML, Mails → HTML → PDF (über MuPDF "Story": echter Satz mit Umbrüchen)
// ---------------------------------------------------------------------------
const PRINT_CSS = `
body { font-family: sans-serif; font-size: 10.5pt; line-height: 1.45; color: #1c1c1e; }
h1 { font-size: 20pt; margin: 0 0 8pt; } h2 { font-size: 15pt; margin: 14pt 0 6pt; } h3 { font-size: 12.5pt; margin: 12pt 0 4pt; }
p { margin: 0 0 7pt; } ul, ol { margin: 0 0 7pt 14pt; } li { margin: 0 0 2pt; }
code, pre { font-family: monospace; font-size: 9pt; } pre { background: #f2f2f4; padding: 6pt; }
blockquote { color: #555; margin: 0 0 7pt 10pt; }
table { border-collapse: collapse; margin: 0 0 8pt; } td, th { border: 0.5pt solid #bbb; padding: 3pt 5pt; font-size: 9.5pt; } th { background: #eee; }
.meta { color: #555; font-size: 9pt; margin-bottom: 10pt; } .meta b { color: #222; }
`;
const esc = (s: string) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));

export async function htmlToPdf(html: string, pageSize: 'a4' | 'letter' | 'a3' | 'a5' = 'a4', margin = 56): Promise<Uint8Array> {
  return py<Uint8Array>('htmlToPdf', html, { css: PRINT_CSS, pageSize, margins: margin });
}
export async function markdownToHtml(md: string) {
  const it = new MarkdownIt({ html: false, linkify: true, typographer: true, breaks: false });
  return it.render(md);
}

async function emlToHtml(bytes: Uint8Array) {
  const PostalMime = (await import('postal-mime')).default as any;
  const m = await PostalMime.parse(bytes);
  const head = `<div class="meta"><b>Von:</b> ${esc(m.from?.address ? `${m.from.name || ''} <${m.from.address}>` : '')}<br><b>An:</b> ${esc((m.to || []).map((t: any) => t.address).join(', '))}<br><b>Datum:</b> ${esc(m.date ? new Date(m.date).toLocaleString('de-DE') : '')}<br><b>Betreff:</b> ${esc(m.subject || '')}${m.attachments?.length ? `<br><b>Anhänge:</b> ${esc(m.attachments.map((a: any) => a.filename).join(', '))}` : ''}</div>`;
  const body = m.html ? m.html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '') : `<pre>${esc(m.text || '')}</pre>`;
  return `<h1>${esc(m.subject || 'E-Mail')}</h1>${head}${body}`;
}
async function msgToHtml(bytes: Uint8Array) {
  const MsgReader = ((await import('@kenjiuno/msgreader')) as any).default;
  const r = new MsgReader(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const d = r.getFileData();
  const head = `<div class="meta"><b>Von:</b> ${esc(`${d.senderName || ''} <${d.senderEmail || ''}>`)}<br><b>An:</b> ${esc((d.recipients || []).map((x: any) => x.email || x.name).join(', '))}<br><b>Betreff:</b> ${esc(d.subject || '')}</div>`;
  return `<h1>${esc(d.subject || 'E-Mail')}</h1>${head}<pre style="white-space:pre-wrap;font-family:sans-serif;font-size:10.5pt">${esc(d.body || '')}</pre>`;
}

// ---------------------------------------------------------------------------
// Einstieg: Datei → PDF
// ---------------------------------------------------------------------------
export async function anyToPdf(name: string, bytes: Uint8Array, progress?: Progress): Promise<Uint8Array> {
  const e = extOf(name);
  const k = kindOf(name);
  if (k === 'pdf' || hasPdfHeader(bytes)) return bytes;
  if (k === 'office') {
    progress?.(-1, 'Office-Dokument wird umgewandelt …');
    return libreConvert(bytes, name, 'pdf', { progress });
  }
  if (k === 'image') { progress?.(-1, 'Bild wird umgewandelt …'); return imagesToPdf([{ name, bytes }]); }
  if (k === 'mupdf') {
    progress?.(-1, 'Wird gesetzt …');
    return py<Uint8Array>('convertToPdf', bytes, { filetype: e === 'oxps' ? 'xps' : e });
  }
  if (k === 'text') {
    progress?.(-1, 'Wird gesetzt …');
    const text = new TextDecoder('utf-8').decode(bytes);
    let html: string;
    if (e === 'md' || e === 'markdown') html = await markdownToHtml(text);
    else if (e === 'html' || e === 'htm') html = text.replace(/<script[\s\S]*?<\/script>/gi, '');
    else if (e === 'eml') html = await emlToHtml(bytes);
    else if (e === 'msg') html = await msgToHtml(bytes);
    else if (e === 'json') { let t = text; try { t = JSON.stringify(JSON.parse(text), null, 2); } catch { /* roh */ } html = `<h2>${esc(baseName(name))}</h2><pre>${esc(t)}</pre>`; }
    else if (e === 'xml') html = `<h2>${esc(baseName(name))}</h2><pre>${esc(text)}</pre>`;
    else html = `<pre style="white-space:pre-wrap;font-family:monospace;font-size:9.5pt">${esc(text)}</pre>`;
    return htmlToPdf(html);
  }
  throw new Error(`Dateien vom Typ „.${e || '?'}“ kann die Werkbank nicht öffnen.`);
}
