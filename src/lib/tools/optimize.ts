// Optimieren: Größe, Scans, Darstellung, Reparatur
import * as I from '../icons';
import type { Tool, ToolCtx } from './types';
import { PAGES, pagesOf } from './common';
import { py, pyRun, gs, qpdf, ocrWorkerFor } from '../engines';
import { rasterize, FILTERS, adjustFilter } from '../ops';
import { renderPage } from '../pdf';
import { fmtSize, fmtNum } from '../util';
import { app, savePrefs } from '../app.svelte';

import { L } from '../i18n';
export const OCR_LANGS: [string, string][] = [['deu', L("Deutsch")], ['eng', L("Englisch")]];

const shrinkMsg = (a: number, b: number) => `${fmtSize(a)} → ${fmtSize(b)} (−${fmtNum((1 - b / a) * 100)} %)`;

export async function runOcr(bytes: Uint8Array, ctx: ToolCtx, opts: { pages: number[]; langs: string[]; dpi: number; skipText: boolean; deskew: boolean }) {
  let src = bytes;
  if (opts.deskew) {
    ctx.progress(-1, L("Seiten werden begradigt …"));
    const r = await py<{ pdf: Uint8Array; result: any }>('deskewPdf', src, { pages: opts.pages, dpi: 150 });
    if (r?.pdf) src = r.pdf;
  }
  const { openPdf } = await import('../pdf');
  const pdf = await openPdf(src);
  ctx.progress(-1, L("Texterkennung wird geladen …"));
  const worker = await ocrWorkerFor(opts.langs);
  const pages: { page: number; words: [string, number, number, number, number][] }[] = [];
  let skipped = 0;
  for (const [k, i] of opts.pages.entries()) {
    if (opts.skipText) {
      const tc = await (await pdf.getPage(i + 1)).getTextContent();
      const chars = tc.items.reduce((a: number, it: any) => a + (it.str?.trim().length || 0), 0);
      if (chars > 40) { skipped++; continue; }
    }
    ctx.progress(k / opts.pages.length, L("Seite {0} von {1} wird gelesen …", i + 1, pdf.numPages));
    const c = await renderPage(pdf, i + 1, { scale: opts.dpi / 72, forms: false });
    const res = await worker.recognize(c, {}, { blocks: true, text: false });
    const words: [string, number, number, number, number][] = [];
    for (const b of res.data.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) for (const w of l.words || []) {
      const t = (w.text || '').trim();
      if (!t || w.confidence < 25) continue;
      words.push([t, w.bbox.x0 / c.width, w.bbox.y0 / c.height, w.bbox.x1 / c.width, w.bbox.y1 / c.height]);
    }
    pages.push({ page: i, words });
    c.width = 0;
  }
  pdf.destroy();
  if (!pages.length) return { bytes: src, count: 0, skipped, words: 0 };
  ctx.progress(-1, L("Unsichtbare Textebene wird eingefügt …"));
  const font = new Uint8Array(await (await fetch('/engines/pdfjs/standard_fonts/LiberationSans-Regular.ttf')).arrayBuffer());
  const r = await pyRun<number>(`
data = json.loads(ARGS['pages'])
doc = open_in()
font = pymupdf.Font(fontfile='/w/f.ttf')
n = 0
for entry in data:
    page = doc[entry['page']]
    page.insert_font(fontname='WbOcr', fontfile='/w/f.ttf')
    W, H = page.rect.width, page.rect.height
    dm = page.derotation_matrix
    for t, x0, y0, x1, y1 in entry['words']:
        r = pymupdf.Rect(x0 * W, y0 * H, x1 * W, y1 * H)
        h = r.height
        if h <= 0 or r.width <= 0: continue
        fs = h * 0.86
        tl = font.text_length(t, fontsize=fs)
        sx = r.width / tl if tl > 0 else 1
        base = pymupdf.Point(r.x0, r.y1 - h * 0.18) * dm
        try:
            page.insert_text(base, t, fontsize=fs, fontname='WbOcr', render_mode=3, rotate=page.rotation, morph=(base, pymupdf.Matrix(sx, 1)))
            n += 1
        except Exception:
            pass
save_out(doc)
n`, { files: { 'in.pdf': src, 'f.ttf': font }, outputs: ['out.pdf'], vars: { pages: JSON.stringify(pages) } });
  return { bytes: r.files['out.pdf'], count: pages.length, skipped, words: r.result };
}

