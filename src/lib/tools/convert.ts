// Umwandeln: PDF erstellen und PDF exportieren
import * as I from '../icons';
import type { Tool, ToolCtx, OutFile } from './types';
import { PAGES, pagesOf, outName } from './common';
import { py, pyRun, libreConvert, gs } from '../engines';
import { imagesToPdf, anyToPdf, markdownToHtml, OFFICE_EXT, IMAGE_EXT } from '../convert';
import { renderPage, canvasBlob, pageTexts } from '../pdf';
import { plLoad, plSave, PDFName, PDFArray } from '../ops';
import { baseName, PAPER } from '../util';
import { PDFDict } from 'pdf-lib';

import { L } from '../i18n';
async function renderPages(ctx: ToolCtx, idx: number[], dpi: number, mime: string, q = 0.9) {
  const out: { i: number; blob: Blob; w: number; h: number }[] = [];
  for (const [k, i] of idx.entries()) {
    const c = await renderPage(ctx.doc!.pdf!, i + 1, { scale: dpi / 72, background: mime === 'image/png' ? '#ffffff' : '#ffffff' });
    out.push({ i, blob: await canvasBlob(c, mime, q), w: c.width, h: c.height });
    c.width = 0;
    ctx.progress((k + 1) / idx.length, L("Seite {0}", i + 1));
  }
  return out;
}
const pad = (i: number, n: number) => String(i + 1).padStart(String(n).length, '0');

export async function pdfToPdfA(bytes: Uint8Array, level: 1 | 2 | 3, progress?: (p: number, m?: string) => void) {
  progress?.(-1, L("PDF/A wird erzeugt …"));
  const icc = new Uint8Array(await (await fetch('/engines/ghostscript/srgb.icc')).arrayBuffer());
  let hex = ''; for (const b of icc) hex += b.toString(16).padStart(2, '0');
  const def = `%!
[/_objdef {icc_PDFA} /type /stream /OBJ pdfmark
[{icc_PDFA} << /N 3 >> /PUT pdfmark
[{icc_PDFA} <${hex}> /PUT pdfmark
[/_objdef {OutputIntent_PDFA} /type /dict /OBJ pdfmark
[{OutputIntent_PDFA} << /Type /OutputIntent /S ${level === 1 ? '/GTS_PDFA1' : '/GTS_PDFA'} /DestOutputProfile {icc_PDFA} /OutputConditionIdentifier (sRGB) /Info (sRGB IEC61966-2.1) /RegistryName (http://www.color.org) >> /PUT pdfmark
[{Catalog} << /OutputIntents [ {OutputIntent_PDFA} ] >> /PUT pdfmark
`;
  const r = await gs([
    '-dNOSAFER', '-dBATCH', '-dNOPAUSE', '-sDEVICE=pdfwrite', `-dPDFA=${level}`, '-dPDFACompatibilityPolicy=1',
    `-dCompatibilityLevel=${level === 1 ? '1.4' : '1.7'}`, '-sColorConversionStrategy=UseDeviceIndependentColor',
    '-sICCProfilesDir=/', '-sOutputICCProfile=/srgb.icc', '-sDefaultRGBProfile=/srgb.icc', '-sBlendColorProfile=/srgb.icc',
    '-dCompressPages=true', '-dWriteObjStms=false', '-dWriteXRefStm=false', '-dEmbedAllFonts=true', '-dSubsetFonts=true', '-dAutoRotatePages=/None',
    '-sOutputFile=/out.pdf', '/pdfa.ps', '/in.pdf',
  ], { 'in.pdf': bytes, 'srgb.icc': icc, 'pdfa.ps': new TextEncoder().encode(def) }, ['out.pdf']);
  let out = r.files['out.pdf'];
  if (!out) throw new Error(L("PDF/A konnte nicht erzeugt werden"));
  if (level !== 1) {
    // Transparenzgruppen für PDF/A-2/3 ergänzen
    try {
      const pl = await plLoad(out);
      const intents = pl.catalog.lookup(PDFName.of('OutputIntents'));
      const prof = intents instanceof PDFArray ? (intents.lookup(0) as PDFDict | undefined)?.get(PDFName.of('DestOutputProfile')) : undefined;
      for (const p of pl.getPages()) {
        if (p.node.get(PDFName.of('Group'))) continue;
        const g = pl.context.obj({ Type: 'Group', S: 'Transparency', I: false, K: false }) as PDFDict;
        if (prof) g.set(PDFName.of('CS'), pl.context.obj([PDFName.of('ICCBased'), prof]));
        p.node.set(PDFName.of('Group'), g);
      }
      out = await pl.save({ useObjectStreams: false });
    } catch { /* gs-Ergebnis verwenden */ }
  }
  return out;
}

