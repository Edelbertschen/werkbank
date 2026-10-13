// PyMuPDF (MuPDF + Python über Pyodide) in eigenem Worker
import { PyMuPDF } from '@bentopdf/pymupdf-wasm';
import { serve } from './rpc';

import { L } from '../i18n';
let instP: Promise<any> | null = null;
const inst = () => (instP ??= (async () => {
  const p = new (PyMuPDF as any)({ assetPath: '/engines/pymupdf/', ghostscriptUrl: '/engines/ghostscript/' });
  await p.load();
  const py = await p.getPyodide();
  try { py.FS.mkdir('/w'); } catch { /* vorhanden */ }
  return p;
})().catch(e => { instP = null; throw e; }));

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
  async warm() { await inst(); return true; },
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
    const p = await inst();
    const py = await p.getPyodide();
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
