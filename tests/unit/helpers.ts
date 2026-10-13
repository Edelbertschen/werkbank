// Testhilfen: echte PDFs bauen, echte Dokumente laden, echte Werkzeuge ausführen.
import { PDFDocument, StandardFonts, degrees } from 'pdf-lib';
import { Doc } from '../../src/lib/doc.svelte';
import { openPdf } from '../../src/lib/pdf';
import { tool } from '../../src/lib/tools';
import { defaults } from '../../src/lib/fields';
import type { ToolCtx, ToolResult } from '../../src/lib/tools/types';

export interface PageSpec { w?: number; h?: number; rot?: number; text?: string }

/** PDF mit beschrifteten Seiten („Seite 1“, „Seite 2“ …) erzeugen */
export async function makePdf(pages: PageSpec[] | number = 3): Promise<Uint8Array> {
  const specs: PageSpec[] = typeof pages === 'number' ? Array.from({ length: pages }, () => ({})) : pages;
  const d = await PDFDocument.create();
  const f = await d.embedFont(StandardFonts.Helvetica);
  specs.forEach((s, i) => {
    const p = d.addPage([s.w ?? 595, s.h ?? 842]);
    p.drawText(s.text ?? `Seite ${i + 1}`, { x: 60, y: (s.h ?? 842) - 80, size: 24, font: f });
    if (s.rot) p.setRotation(degrees(s.rot));
  });
  return d.save();
}

export async function loadDoc(bytes: Uint8Array, name = 'test.pdf') {
  const d = new Doc(name, bytes, null);
  await d.load();
  return d;
}

export function ctxOf(doc: Doc, o: { current?: number; selection?: number[] } = {}): ToolCtx {
  return { doc, bytes: doc.bytes, current: o.current ?? 0, selection: o.selection ?? [], progress: () => {} };
}

/** Werkzeug wie in der App ausführen: Vorgaben + eigene Werte */
export async function run(id: string, doc: Doc, values: Record<string, any> = {}, o: { current?: number; selection?: number[] } = {}): Promise<ToolResult> {
  const t = tool(id);
  const r = await t.run!({ ...defaults(t.fields), ...values }, ctxOf(doc, o));
  return r || {};
}

/** Text je Seite (pdf.js) */
export async function texts(bytes: Uint8Array): Promise<string[]> {
  const pdf = await openPdf(bytes);
  const out: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const tc = await (await pdf.getPage(i)).getTextContent();
    out.push(tc.items.map((x: any) => x.str).join(' ').replace(/\s+/g, ' ').trim());
  }
  await pdf.destroy();
  return out;
}

/** Textstücke mit Position in Anzeige-Koordinaten (0..1, Ursprung oben links, Drehung berücksichtigt) */
export async function textBoxes(bytes: Uint8Array, pageIndex: number) {
  const pdf = await openPdf(bytes);
  const page = await pdf.getPage(pageIndex + 1);
  const vp = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  const out = tc.items.filter((x: any) => x.str.trim()).map((x: any) => {
    const [px, py] = vp.convertToViewportPoint(x.transform[4], x.transform[5]);
    return { str: x.str as string, x: px / vp.width, y: py / vp.height };
  });
  await pdf.destroy();
  return out;
}

export async function pageInfo(bytes: Uint8Array) {
  const d = await PDFDocument.load(bytes);
  return d.getPages().map(p => { const b = p.getCropBox(); return { w: Math.round(b.width), h: Math.round(b.height), rot: p.getRotation().angle }; });
}