function tablesToSheets(tables: { page: number; rows: (string | null)[][] }[], XLSX: any) {
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();
  for (const [k, t] of tables.entries()) {
    let name = `S${t.page + 1} T${k + 1}`;
    while (used.has(name)) name += '_';
    used.add(name);
    const rows = t.rows.map(r => r.map(c => {
      const s = (c ?? '').replace(/\n/g, ' ').trim();
      const n = s.replace(/\./g, '').replace(',', '.');
      return /^-?\d+(\.\d+)?$/.test(n) && s.length < 16 ? Number(n) : s;
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name.slice(0, 31));
  }
  return wb;
}

export const PY_TABLES = `
doc = open_in()
out = []
for pno in json.loads(ARGS['pages']):
    page = doc[pno]
    try:
        tabs = page.find_tables(strategy=ARGS.get('strategy', 'lines'))
    except Exception:
        tabs = []
    if not tabs or not len(tabs.tables):
        try: tabs = page.find_tables(strategy='text')
        except Exception: tabs = []
    for t in (tabs.tables if tabs else []):
        rows = t.extract()
        if rows and len(rows) > 1 and max(len(r) for r in rows) > 1:
            out.append({'page': pno, 'rows': rows})
    progress((pno + 1) / doc.page_count)
out`;

export const convertTools: Tool[] = [
  // ---------------- Erstellen ----------------
  {
    id: 'create-office', label: L("Office-Dateien in PDF"), short: L("Aus Office"), icon: I.FileText, noDoc: true, engine: 'libreoffice',
    desc: L("Word, Excel, PowerPoint, OpenDocument, RTF und mehr in PDF umwandeln – auch mehrere auf einmal."), keys: L("word excel powerpoint docx xlsx pptx odt erstellen"),
    fields: [
      { key: 'files', type: 'files', label: L("Dateien"), accept: OFFICE_EXT },
      { key: 'merge', type: 'check', label: L("Zu einem PDF zusammenführen"), def: false },
      { key: 'pdfa', type: 'select', label: L("Standard"), opts: [['', L("Normales PDF")], ['PDF/A-1b', L("PDF/A-1b (Archiv)")], ['PDF/A-2b', L("PDF/A-2b (Archiv)")], ['PDF/A-3b', L("PDF/A-3b (Archiv)")]], def: '' },
    ],
    action: L("Umwandeln"),
    run: async (v, ctx) => {
      const files = v.files || []; if (!files.length) throw new Error(L("Bitte Dateien wählen"));
      const outs: { name: string; bytes: Uint8Array }[] = [];
      for (const [k, f] of files.entries()) { ctx.progress(k / files.length, f.name); outs.push({ name: baseName(f.name) + '.pdf', bytes: await libreConvert(f.bytes, f.name, 'pdf', { pdfa: v.pdfa || undefined }) }); }
      if (v.merge && outs.length > 1) {
        const { PDFDocument } = await import('pdf-lib'); const m = await PDFDocument.create();
        for (const o of outs) { const s = await plLoad(o.bytes); (await m.copyPages(s, s.getPageIndices())).forEach(p => m.addPage(p)); }
        return { doc: { bytes: await m.save({ useObjectStreams: true }), name: L("Zusammengeführt.pdf"), label: L("Aus {0} Office-Dateien", outs.length) } };
      }
      return { docs: outs.map(o => ({ ...o, label: L("Aus Office umgewandelt") })) };
    },
  },
  {
    id: 'create-images', label: L("Bilder in PDF"), short: L("Aus Bildern"), icon: I.Images, noDoc: true,
    desc: L("Fotos und Scans (JPG, PNG, HEIC, TIFF, WebP, SVG …) zu einem PDF zusammenstellen."), keys: L("jpg png heic tiff foto handy scan"),
    fields: [
      { key: 'files', type: 'files', label: L("Bilder (Reihenfolge = Seitenfolge)"), accept: IMAGE_EXT },
      { key: 'size', type: 'select', label: L("Seitenformat"), opts: [['A4', 'A4'], ['Letter', 'Letter'], ['A5', 'A5'], ['A3', 'A3'], ['image', L("Wie das Bild")]], def: 'A4' },
      { key: 'orient', type: 'seg', label: L("Ausrichtung"), opts: [['auto', L("Automatisch")], ['port', L("Hoch")], ['land', L("Quer")]], def: 'auto', when: v => v.size !== 'image' },
      { key: 'margin', type: 'number', label: L("Rand (mm)"), def: 0, min: 0, max: 40, when: v => v.size !== 'image' },
      { key: 'quality', type: 'range', label: L("JPEG-Qualität"), def: 90, min: 40, max: 100, unit: ' %' },
    ],
    action: L("Erstellen"),
    run: async (v, ctx) => {
      const files = v.files || []; if (!files.length) throw new Error(L("Bitte Bilder wählen"));
      ctx.progress(-1, L("{0} Bild(er) werden gesetzt …", files.length));
      const bytes = await imagesToPdf(files.map((f: any) => ({ name: f.name, bytes: f.bytes })), { size: v.size, orient: v.orient, margin: v.margin, quality: v.quality / 100 });
      return { doc: { bytes, name: files.length > 1 ? L("Bilder ({0}).pdf", files.length) : baseName(files[0].name) + '.pdf', label: L("Aus Bildern erstellt") } };
    },
  },
  {
    id: 'create-any', label: L("Weitere Formate in PDF"), short: L("Weitere"), icon: I.FileType, noDoc: true,
    desc: L("E-Books (EPUB, MOBI, FB2), Comics (CBZ), XPS, E-Mails (EML, MSG), Markdown, HTML, Text, JSON und XML."), keys: 'epub mobi xps eml msg markdown html txt json',
    fields: [{ key: 'files', type: 'files', label: L("Dateien"), accept: ['epub', 'mobi', 'fb2', 'cbz', 'xps', 'oxps', 'eml', 'msg', 'md', 'markdown', 'html', 'htm', 'txt', 'json', 'xml'] }],
    action: L("Umwandeln"),
    run: async (v, ctx) => {
      const files = v.files || []; if (!files.length) throw new Error(L("Bitte Dateien wählen"));
      const docs: { bytes: Uint8Array; name: string; label?: string }[] = [];
      for (const [k, f] of files.entries()) { ctx.progress(k / files.length, f.name); docs.push({ bytes: await anyToPdf(f.name, f.bytes, ctx.progress), name: baseName(f.name) + '.pdf', label: L("Umgewandelt") }); }
      return { docs };
    },
  },
  {
    id: 'create-markdown', label: L("Text schreiben und als PDF setzen"), short: L("Aus Text"), icon: I.BookText, noDoc: true, engine: 'pymupdf',
    desc: L("Markdown oder Text eingeben und als sauber gesetztes PDF erzeugen."), keys: L("markdown schreiben notiz"),
    fields: [
      { key: 'title', type: 'text', label: L("Titel (Dateiname)"), def: L("Notiz") },
      { key: 'md', type: 'textarea', label: L("Inhalt (Markdown)"), def: L("# Überschrift\n\nText mit **fett** und *kursiv*.\n\n- Punkt eins\n- Punkt zwei\n") },
      { key: 'size', type: 'select', label: L("Papier"), opts: [['a4', 'A4'], ['letter', 'Letter'], ['a5', 'A5']], def: 'a4' },
    ],
    action: L("Erstellen"),
    run: async v => {
      const { htmlToPdf } = await import('../convert');
      return { doc: { bytes: await htmlToPdf(await markdownToHtml(v.md || ''), v.size), name: (v.title || L("Notiz")) + '.pdf', label: L("Aus Text gesetzt") } };
    },
  },
  // ---------------- Exportieren ----------------
  {
    id: 'to-word', label: L("Als Word-Dokument exportieren"), short: 'Word', icon: I.FileText, engine: 'pymupdf',
    desc: L("Bearbeitbares .docx mit Absätzen, Tabellen und Bildern (pdf2docx)."), keys: L("docx word bearbeitbar umwandeln"),
    fields: [PAGES('all'), { key: 'fmt', type: 'seg', label: L("Format"), opts: [['docx', 'Word (.docx)'], ['odt', 'OpenDocument (.odt)'], ['rtf', 'RTF']], def: 'docx' }],
    action: L("Exportieren"),
    run: async (v, ctx) => {
      const idx = pagesOf(v.pages, ctx);
      ctx.progress(-1, L("Layout wird analysiert …"));
      let data = await py<Uint8Array>('pdfToDocx', ctx.bytes, idx.length === ctx.doc!.numPages ? undefined : idx);
      if (v.fmt !== 'docx') { ctx.progress(-1, L("Wird umgewandelt …")); data = await libreConvert(data, 'dokument.docx', v.fmt); }
      return { files: [{ name: outName(ctx, '', v.fmt) as string, data }] };
    },
  },
  {
    id: 'to-excel', label: L("Als Excel-Tabelle exportieren"), short: 'Excel', icon: I.FileSpreadsheet, engine: 'pymupdf',
    desc: L("Erkannte Tabellen als Arbeitsblätter – Zahlen werden als Zahlen übernommen."), keys: L("xlsx excel tabelle csv ods"),
    fields: [PAGES('all'), { key: 'mode', type: 'seg', label: L("Inhalt"), opts: [['tables', L("Erkannte Tabellen")], ['text', L("Alle Textzeilen")]], def: 'tables' }, { key: 'fmt', type: 'seg', label: L("Format"), opts: [['xlsx', 'Excel'], ['ods', 'OpenDocument'], ['csv', 'CSV']], def: 'xlsx' }],
    action: L("Exportieren"),
    run: async (v, ctx) => {
      const XLSX: any = await import('xlsx');
      let tables: { page: number; rows: (string | null)[][] }[] = [];
      if (v.mode === 'tables') tables = (await pyRun<any[]>(PY_TABLES, { files: { 'in.pdf': ctx.bytes }, vars: { pages: JSON.stringify(pagesOf(v.pages, ctx)) }, progress: ctx.progress })).result;
      if (!tables.length) {
        const r = await pyRun<any[]>(`
doc = open_in()
out = []
for pno in json.loads(ARGS['pages']):
    rows = []
    for b in doc[pno].get_text('dict')['blocks']:
        for l in b.get('lines', []):
            cells = []; last = None
            for s in l['spans']:
                if last is not None and s['bbox'][0] - last > s['size'] * 1.5:
                    cells.append('')
                cells[-1:] = [(cells[-1] if cells else '') + s['text']] if cells else [s['text']]
                last = s['bbox'][2]
            rows.append([c.strip() for c in cells])
    out.append({'page': pno, 'rows': rows})
out`, { files: { 'in.pdf': ctx.bytes }, vars: { pages: JSON.stringify(pagesOf(v.pages, ctx)) } });
        tables = r.result;
        if (v.mode === 'tables') ctx.progress(-1, L("Keine Tabellen erkannt – exportiere Textzeilen"));
      }
      if (v.fmt === 'csv') {
        const files: OutFile[] = tables.map((t, k) => ({ name: outName(ctx, `S${t.page + 1}${tables.length > 1 ? '-' + (k + 1) : ''}`, 'csv'), data: new Blob(['﻿' + XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet(t.rows), { FS: ';' })], { type: 'text/csv' }) }));
        return { files, zipName: outName(ctx, L("Tabellen"), 'zip') };
      }
      const wb = tablesToSheets(tables, XLSX);
      const data = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: v.fmt === 'ods' ? 'ods' : 'xlsx' }));
      return { files: [{ name: outName(ctx, '', v.fmt), data }], message: v.mode === 'tables' ? L("{0} Tabelle(n) exportiert", tables.length) : undefined };
    },
  },
  {
    id: 'to-pptx', label: L("Als PowerPoint exportieren"), short: 'PowerPoint', icon: I.Presentation,
    desc: L("Jede Seite wird eine Folie in voller Auflösung; der Seitentext landet in den Notizen."), keys: L("pptx präsentation folien"),
    fields: [PAGES('all'), { key: 'dpi', type: 'select', label: L("Auflösung"), opts: [['110', L("Bildschirm")], ['160', L("Hoch")], ['220', L("Sehr hoch")]], def: '160' }, { key: 'notes', type: 'check', label: L("Seitentext als Sprechernotizen"), def: true }],
    action: L("Exportieren"),
    run: async (v, ctx) => {
      const PptxGenJS = (await import('pptxgenjs')).default as any;
      const pres = new PptxGenJS();
      const idx = pagesOf(v.pages, ctx);
      const p0 = ctx.doc!.pages[idx[0]];
      const W = 10, H = +(10 * p0.h / p0.w).toFixed(3);
      pres.defineLayout({ name: 'PDF', width: W, height: H }); pres.layout = 'PDF';
      const texts = v.notes ? await pageTexts(ctx.doc!.pdf!) : [];
      for (const r of await renderPages(ctx, idx, +v.dpi, 'image/jpeg', 0.9)) {
        const s = pres.addSlide();
        const data = await new Promise<string>(res => { const fr = new FileReader(); fr.onload = () => res(fr.result as string); fr.readAsDataURL(r.blob); });
        const pg = ctx.doc!.pages[r.i]; const ar = pg.h / pg.w; const w = Math.min(W, H / ar), h = w * ar;
        s.addImage({ data, x: (W - w) / 2, y: (H - h) / 2, w, h });
        if (v.notes && texts[r.i]) s.addNotes(texts[r.i]);
      }
      const data = new Uint8Array(await pres.write({ outputType: 'arraybuffer' }));
      return { files: [{ name: outName(ctx, '', 'pptx'), data }] };
    },
  },
  {
    id: 'to-images', label: L("Als Bilder exportieren"), short: L("Bilder"), icon: I.Image,
    desc: L("Seiten als PNG, JPEG, WebP, TIFF oder BMP in wählbarer Auflösung."), keys: L("png jpg jpeg webp tiff bmp bild export"),
    fields: [
      { key: 'fmt', type: 'seg', label: L("Format"), opts: [['png', 'PNG'], ['jpg', 'JPEG'], ['webp', 'WebP'], ['tiff', 'TIFF'], ['bmp', 'BMP']], def: 'png' },
      { key: 'dpi', type: 'select', label: L("Auflösung"), opts: [['72', L("72 dpi (Bildschirm)")], ['150', '150 dpi'], ['200', '200 dpi'], ['300', L("300 dpi (Druck)")], ['600', '600 dpi']], def: '150' },
      { key: 'q', type: 'range', label: L("Qualität"), def: 90, min: 30, max: 100, unit: ' %', when: v => v.fmt === 'jpg' || v.fmt === 'webp' },
      PAGES('all'),
    ],
    action: L("Exportieren"),
    run: async (v, ctx) => {
      const idx = pagesOf(v.pages, ctx); const n = ctx.doc!.numPages;
      const files: OutFile[] = [];
      if (v.fmt === 'tiff' || v.fmt === 'bmp') {
        const UTIF: any = (await import('utif2')).default || (await import('utif2'));
        for (const [k, i] of idx.entries()) {
          const c = await renderPage(ctx.doc!.pdf!, i + 1, { scale: v.dpi / 72 });
          const rgba = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
          const data = v.fmt === 'tiff' ? new Uint8Array(UTIF.encodeImage(rgba, c.width, c.height)) : encodeBmp(rgba, c.width, c.height);
          files.push({ name: L("{0} – S. {1}.{2}", baseName(ctx.doc!.name), pad(i, n), v.fmt), data });
          c.width = 0; ctx.progress((k + 1) / idx.length);
        }
      } else {
        const mime = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }[v.fmt as 'png'];
        for (const r of await renderPages(ctx, idx, +v.dpi, mime, (v.q || 90) / 100)) files.push({ name: L("{0} – S. {1}.{2}", baseName(ctx.doc!.name), pad(r.i, n), v.fmt), data: r.blob });
      }
      return { files, zipName: outName(ctx, L("Bilder"), 'zip') };
    },
  },
  {
    id: 'to-svg', label: L("Als SVG exportieren"), short: 'SVG', icon: I.FileCode, engine: 'pymupdf', desc: L("Vektorgrafik je Seite – verlustfrei skalierbar, z. B. für Grafikprogramme."), keys: L("svg vektor"),
    fields: [PAGES('all')], action: L("Exportieren"),
    run: async (v, ctx) => {
      const idx = pagesOf(v.pages, ctx);
      const svgs = await py<string[]>('pdfToSvg', ctx.bytes, idx);
      return { files: svgs.map((s, k) => ({ name: L("{0} – S. {1}.svg", baseName(ctx.doc!.name), pad(idx[k], ctx.doc!.numPages)), data: new Blob([s], { type: 'image/svg+xml' }) })), zipName: outName(ctx, 'SVG', 'zip') };
    },
  },
  {
    id: 'to-text', label: L("Als Text exportieren"), short: 'Text', icon: I.FileText, desc: L("Reiner Text mit erhaltenem Zeilenlayout."), keys: L("txt text kopieren extrahieren"),
    fields: [{ key: 'layout', type: 'check', label: L("Spaltenlayout beibehalten"), def: true }, { key: 'sep', type: 'check', label: L("Seitentrenner einfügen"), def: true }, PAGES('all')], action: L("Exportieren"), engine: 'pymupdf',
    run: async (v, ctx) => {
      const r = await pyRun<string[]>(`
doc = open_in()
out = []
for p in json.loads(ARGS['pages']):
    if ARGS['layout']:
        out.append('\\n\\n'.join(b[4].strip() for b in doc[p].get_text('blocks', sort=True) if b[6] == 0))
    else:
        out.append(doc[p].get_text('text', sort=True))
out`, { files: { 'in.pdf': ctx.bytes }, vars: { pages: JSON.stringify(pagesOf(v.pages, ctx)), layout: !!v.layout } });
      const idx = pagesOf(v.pages, ctx);
      const s = r.result.map((t, k) => (v.sep ? L("––– Seite {0} –––\n", idx[k] + 1) : '') + t.trim()).join('\n\n');
      if (!s.replace(/––– Seite \d+ –––/g, '').trim()) return { message: L("Kein Text gefunden. Für gescannte Seiten zuerst „Texterkennung“ ausführen.") };
      return { files: [{ name: outName(ctx, '', 'txt'), data: new Blob([s], { type: 'text/plain' }) }] };
    },
  },
  {
    id: 'to-markdown', label: L("Als Markdown exportieren"), short: 'Markdown', icon: I.BookText, engine: 'pymupdf', desc: L("Strukturierter Text mit Überschriften, Listen und Tabellen – ideal für Wikis und KI."), keys: L("md markdown wiki ki llm"),
    fields: [{ key: 'breaks', type: 'check', label: L("Seitenumbrüche markieren"), def: false }, { key: 'images', type: 'check', label: L("Bilder einbetten"), def: false }, PAGES('all')], action: L("Exportieren"),
    run: async (v, ctx) => {
      const md = await py<string>('pdfToMarkdown', ctx.bytes, { pageBreaks: !!v.breaks, includeImages: !!v.images, pages: pagesOf(v.pages, ctx) });
      if (!md.trim()) return { message: L("Kein Text gefunden.") };
      return { files: [{ name: outName(ctx, '', 'md'), data: new Blob([md], { type: 'text/markdown' }) }] };
    },
  },
  {
    id: 'to-html', label: L("Als HTML exportieren"), short: 'HTML', icon: I.Globe, engine: 'pymupdf', desc: L("Webseite mit Text und Bildern an ihren Positionen."), keys: L("html web"),
    direct: true,
    run: async (_v, ctx) => ({ files: [{ name: outName(ctx, '', 'html'), data: new Blob([await py<string>('pdfToHtml', ctx.bytes)], { type: 'text/html' }) }] }),
  },
  {
    id: 'to-json', label: L("Struktur als JSON exportieren"), short: 'JSON', icon: I.FileJson, engine: 'pymupdf', desc: L("Blöcke, Zeilen, Schriften und Positionen für die Weiterverarbeitung."), keys: L("json daten struktur"),
    direct: true,
    run: async (_v, ctx) => ({ files: [{ name: outName(ctx, '', 'json'), data: new Blob([JSON.stringify(await py<any>('pdfToJson', ctx.bytes), null, 1)], { type: 'application/json' }) }] }),
  },
  {
    id: 'to-epub', label: L("Als E-Book (EPUB) exportieren"), short: 'EPUB', icon: I.BookOpen, engine: 'pymupdf', desc: L("Fließtext-E-Book für Reader wie Kindle oder Tolino."), keys: L("epub ebook kindle tolino"),
    fields: [{ key: 'title', type: 'text', label: L("Titel"), def: '' }, { key: 'author', type: 'text', label: L("Autor"), def: '' }], action: L("Exportieren"),
    run: async (v, ctx) => {
      const md = await py<string>('pdfToMarkdown', ctx.bytes, { pageBreaks: false, includeImages: false });
      const title = v.title || baseName(ctx.doc!.name);
      const data = await buildEpub(title, v.author || '', md);
      return { files: [{ name: outName(ctx, '', 'epub'), data }] };
    },
  },
  {
    id: 'to-cbz', label: L("Als Comic-Archiv (CBZ) exportieren"), short: 'CBZ', icon: I.Archive, desc: L("Seiten als Bilder in einem Comic-Archiv."), keys: L("cbz comic"),
    fields: [{ key: 'dpi', type: 'select', label: L("Auflösung"), opts: [['120', 'Normal'], ['180', L("Hoch")]], def: '120' }], action: L("Exportieren"),
    run: async (v, ctx) => {
      const zip = new (await import('jszip')).default(); const n = ctx.doc!.numPages;
      for (const r of await renderPages(ctx, [...Array(n).keys()], +v.dpi, 'image/jpeg', 0.88)) zip.file(`${pad(r.i, n)}.jpg`, r.blob);
      return { files: [{ name: outName(ctx, '', 'cbz'), data: await zip.generateAsync({ type: 'uint8array' }) }] };
    },
  },
  {
    id: 'to-pdfa', label: L("In PDF/A umwandeln"), short: 'PDF/A', icon: I.Archive, engine: 'ghostscript',
    desc: L("Archivtaugliches PDF/A mit eingebetteten Schriften und Farbprofil – z. B. für Behörden und die Langzeitablage."), keys: L("archiv langzeit pdfa iso 19005 behörde"),
    fields: [{ key: 'level', type: 'seg', label: L("Stufe"), opts: [['1', 'PDF/A-1b'], ['2', 'PDF/A-2b'], ['3', 'PDF/A-3b']], def: '2' }, { key: 'note', type: 'note', text: L("PDF/A-2b ist für die meisten Zwecke richtig. PDF/A-1b verlangt älteres PDF ohne Transparenz.") }],
    action: L("Umwandeln"),
    run: async (v, ctx) => ({ bytes: await pdfToPdfA(ctx.bytes, +v.level as 1 | 2 | 3, ctx.progress), label: L("In PDF/A-{0}b umgewandelt", v.level) }),
  },
];

