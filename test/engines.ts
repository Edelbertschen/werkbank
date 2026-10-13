import { py, pyRun, gs, qpdf, libreConvert, ocrWorkerFor } from '../src/lib/engines';
import { PDFDocument, StandardFonts } from 'pdf-lib';
const log = (...a: any[]) => { document.getElementById('log')!.textContent += a.join(' ') + '\n'; };
(window as any).__res = {};
const R = (window as any).__res;
const t0 = performance.now(); const el = () => Math.round(performance.now() - t0) + 'ms';
async function samplePdf() {
  const d = await PDFDocument.create(); const f = await d.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < 2; i++) { const p = d.addPage([595, 842]); p.drawText('Werkbank Testseite ' + (i + 1), { x: 50, y: 780, size: 24, font: f }); p.drawText('IBAN DE89 3704 0044 0532 0130 00', { x: 50, y: 700, size: 14, font: f }); }
  return d.save();
}
const tests: Record<string, () => Promise<string>> = {
  async qpdf() { const b = await samplePdf(); const e = await qpdf(['--encrypt', 'a', 'a', '256', '--', 'IN', 'OUT'], b); return 'enc ' + e.length; },
  async gs() { const b = await samplePdf(); const r = await gs(['-dNOPAUSE', '-dBATCH', '-dQUIET', '-sDEVICE=pdfwrite', '-sColorConversionStrategy=Gray', '-dProcessColorModel=/DeviceGray', '-sOutputFile=/out.pdf', '/in.pdf'], { 'in.pdf': b }, ['out.pdf']); return 'gray ' + r.files['out.pdf']?.length; },
  async py() { const b = await samplePdf(); const md = await py<string>('pdfToMarkdown', b); const r = await pyRun<any>(`
doc = open_in()
n = 0
for page in doc:
    for r in page.search_for('IBAN'):
        page.add_redact_annot(r, fill=(0,0,0)); n += 1
    page.apply_redactions()
save_out(doc)
n`, { files: { 'in.pdf': b }, outputs: ['out.pdf'] }); return `md=${md.length} redacted=${r.result} out=${r.files['out.pdf']?.length}`; },
  async docx() { const b = await samplePdf(); const d = await py<Uint8Array>('pdfToDocx', b); return 'docx ' + d.length; },
  async lo() { const b = new Uint8Array(await (await fetch('/test/test.docx')).arrayBuffer()); const r = await libreConvert(b, 'test.docx', 'pdf'); return 'pdf ' + r.length; },
  async ocr() { const c = document.createElement('canvas'); c.width = 800; c.height = 200; const x = c.getContext('2d')!; x.fillStyle = '#fff'; x.fillRect(0, 0, 800, 200); x.fillStyle = '#000'; x.font = '48px sans-serif'; x.fillText('Größere Übung 2026', 40, 110); const w = await ocrWorkerFor(['deu', 'eng']); const r = await w.recognize(c); return 'ocr: ' + r.data.text.trim(); },
};
const want = (location.hash.slice(1) || Object.keys(tests).join(',')).split(',');
for (const k of want) { try { const r = await tests[k](); R[k] = r + ' ' + el(); } catch (e: any) { R[k] = 'FEHLER ' + (e?.message || e); } log(k, R[k]); }
R.done = true;
