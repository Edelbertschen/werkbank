// Kopiert die WebAssembly-Engines aus node_modules nach public/engines,
// damit Vite sie unverändert ins Build übernimmt und die App sie lokal ausliefert.
import { cpSync, mkdirSync, rmSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = p => join(root, 'node_modules', p);
const out = join(root, 'public', 'engines');
rmSync(out, { recursive: true, force: true });

const copy = (from, to, filter) => {
  const src = nm(from);
  if (!existsSync(src)) throw new Error('Fehlt: ' + src);
  const dst = join(out, to);
  mkdirSync(dirname(dst), { recursive: true });
  cpSync(src, dst, { recursive: true, filter: filter || (() => true) });
};

// LibreOffice (Office <-> PDF)
for (const f of ['soffice.js', 'soffice.wasm', 'soffice.data', 'soffice.worker.js']) copy(`@matbee/libreoffice-converter/wasm/${f}`, `libreoffice/wasm/${f}`);
copy('@matbee/libreoffice-converter/dist/browser.worker.global.js', 'libreoffice/browser.worker.global.js');

// PyMuPDF (Pyodide + Räder)
copy('@bentopdf/pymupdf-wasm/assets', 'pymupdf');

// Ghostscript
copy('@bentopdf/gs-wasm/assets', 'ghostscript/assets');
copy('@bentopdf/gs-wasm/dist/index.js', 'ghostscript/dist/index.js');

// Tesseract (OCR): Worker, Kern mit und ohne SIMD, Sprachdaten
copy('tesseract.js/dist/worker.min.js', 'tesseract/worker.min.js');
for (const f of ['tesseract-core-simd-lstm.wasm.js', 'tesseract-core-lstm.wasm.js']) copy(`tesseract.js-core/${f}`, `tesseract/core/${f}`);
for (const l of ['deu', 'eng']) copy(`@tesseract.js-data/${l}/4.0.0_best_int/${l}.traineddata.gz`, `tesseract/lang/${l}.traineddata.gz`);

// sRGB-Farbprofil für PDF/A (ICC, frei verwendbar)
mkdirSync(join(out, 'ghostscript'), { recursive: true });
cpSync(join(root, 'assets', 'srgb.icc'), join(out, 'ghostscript', 'srgb.icc'));

// qpdf
copy('@neslinesli93/qpdf-wasm/dist/qpdf.js', 'qpdf/qpdf.js');
copy('@neslinesli93/qpdf-wasm/dist/qpdf.wasm', 'qpdf/qpdf.wasm');

// pdf.js Zusatzdaten (asiatische Schriften, Standardschriften)
copy('pdfjs-dist/cmaps', 'pdfjs/cmaps');
copy('pdfjs-dist/standard_fonts', 'pdfjs/standard_fonts');

// pdf.js-Viewer-Symbole (Notizsymbole, Editor-Griffe)
rmSync(join(root, 'public', 'pdfjs-images'), { recursive: true, force: true });
cpSync(nm('pdfjs-dist/legacy/web/images'), join(root, 'public', 'pdfjs-images'), { recursive: true });

const size = d => readdirSync(d).reduce((a, f) => { const p = join(d, f); const s = statSync(p); return a + (s.isDirectory() ? size(p) : s.size); }, 0);
console.log('Engines kopiert:', (size(out) / 1048576).toFixed(1), 'MB');