function encodeBmp(rgba: Uint8ClampedArray, w: number, h: number) {
  const row = Math.ceil((w * 3) / 4) * 4, size = 54 + row * h;
  const b = new Uint8Array(size); const dv = new DataView(b.buffer);
  b[0] = 66; b[1] = 77; dv.setUint32(2, size, true); dv.setUint32(10, 54, true); dv.setUint32(14, 40, true);
  dv.setInt32(18, w, true); dv.setInt32(22, h, true); dv.setUint16(26, 1, true); dv.setUint16(28, 24, true); dv.setUint32(34, row * h, true);
  dv.setInt32(38, 3780, true); dv.setInt32(42, 3780, true);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const s = ((h - 1 - y) * w + x) * 4, d = 54 + y * row + x * 3; b[d] = rgba[s + 2]; b[d + 1] = rgba[s + 1]; b[d + 2] = rgba[s]; }
  return b;
}

async function buildEpub(title: string, author: string, md: string) {
  const html = await markdownToHtml(md);
  // In Kapitel an H1/H2 aufteilen
  const parts = html.split(/(?=<h[12][ >])/).filter(s => s.trim());
  const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
  const toXhtml = (s: string) => s.replace(/<br>/g, '<br/>').replace(/<hr>/g, '<hr/>').replace(/<img([^>]*?)(?<!\/)>/g, '<img$1/>');
  const zip = new (await import('jszip')).default();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file('META-INF/container.xml', '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
  const chapters = parts.map((p, i) => ({ id: `c${i + 1}`, file: `c${i + 1}.xhtml`, title: (p.match(/<h[12][^>]*>(.*?)<\/h[12]>/)?.[1] || L("Abschnitt {0}", i + 1)).replace(/<[^>]+>/g, ''), body: p }));
  for (const c of chapters) zip.file(`OEBPS/${c.file}`, `<?xml version="1.0" encoding="utf-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xml:lang="de"><head><title>${esc(c.title)}</title><link rel="stylesheet" href="s.css"/></head><body>${toXhtml(c.body)}</body></html>`);
  zip.file('OEBPS/s.css', 'body{font-family:serif;line-height:1.5}h1,h2,h3{font-family:sans-serif}table{border-collapse:collapse}td,th{border:1px solid #999;padding:2px 4px}');
  zip.file('OEBPS/nav.xhtml', L("<?xml version=\"1.0\" encoding=\"utf-8\"?><!DOCTYPE html><html xmlns=\"http://www.w3.org/1999/xhtml\" xmlns:epub=\"http://www.idpf.org/2007/ops\"><head><title>Inhalt</title></head><body><nav epub:type=\"toc\"><h1>Inhalt</h1><ol>{0}</ol></nav></body></html>", chapters.map(c => `<li><a href="${c.file}">${esc(c.title)}</a></li>`).join('')));
  const uuid = crypto.randomUUID();
  zip.file('OEBPS/content.opf', `<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">urn:uuid:${uuid}</dc:identifier><dc:title>${esc(title)}</dc:title><dc:creator>${esc(author)}</dc:creator><dc:language>de</dc:language><meta property="dcterms:modified">${new Date().toISOString().slice(0, 19)}Z</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="css" href="s.css" media-type="text/css"/>${chapters.map(c => `<item id="${c.id}" href="${c.file}" media-type="application/xhtml+xml"/>`).join('')}</manifest><spine>${chapters.map(c => `<itemref idref="${c.id}"/>`).join('')}</spine></package>`);
  return zip.generateAsync({ type: 'uint8array', mimeType: 'application/epub+zip' });
}
export { PAPER };
