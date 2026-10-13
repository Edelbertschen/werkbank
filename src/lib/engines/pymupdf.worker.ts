// PyMuPDF (MuPDF + Python über Pyodide) in eigenem Worker
import { PyMuPDF } from '@bentopdf/pymupdf-wasm';
import { serve } from './rpc';

import { L } from '../i18n';
import HELPERS from './pymupdf-helpers.py?raw';

const BASE = '/engines/pymupdf/';
// Kern: Pyodide + PyMuPDF. Reicht für alle eigenen Skripte (Einschreiben, Textbearbeitung, Seitenobjekte …).
const CORE = ['pymupdf-1.26.3-cp313-none-pyodide_2025_0_wasm32.whl'];
// Rest: nur für Wrapper-Aufrufe wie Word-Export, Markdown oder Begradigen (OpenCV, NumPy, pdf2docx …)
const REST = [
  'pymupdf4llm-0.0.27-py3-none-any.whl', 'fonttools-4.56.0-py3-none-any.whl', 'lxml-5.4.0-cp313-cp313-pyodide_2025_0_wasm32.whl',
  'numpy-2.2.5-cp313-cp313-pyodide_2025_0_wasm32.whl', 'opencv_python-4.11.0.86-cp313-cp313-pyodide_2025_0_wasm32.whl',
  'pdf2docx-0.5.8-py3-none-any.whl', 'python_docx-1.2.0-py3-none-any.whl', 'typing_extensions-4.12.2-py3-none-any.whl',
];

let coreP: Promise<any> | null = null;
const core = () => (coreP ??= (async () => {
  const { loadPyodide } = await import(/* @vite-ignore */ BASE + 'pyodide.js');
  const py = await loadPyodide({ indexURL: BASE });
  await Promise.all(CORE.map(w => py.loadPackage(BASE + w)));
  py.runPython('import pymupdf\npymupdf.TOOLS.store_shrink(100)');
  try { py.FS.mkdir('/w'); } catch { /* vorhanden */ }
  return py;
})().catch(e => { coreP = null; throw e; }));

let fullP: Promise<any> | null = null;
/** Wrapper mit allen Paketen – im selben Interpreter, erst bei Bedarf */
const inst = () => (fullP ??= (async () => {
  const py = await core();
  await Promise.all(REST.map(w => py.loadPackage(BASE + w)));
  py.runPython(HELPERS);
  const p = new (PyMuPDF as any)({ assetPath: BASE, ghostscriptUrl: '/engines/ghostscript/' });
  p.pyodide = py; // Wrapper benutzt den vorhandenen Interpreter, statt einen zweiten zu starten
  return p;
})().catch(e => { fullP = null; throw e; }));

async function out(v: any): Promise<any> {
  if (v instanceof Blob) return new Uint8Array(await v.arrayBuffer());
  if (v instanceof Uint8Array) return v;
  if (Array.isArray(v)) return Promise.all(v.map(out));
  if (v && typeof v === 'object' && v.constructor === Object) {
    const o: any = {};
    for (const [k, x] of Object.entries(v)) o[k] = await out(x);
    return o;
  }
  return v;
}
const inp = (a: any) => (a && a.__bytes ? new Blob([a.__bytes], { type: a.type || 'application/pdf' }) : a);

// Pyodide ist ein einziger Interpreter mit gemeinsamem Dateisystem: Aufträge strikt nacheinander
let chain: Promise<any> = Promise.resolve();
const serial = <T>(fn: () => Promise<T>): Promise<T> => { const p = chain.then(fn, fn); chain = p.catch(() => {}); return p; };

serve({
  async warm() { await core(); return true; },
  call: (payload) => serial(() => callImpl(payload)),
  run: (payload, progress) => serial(() => runImpl(payload, progress)),
});

async function callImpl({ method, args }: any) {
    const p = await inst();
    if (typeof p[method] !== 'function') throw new Error(L("PyMuPDF kennt ") + method + ' nicht');
    return out(await p[method](...(args || []).map((a: any) => (Array.isArray(a) ? a.map(inp) : inp(a)))));
}

/** Eigenes Python-Skript: Eingabedateien liegen in /w, Ergebnisdateien werden zurückgegeben */
async function runImpl({ code, files, outputs, vars }: any, progress: (p: number, m?: string) => void) {
    const py = await core();
    const written: string[] = [];
    for (const [n, b] of Object.entries(files || {})) { py.FS.writeFile('/w/' + n, b as Uint8Array); written.push(n); }
    py.globals.set('ARGS', py.toPy(vars || {}));
    py.globals.set('progress', (f: number, m?: string) => progress(f, m));
    let r: any;
    try {
      r = await py.runPythonAsync(code);
    } finally {
      for (const n of written) { try { py.FS.unlink('/w/' + n); } catch { /* egal */ } }
    }
    let result = r;
    if (r && typeof r.toJs === 'function') { result = r.toJs({ dict_converter: Object.fromEntries, create_proxies: false }); r.destroy?.(); }
    const outFiles: Record<string, Uint8Array> = {};
    for (const n of outputs || []) {
      try { outFiles[n] = py.FS.readFile('/w/' + n); py.FS.unlink('/w/' + n); } catch { /* nicht erzeugt */ }
    }
    return { result: await out(result), files: outFiles };
}
