// pdf.js-Anbindung (Legacy-Build: läuft auch in älteren WebKit-Versionen von macOS)
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import type { PDFDocumentProxy } from 'pdfjs-dist/types/src/display/api';

import { L } from './i18n';
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
(globalThis as any).pdfjsLib = pdfjsLib;

// pdf.js 5.4 führt die Seitenzahl in einem globalen Singleton (PagesMapper) – bei mehreren
// offenen Dokumenten scheitert getPage() dann an der Seitenzahl des zuletzt angezeigten.
// Werkbank nutzt das Umsortieren von pdf.js nicht, daher wird die Prüfung neutralisiert.
{
  const PM = (pdfjsLib as any).PagesMapper;
  if (PM?.prototype) Object.defineProperty(PM.prototype, 'pagesNumber', { configurable: true, get: () => Number.MAX_SAFE_INTEGER, set: () => {} });
}

export { pdfjsLib };
export type { PDFDocumentProxy };

export const PDFJS_ASSETS = {
  cMapUrl: '/engines/pdfjs/cmaps/',
  standardFontDataUrl: '/engines/pdfjs/standard_fonts/',
};

export class PasswordNeeded extends Error {
  constructor(public retry: boolean) { super(retry ? L("Falsches Passwort") : L("Passwort nötig")); }
}

export async function openPdf(bytes: Uint8Array, password?: string): Promise<PDFDocumentProxy> {
  const task = pdfjsLib.getDocument({
    data: bytes.slice(),
    password,
    cMapUrl: PDFJS_ASSETS.cMapUrl,
    cMapPacked: true,
    standardFontDataUrl: PDFJS_ASSETS.standardFontDataUrl,
    isEvalSupported: false,
    enableXfa: false,
    useSystemFonts: false,
  });
  try {
    return await task.promise;
  } catch (e: any) {
    if (e?.name === 'PasswordException') throw new PasswordNeeded(e.code === 2);
    throw e;
  }
}

/** Seite als Canvas rendern (für Vorschaubilder, Export, Vergleich, OCR) */
export async function renderPage(pdf: PDFDocumentProxy, n: number, opts: { width?: number; scale?: number; background?: string; forms?: boolean } = {}) {
  const page = await pdf.getPage(n);
  const v1 = page.getViewport({ scale: 1 });
  const scale = opts.scale ?? (opts.width ? opts.width / v1.width : 1);
  const vp = page.getViewport({ scale });
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(vp.width)); c.height = Math.max(1, Math.round(vp.height));
  const ctx = c.getContext('2d', { willReadFrequently: false })!;
  ctx.fillStyle = opts.background ?? '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, canvas: c, viewport: vp, annotationMode: opts.forms === false ? pdfjsLib.AnnotationMode.DISABLE : pdfjsLib.AnnotationMode.ENABLE_STORAGE } as any).promise;
  return c;
}

export async function canvasBlob(c: HTMLCanvasElement, type = 'image/png', q = 0.9): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error(L("Bild konnte nicht erzeugt werden")))), type, q));
}

/** Text je Seite (mit Zeilenumbrüchen) */
export async function pageTexts(pdf: PDFDocumentProxy): Promise<string[]> {
  const out: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const tc = await (await pdf.getPage(i)).getTextContent();
    out.push(tc.items.map((it: any) => (it.str ?? '') + (it.hasEOL ? '\n' : '')).join(''));
  }
  return out;
}