export const optimizeTools: Tool[] = [
  {
    id: 'compress', label: L("Komprimieren"), icon: I.Shrink, engine: 'pymupdf',
    desc: L("Datei verkleinern: Bilder neu berechnen, Schriften verkleinern, Ballast entfernen. Text bleibt durchsuchbar."), keys: L("verkleinern größe mail kleiner optimieren"),
    fields: [
      { key: 'lvl', type: 'select', label: L("Stufe"), opts: [['lossless', L("Verlustfrei – nur Struktur aufräumen")], ['screen', L("Ausgewogen – Bilder auf 150 dpi")], ['strong', L("Stark – Bilder auf 100 dpi")], ['max', L("Maximal – Bilder auf 72 dpi")], ['custom', L("Eigene Einstellungen")]], def: 'screen' },
      { key: 'dpi', type: 'number', label: L("Bildauflösung höchstens (dpi)"), def: 150, min: 36, max: 600, when: v => v.lvl === 'custom' },
      { key: 'q', type: 'range', label: L("JPEG-Qualität"), def: 70, min: 20, max: 95, unit: ' %', when: v => v.lvl === 'custom' },
      { key: 'gray', type: 'check', label: L("Bilder in Graustufen"), def: false, when: v => v.lvl !== 'lossless' },
      { key: 'scrub', type: 'check', label: L("Metadaten, Vorschaubilder und Anhänge entfernen"), def: false },
    ],
    action: L("Komprimieren"),
    run: async (v, ctx) => {
      const before = ctx.bytes.length;
      let out: Uint8Array;
      if (v.lvl === 'lossless') {
        out = await qpdf(['--object-streams=generate', '--compress-streams=y', '--recompress-flate', '--compression-level=9', '--remove-unreferenced-resources=yes', 'IN', 'OUT'], ctx.bytes);
        if (v.scrub) out = (await pyRun(`doc = open_in()\ndoc.scrub(attached_files=True, embedded_files=True, metadata=True, xml_metadata=True, thumbnails=True, reset_fields=False, remove_links=False, javascript=False, clean_pages=False, hidden_text=False, redactions=False, reset_responses=False)\nsave_out(doc, garbage=4, deflate=True, use_objstms=1)`, { files: { 'in.pdf': out }, outputs: ['out.pdf'] })).files['out.pdf'];
      } else {
        const cfg = ({ screen: [150, 70], strong: [100, 58], max: [72, 45], custom: [v.dpi, v.q] } as any)[v.lvl];
        const r = await py<{ blob: Uint8Array }>('compressPdf', ctx.bytes, {
          scrub: v.scrub ? { metadata: true, xmlMetadata: true, attachedFiles: true, embeddedFiles: true, thumbnails: true } : { thumbnails: true },
          images: { enabled: true, dpiThreshold: Math.round(cfg[0] * 1.15), dpiTarget: cfg[0], quality: cfg[1], convertToGray: !!v.gray },
          subsetFonts: true,
          save: { garbage: 4, deflate: true, useObjstms: true, clean: true },
        });
        out = r.blob;
        try { const q = await qpdf(['--object-streams=generate', '--compress-streams=y', 'IN', 'OUT'], out); if (q.length < out.length) out = q; } catch { /* egal */ }
      }
      if (out.length >= before * 0.985) return { message: L("Keine nennenswerte Verkleinerung möglich ({0} → {1}). Das Dokument bleibt unverändert.", fmtSize(before), fmtSize(out.length)) };
      return { bytes: out, label: L("Komprimiert: ") + shrinkMsg(before, out.length) };
    },
  },
  {
    id: 'ocr', label: L("Texterkennung (OCR)"), short: L("Texterkennung"), icon: I.ScanText, engine: 'tesseract',
    desc: L("Gescannte Seiten durchsuchbar und kopierbar machen. Das Seitenbild bleibt unverändert, darüber liegt eine unsichtbare Textebene."), keys: L("ocr scan durchsuchbar texterkennung"),
    fields: [
      { key: 'langs', type: 'custom', label: L("Sprachen"), def: ['deu', 'eng'] },
      { key: 'dpi', type: 'seg', label: L("Genauigkeit"), opts: [['200', L("Schnell")], ['300', L("Gründlich")], ['400', L("Sehr gründlich")]], def: '300' },
      { key: 'skip', type: 'check', label: L("Seiten überspringen, die schon Text enthalten"), def: true },
      { key: 'deskew', type: 'check', label: L("Schiefe Seiten vorher begradigen"), def: false },
      PAGES('all'),
    ],
    action: L("Text erkennen"),
    run: async (v, ctx) => {
      const langs = (v.langs || []).length ? v.langs : ['deu'];
      app.prefs.ocrLangs = langs; savePrefs();
      const r = await runOcr(ctx.bytes, ctx, { pages: pagesOf(v.pages, ctx), langs, dpi: +v.dpi, skipText: !!v.skip, deskew: !!v.deskew });
      if (!r.count) return { message: r.skipped ? L("Alle {0} Seite(n) enthalten bereits Text – nichts zu tun.", r.skipped) : L("Kein Text erkannt.") };
      return { bytes: r.bytes, label: L("Texterkennung: {0} Seite(n), {1} Wörter{2}", r.count, r.words, r.skipped ? L(", {0} übersprungen", r.skipped) : '') };
    },
  },
  {
    id: 'deskew', label: L("Schiefe Scans begradigen"), short: L("Begradigen"), icon: I.ScanLine, engine: 'pymupdf',
    desc: L("Erkennt die Schräglage gescannter Seiten und richtet sie gerade aus."), keys: L("schief gerade ausrichten scan drehen"),
    fields: [{ key: 'max', type: 'number', label: L("Höchstens korrigieren (Grad)"), def: 10, min: 1, max: 45 }, PAGES('all')], action: L("Begradigen"),
    run: async (v, ctx) => {
      const r = await py<{ pdf: Uint8Array; result: { correctedPages: number; angles: number[] } }>('deskewPdf', ctx.bytes, { pages: pagesOf(v.pages, ctx), maxAngle: v.max, dpi: 150 });
      if (!r.result.correctedPages) return { message: L("Keine schiefen Seiten gefunden.") };
      return { bytes: r.pdf, label: L("{0} Seite(n) begradigt", r.result.correctedPages) };
    },
  },
  {
    id: 'grayscale', label: L("In Graustufen umwandeln"), short: L("Graustufen"), icon: I.Contrast, engine: 'ghostscript',
    desc: L("Farben entfernen, Text und Vektoren bleiben scharf und durchsuchbar."), keys: L("schwarzweiß grau farblos druck"),
    direct: true,
    run: async (_v, ctx) => {
      const r = await gs(['-dNOPAUSE', '-dBATCH', '-dQUIET', '-dNOSAFER', '-sDEVICE=pdfwrite', '-sColorConversionStrategy=Gray', '-dProcessColorModel=/DeviceGray', '-dAutoRotatePages=/None', '-dCompatibilityLevel=1.6', '-sOutputFile=/out.pdf', '/in.pdf'], { 'in.pdf': ctx.bytes }, ['out.pdf']);
      return { bytes: r.files['out.pdf'], label: L("In Graustufen umgewandelt") };
    },
  },
  {
    id: 'outline-fonts', label: L("Schriften in Pfade umwandeln"), short: L("Schriften → Pfade"), icon: I.Type, engine: 'ghostscript',
    desc: L("Text wird zu Grafik – sieht überall gleich aus, ist aber nicht mehr durchsuchbar. Für Druckereien."), keys: L("outline pfade druckerei schriftprobleme"),
    direct: true,
    run: async (_v, ctx) => {
      const r = await gs(['-dNOPAUSE', '-dBATCH', '-dQUIET', '-dNOSAFER', '-sDEVICE=pdfwrite', '-dNoOutputFonts', '-dAutoRotatePages=/None', '-sOutputFile=/out.pdf', '/in.pdf'], { 'in.pdf': ctx.bytes }, ['out.pdf']);
      return { bytes: r.files['out.pdf'], label: L("Schriften in Pfade umgewandelt") };
    },
  },
  {
    id: 'adjust-colors', label: L("Farben anpassen"), short: L("Farben"), icon: I.SlidersHorizontal,
    desc: L("Helligkeit, Kontrast und Sättigung ändern – etwa für blasse Scans. Seiten werden dabei zu Bildern."), keys: L("helligkeit kontrast sättigung scan blass"),
    fields: [
      { key: 'b', type: 'range', label: L("Helligkeit"), def: 0, min: -100, max: 100 },
      { key: 'c', type: 'range', label: L("Kontrast"), def: 20, min: -100, max: 100 },
      { key: 's', type: 'range', label: L("Sättigung"), def: 100, min: 0, max: 200, unit: ' %' },
      { key: 'dpi', type: 'select', label: L("Auflösung"), opts: [['150', '150 dpi'], ['200', '200 dpi'], ['300', '300 dpi']], def: '200' },
      PAGES('all'),
    ],
    run: async (v, ctx) => ({ bytes: await rasterize(ctx.bytes, new Set(pagesOf(v.pages, ctx)), { dpi: +v.dpi, filter: adjustFilter(v.b * 1.2, v.c * 1.2, v.s / 100) }, p => ctx.progress(p)), label: L("Farben angepasst") }),
  },
  {
    id: 'invert', label: L("Farben umkehren"), short: L("Umkehren"), icon: I.SunMoon, desc: L("Negativ-Darstellung, z. B. zum Lesen bei Nacht oder für Negativ-Scans. Seiten werden zu Bildern."), keys: L("invertieren negativ"),
    fields: [PAGES('all')], action: L("Umkehren"),
    run: async (v, ctx) => ({ bytes: await rasterize(ctx.bytes, new Set(pagesOf(v.pages, ctx)), { dpi: 150, filter: FILTERS.invert }, p => ctx.progress(p)), label: L("Farben umgekehrt") }),
  },
  {
    id: 'scan-look', label: L("Scanner-Look"), short: L("Scan-Look"), icon: I.ScanLine, desc: L("Lässt ein digitales PDF wie gescannt aussehen: leicht schief, grau, mit Körnung."), keys: L("gescannt scan effekt"),
    fields: [PAGES('all')], action: L("Anwenden"),
    run: async (v, ctx) => ({ bytes: await rasterize(ctx.bytes, new Set(pagesOf(v.pages, ctx)), { dpi: 150, q: 0.7, filter: FILTERS.scan }, p => ctx.progress(p)), label: L("Scanner-Look angewendet") }),
  },
  {
    id: 'rasterize', label: L("In Bilder umwandeln"), short: L("Rasterisieren"), icon: I.Image, desc: L("Jede Seite als Bild – Inhalte lassen sich danach nicht mehr herauskopieren oder bearbeiten."), keys: L("rasterisieren flach bild kopierschutz"),
    fields: [{ key: 'dpi', type: 'select', label: L("Auflösung"), opts: [['100', '100 dpi'], ['150', '150 dpi'], ['200', '200 dpi'], ['300', '300 dpi']], def: '150' }, { key: 'fmt', type: 'seg', label: L("Bildformat"), opts: [['jpeg', 'JPEG'], ['png', 'PNG']], def: 'jpeg' }, PAGES('all')],
    run: async (v, ctx) => ({ bytes: await rasterize(ctx.bytes, new Set(pagesOf(v.pages, ctx)), { dpi: +v.dpi, fmt: v.fmt, q: 0.85 }, p => ctx.progress(p)), label: L("In Bilder umgewandelt") }),
  },
  {
    id: 'linearize', label: L("Für das Web optimieren"), short: L("Web-optimiert"), icon: I.Zap, direct: true,
    desc: L("Linearisieren: Browser zeigen die erste Seite, bevor die Datei ganz geladen ist."), keys: L("linearisieren schnell web fast"),
    run: async (_v, ctx) => ({ bytes: await qpdf(['--linearize', 'IN', 'OUT'], ctx.bytes), label: L("Für das Web optimiert") }),
  },
  {
    id: 'repair', label: L("Reparieren"), icon: I.Wrench, direct: true, engine: 'pymupdf',
    desc: L("Beschädigte Querverweise, Streams und Seitenbäume neu aufbauen."), keys: L("kaputt fehler defekt beschädigt"),
    run: async (_v, ctx) => {
      let out: Uint8Array;
      try { out = (await pyRun(`doc = open_in()\nsave_out(doc, garbage=4, deflate=True, clean=True)`, { files: { 'in.pdf': ctx.bytes }, outputs: ['out.pdf'] })).files['out.pdf']; }
      catch { out = await qpdf(['IN', 'OUT'], ctx.bytes); }
      return { bytes: out, label: L("Dokument neu aufgebaut") };
    },
  },
];
