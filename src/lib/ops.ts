// Gemeinsame PDF-Operationen auf Basis von pdf-lib
import { PDFDocument, PDFName, PDFArray, degrees, rgb, StandardFonts, type PDFPage, type PDFFont, type PDFEmbeddedPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { openPdf, renderPage, canvasBlob } from './pdf';
import { hexToRgb01, MM, sleep, PAPER } from './util';

import { L } from './i18n';
export { PDFDocument, PDFName, PDFArray, degrees, rgb, StandardFonts };

export async function plLoad(bytes: Uint8Array) {
  const d = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  d.registerFontkit(fontkit);
  return d;
}
export const plSave = (d: PDFDocument) => d.save({ useObjectStreams: true });

/** Leere Seiten ohne Inhaltsstrom bekommen einen leeren Strom (sonst scheitert embedPage) */
export function ensureContents(pl: PDFDocument) {
  for (const p of pl.getPages()) if (!p.node.Contents()) p.node.set(PDFName.of('Contents'), pl.context.register(pl.context.stream('')));
  return pl;
}

export const rotOf = (page: PDFPage) => (((page.getRotation().angle % 360) + 360) % 360);
export function dispSize(page: PDFPage): [number, number] {
  const b = page.getCropBox(), r = rotOf(page);
  return r % 180 ? [b.height, b.width] : [b.width, b.height];
}

/** Anzeige-Koordinaten (oben links, y nach unten, in pt) → PDF-Nutzerraum, Drehung berücksichtigt */
export function geom(page: PDFPage) {
  const b = page.getCropBox(), r = rotOf(page), W = b.width, H = b.height;
  const dw = r % 180 ? H : W, dh = r % 180 ? W : H;
  const map = (dx: number, dy: number) => {
    let u: number, v: number;
    if (r === 0) { u = dx; v = H - dy; } else if (r === 90) { u = dy; v = dx; }
    else if (r === 180) { u = W - dx; v = dy; } else { u = W - dy; v = H - dx; }
    return { x: b.x + u, y: b.y + v };
  };
  return { W, H, dw, dh, r, map };
}

/** Seite so zeichnen, wie sie angezeigt wird (inkl. Drehung); (cx,cy) = linke untere Ecke des Ziels */
export function drawPageDisp(sheet: PDFPage, emb: PDFEmbeddedPage, rot: number, cx: number, cy: number, s: number) {
  const W = emb.width * s, H = emb.height * s;
  const dw = rot % 180 ? H : W, dh = rot % 180 ? W : H;
  const o = { xScale: s, yScale: s };
  if (rot === 0) sheet.drawPage(emb, { ...o, x: cx, y: cy });
  else if (rot === 90) sheet.drawPage(emb, { ...o, x: cx, y: cy + dh, rotate: degrees(-90) });
  else if (rot === 180) sheet.drawPage(emb, { ...o, x: cx + dw, y: cy + dh, rotate: degrees(-180) });
  else sheet.drawPage(emb, { ...o, x: cx + dw, y: cy, rotate: degrees(-270) });
}

export const color = (hex: string) => { const [r, g, b] = hexToRgb01(hex); return rgb(r, g, b); };

// ---------------------------------------------------------------------------
// Schriften: Liberation Sans (metrisch wie Arial) mit vollem Unicode-Latein, Griechisch, Kyrillisch
// ---------------------------------------------------------------------------
const fontBytes = new Map<string, Promise<Uint8Array>>();
function loadFontFile(file: string) {
  if (!fontBytes.has(file)) fontBytes.set(file, fetch('/engines/pdfjs/standard_fonts/' + file).then(r => { if (!r.ok) throw new Error(L("Schrift fehlt")); return r.arrayBuffer(); }).then(b => new Uint8Array(b)));
  return fontBytes.get(file)!;
}
export type FontKind = 'sans' | 'sans-bold' | 'sans-italic' | 'serif' | 'serif-bold' | 'mono';
const FONT_FILES: Record<FontKind, string> = {
  'sans': 'LiberationSans-Regular.ttf', 'sans-bold': 'LiberationSans-Bold.ttf', 'sans-italic': 'LiberationSans-Italic.ttf',
  'serif': '', 'serif-bold': '', 'mono': '',
};
export async function embedFont(pl: PDFDocument, kind: FontKind = 'sans'): Promise<PDFFont> {
  if (kind === 'serif') return pl.embedFont(StandardFonts.TimesRoman);
  if (kind === 'serif-bold') return pl.embedFont(StandardFonts.TimesRomanBold);
  if (kind === 'mono') return pl.embedFont(StandardFonts.Courier);
  try { return await pl.embedFont(await loadFontFile(FONT_FILES[kind]), { subset: true }); }
  catch { return pl.embedFont(kind === 'sans-bold' ? StandardFonts.HelveticaBold : StandardFonts.Helvetica); }
}

/** Zeichen, die die Schrift nicht kann, durch Ersatz oder "?" tauschen */
export function safeText(font: PDFFont, s: string) {
  let out = '';
  for (const ch of String(s)) {
    try { font.encodeText(ch); out += ch; }
    catch { out += ({ '‘': "'", '’': "'", '“': '"', '”': '"', '„': '"', '…': '...', '−': '-' } as any)[ch] ?? '?'; }
  }
  return out;
}

export function wrapText(font: PDFFont, size: number, text: string, maxW: number) {
  const lines: string[] = [];
  for (const para of String(text).split('\n')) {
    const words = para.split(/(\s+)/);
    let line = '';
    for (const w of words) {
      const t = line + w;
      if (font.widthOfTextAtSize(t, size) <= maxW || !line.trim()) {
        if (font.widthOfTextAtSize(t, size) > maxW && !line.trim()) {
          let chunk = '';
          for (const c of t) { if (font.widthOfTextAtSize(chunk + c, size) > maxW && chunk) { lines.push(chunk); chunk = c; } else chunk += c; }
          line = chunk;
        } else line = t;
      } else { lines.push(line.trimEnd()); line = w.trimStart(); }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

/** Text an einer Ankerposition setzen (tl, tc, tr, ml, mc, mr, bl, bc, br) – drehungsbewusst */
export function stampText(page: PDFPage, font: PDFFont, text: string, pos: string, size: number, marginMm: number, col: ReturnType<typeof rgb>, opacity = 1) {
  const g = geom(page);
  const t = safeText(font, text);
  const w = font.widthOfTextAtSize(t, size), m = marginMm * MM;
  const dx = pos[1] === 'l' ? m : pos[1] === 'c' ? (g.dw - w) / 2 : g.dw - m - w;
  const dy = pos[0] === 't' ? m + size * 0.8 : pos[0] === 'm' ? g.dh / 2 + size * 0.35 : g.dh - m;
  const o = g.map(dx, dy);
  page.drawText(t, { x: o.x, y: o.y, size, font, color: col, opacity, rotate: degrees(g.r) });
}

export function paperSize(name: string, landscape = false): [number, number] {
  const p = PAPER.find(x => x[0] === name) || PAPER[1];
  const w = p[1] * MM, h = p[2] * MM;
  return landscape ? [h, w] : [w, h];
}

/** Seiten neu anordnen, ohne Formulare/Lesezeichen zu verlieren (Seitenobjekte bleiben erhalten) */
export function reorderPages(pl: PDFDocument, order: number[]) {
  const pages = pl.getPages();
  for (const o of order) {
    const idx = pl.getPages().indexOf(pages[o]);
    pl.removePage(idx);
    pl.addPage(pages[o]);
  }
}

// ---------------------------------------------------------------------------
// Rasterisieren (Seiten als Bild neu aufbauen)
// ---------------------------------------------------------------------------
export type PixelFilter = (c: HTMLCanvasElement, i: number) => HTMLCanvasElement | void;
export async function rasterize(bytes: Uint8Array, idxs: Set<number> | null, opts: { dpi?: number; fmt?: 'jpeg' | 'png'; q?: number; filter?: PixelFilter } = {}, progress?: (p: number) => void) {
  const { dpi = 150, fmt = 'jpeg', q = 0.82, filter } = opts;
  const src = await openPdf(bytes);
  const pl = await plLoad(bytes);
  const out = await PDFDocument.create();
  const n = src.numPages;
  for (let i = 0; i < n; i++) {
    if (idxs && !idxs.has(i)) { const [p] = await out.copyPages(pl, [i]); out.addPage(p); continue; }
    const page = await src.getPage(i + 1);
    const v1 = page.getViewport({ scale: 1 });
    let c = await renderPage(src, i + 1, { scale: dpi / 72 });
    if (filter) c = filter(c, i) || c;
    const blob = await canvasBlob(c, fmt === 'png' ? 'image/png' : 'image/jpeg', q);
    const ib = new Uint8Array(await blob.arrayBuffer());
    const img = fmt === 'png' ? await out.embedPng(ib) : await out.embedJpg(ib);
    const p = out.addPage([v1.width, v1.height]);
    p.drawImage(img, { x: 0, y: 0, width: v1.width, height: v1.height });
    c.width = 0;
    progress?.((i + 1) / n);
    await sleep(0);
  }
  try { const t = pl.getTitle(); if (t) out.setTitle(t); } catch { /* egal */ }
  src.destroy();
  return out.save({ useObjectStreams: true });
}

export const FILTERS: Record<string, PixelFilter> = {
  gray(c) {
    const ctx = c.getContext('2d')!, im = ctx.getImageData(0, 0, c.width, c.height), d = im.data;
    for (let k = 0; k < d.length; k += 4) { const y = d[k] * 0.299 + d[k + 1] * 0.587 + d[k + 2] * 0.114; d[k] = d[k + 1] = d[k + 2] = y; }
    ctx.putImageData(im, 0, 0);
  },
  invert(c) {
    const ctx = c.getContext('2d')!, im = ctx.getImageData(0, 0, c.width, c.height), d = im.data;
    for (let k = 0; k < d.length; k += 4) { d[k] = 255 - d[k]; d[k + 1] = 255 - d[k + 1]; d[k + 2] = 255 - d[k + 2]; }
    ctx.putImageData(im, 0, 0);
  },
  scan(c, i) {
    const o = document.createElement('canvas'); o.width = c.width; o.height = c.height;
    const ctx = o.getContext('2d')!;
    ctx.fillStyle = '#f2f1ed'; ctx.fillRect(0, 0, o.width, o.height);
    const a = (((i * 7919) % 13) / 13 - 0.5) * 0.012;
    ctx.translate(o.width / 2, o.height / 2); ctx.rotate(a); ctx.translate(-o.width / 2, -o.height / 2);
    ctx.filter = 'grayscale(1) contrast(1.18) brightness(1.03) blur(0.35px)'; ctx.drawImage(c, 0, 0); ctx.filter = 'none'; ctx.setTransform(1, 0, 0, 1, 0, 0);
    const im = ctx.getImageData(0, 0, o.width, o.height), d = im.data;
    let seed = 1234 + i; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let k = 0; k < d.length; k += 4) { const n = (rnd() - 0.5) * 18; d[k] = Math.max(0, Math.min(255, d[k] + n)); d[k + 1] = Math.max(0, Math.min(255, d[k + 1] + n)); d[k + 2] = Math.max(0, Math.min(255, d[k + 2] + n - 2)); }
    ctx.putImageData(im, 0, 0);
    return o;
  },
};

export function adjustFilter(brightness: number, contrast: number, saturation: number, gamma = 1): PixelFilter {
  return (c) => {
    const ctx = c.getContext('2d')!, im = ctx.getImageData(0, 0, c.width, c.height), d = im.data;
    const cf = (259 * (contrast + 255)) / (255 * (259 - contrast));
    for (let k = 0; k < d.length; k += 4) {
      let r = d[k], g = d[k + 1], b = d[k + 2];
      r = cf * (r - 128) + 128 + brightness; g = cf * (g - 128) + 128 + brightness; b = cf * (b - 128) + 128 + brightness;
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      r = l + (r - l) * saturation; g = l + (g - l) * saturation; b = l + (b - l) * saturation;
      if (gamma !== 1) { r = 255 * Math.pow(Math.max(0, r) / 255, 1 / gamma); g = 255 * Math.pow(Math.max(0, g) / 255, 1 / gamma); b = 255 * Math.pow(Math.max(0, b) / 255, 1 / gamma); }
      d[k] = r; d[k + 1] = g; d[k + 2] = b;
    }
    ctx.putImageData(im, 0, 0);
  };
}

/** Ist das PDF verschlüsselt (auch nur mit Rechte-Passwort)? */
export async function isEncryptedPdf(b: Uint8Array): Promise<boolean> {
  try { return (await PDFDocument.load(b, { ignoreEncryption: true, updateMetadata: false, throwOnInvalidObject: false })).isEncrypted; }
  catch {
    // Notfalls im Rohtext nach dem Verschlüsselungs-Eintrag suchen
    const s = new TextDecoder('latin1').decode(b.length > 65536 ? new Uint8Array([...b.subarray(0, 32768), ...b.subarray(b.length - 32768)]) : b);
    return /\/Encrypt\s*(<<|\d+\s+\d+\s+R)/.test(s);
  }
}
