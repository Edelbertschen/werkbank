import { officeInfo, officeConvert } from '../platform';
// Zugriff auf alle Engines. Jede Engine lädt erst bei der ersten Benutzung.
import { WorkerClient, type Progress } from './rpc';
import { engineState } from './state.svelte';

const pyClient = new WorkerClient(() => new Worker(new URL('./pymupdf.worker.ts', import.meta.url), { type: 'module' }), 'PyMuPDF');
const toolsClient = new WorkerClient(() => new Worker(new URL('./tools.worker.ts', import.meta.url), { type: 'module' }), L("Werkzeuge"));

let pyReady: Promise<void> | null = null;
/** PyMuPDF vorbereiten (beim ersten Mal ca. 5–15 s) */
export function warmPy(): Promise<void> {
  return (pyReady ??= (async () => {
    engineState.set('pymupdf', 'loading');
    try { await pyClient.call('warm'); engineState.set('pymupdf', 'ready'); }
    catch (e) { pyReady = null; engineState.set('pymupdf', 'error'); throw e; }
  })());
}
export const pyLoaded = () => engineState.get('pymupdf') === 'ready';

const B = (b: Uint8Array, type = 'application/pdf') => ({ __bytes: b, type });

/** Methode des PyMuPDF-Wrappers aufrufen. Uint8Array-Argumente werden als Datei übergeben. */
export async function py<T = any>(method: string, ...args: any[]): Promise<T> {
  await warmPy();
  return pyClient.call<T>('call', { method, args: args.map(a => (a instanceof Uint8Array ? B(a) : Array.isArray(a) && a[0] instanceof Uint8Array ? a.map((x: Uint8Array) => B(x)) : a)) });
}

/**
 * Eigenes Python-Skript mit PyMuPDF ausführen.
 * Eingaben: Dateien landen in /w/<name>. ARGS enthält vars. progress(f, text) meldet Fortschritt.
 */
export async function pyRun<T = any>(code: string, opts: { files?: Record<string, Uint8Array>; outputs?: string[]; vars?: any; progress?: Progress } = {}): Promise<{ result: T; files: Record<string, Uint8Array> }> {
  await warmPy();
  return pyClient.call('run', { code: PY_PRELUDE + '\n' + code, files: opts.files || {}, outputs: opts.outputs || [], vars: opts.vars || {} }, { progress: opts.progress });
}

const PY_PRELUDE = `
import pymupdf, json
fitz = pymupdf
def open_in(name='in.pdf'):
    d = pymupdf.open('/w/' + name)
    if d.needs_pass:
        d.authenticate(ARGS.get('password', ''))
    return d
def save_out(doc, name='out.pdf', **kw):
    opts = dict(garbage=3, deflate=True)
    opts.update(kw)
    doc.save('/w/' + name, **opts)
`;

import { L } from '../i18n';
export async function gs(args: string[], input: Record<string, Uint8Array>, outputs: string[]) {
  engineState.set('ghostscript', 'loading');
  try { const r = await toolsClient.call<{ files: Record<string, Uint8Array>; log: string }>('gs', { args, input, outputs }); engineState.set('ghostscript', 'ready'); return r; }
  catch (e) { engineState.set('ghostscript', 'ready'); throw e; }
}

export async function qpdf(args: string[], input: Uint8Array): Promise<Uint8Array> {
  return toolsClient.call<Uint8Array>('qpdf', { args, input });
}

// ---------------------------------------------------------------------------
// LibreOffice
// ---------------------------------------------------------------------------
let lo: any = null;
let loConversions = 0;
let loP: Promise<any> | null = null;
let loQueue: Promise<any> = Promise.resolve();
export function warmLibreOffice(progress?: Progress) {
  return (loP ??= (async () => {
    engineState.set('libreoffice', 'loading');
    if (typeof SharedArrayBuffer === 'undefined') throw new Error(L("Diese Umgebung erlaubt kein SharedArrayBuffer – LibreOffice kann nicht starten."));
    const { WorkerBrowserConverter, createWasmPaths } = await import('@matbee/libreoffice-converter/browser');
    const c = new WorkerBrowserConverter({
      ...createWasmPaths('/engines/libreoffice/wasm/'),
      browserWorkerJs: '/engines/libreoffice/browser.worker.global.js',
      // Kein onProgress: der Callback verlangsamt die Umwandlung um ein Vielfaches.
    });
    progress?.(-1, L("Office-Engine startet – beim ersten Mal kann das etwas dauern …"));
    await c.initialize();
    // LibreOffice startet intern noch Hintergrunddienste; kurz Luft lassen
    await new Promise(r => setTimeout(r, (globalThis as any).__loDelay ?? 1200));
    lo = c;
    engineState.set('libreoffice', 'ready');
    return c;
  })().catch(e => { loP = null; engineState.set('libreoffice', 'error'); throw e; }));
}

/** LibreOffice-Worker hart beenden (bei Hängern) */
function killLibreOffice() {
  try { (lo as any)?.worker?.terminate(); } catch { /* egal */ }
  lo = null; loP = null; loConversions = 0;
  engineState.set('libreoffice', 'idle');
}

/** Datei mit LibreOffice umwandeln. outputFormat z. B. 'pdf', 'docx', 'xlsx', 'pptx', 'odt' */
export async function libreConvert(data: Uint8Array, fileName: string, outputFormat: string, opts: { pdfa?: 'PDF/A-1b' | 'PDF/A-2b' | 'PDF/A-3b'; progress?: Progress } = {}): Promise<Uint8Array> {
  // 1. Wahl: installiertes LibreOffice – startet sofort und ist um ein Vielfaches schneller
  if ((await officeInfo()).available && !nativeOfficeBroken) {
    try {
      opts.progress?.(-1, L("LibreOffice wandelt um …"));
      const ext = (fileName.match(/\.([a-z0-9]+)$/i)?.[1] || 'docx').toLowerCase();
      const level = opts.pdfa ? (+opts.pdfa.charAt(6) as 1 | 2 | 3) : undefined;
      const out = await officeConvert(data, ext, outputFormat, level);
      engineState.set('libreoffice', 'ready');
      return out;
    } catch (e: any) {
      console.error('Installiertes LibreOffice fehlgeschlagen, nutze eingebaute Engine:', e);
      if (/nicht starten|nicht installiert/.test(String(e?.message || e))) nativeOfficeBroken = true;
    }
  }
  return libreConvertWasm(data, fileName, outputFormat, opts);
}
let nativeOfficeBroken = false;

async function libreConvertWasm(data: Uint8Array, fileName: string, outputFormat: string, opts: { pdfa?: 'PDF/A-1b' | 'PDF/A-2b' | 'PDF/A-3b'; progress?: Progress }): Promise<Uint8Array> {
  // Wächter: LibreOffice-WASM bleibt gelegentlich beim Laden eines Dokuments stehen.
  // Dann wird der Worker beendet, neu gestartet und die Umwandlung wiederholt.
  // Die erste Umwandlung nach dem Start lädt Filter und Schriften nach und darf deutlich länger dauern
  const limit = (loConversions === 0 ? 90000 : 20000) + (data.length / 1048576) * 20000;
  const attempt = async (n: number): Promise<Uint8Array> => {
    const c = lo || await warmLibreOffice(opts.progress);
    if (n > 0) opts.progress?.(-1, L("Office-Engine wird neu gestartet …"));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<'timeout'>(r => { timer = setTimeout(() => r('timeout'), limit * [1, 3, 6][n]); });
    try {
      const r = await Promise.race([c.convert(data.slice(), { outputFormat, ...(opts.pdfa ? { pdf: { pdfaLevel: opts.pdfa } } : {}) }, fileName), timeout]);
      if (r === 'timeout') {
        killLibreOffice();
        if (n < 2) return attempt(n + 1);
        throw new Error(L("Die Office-Engine antwortet nicht. Bitte erneut versuchen."));
      }
      loConversions++;
      return new Uint8Array((r as any).data);
    } finally { clearTimeout(timer); }
  };
  const p = loQueue.then(() => attempt(0), () => attempt(0));
  loQueue = p.catch(() => {});
  return p;
}

// ---------------------------------------------------------------------------
// Tesseract (Texterkennung)
// ---------------------------------------------------------------------------
let ocrWorker: any = null;
let ocrLangs = '';
export async function ocrWorkerFor(langs: string[], progress?: Progress) {
  const key = langs.sort().join('+');
  if (ocrWorker && ocrLangs === key) return ocrWorker;
  if (ocrWorker) { await ocrWorker.terminate(); ocrWorker = null; }
  engineState.set('tesseract', 'loading');
  const T: any = await import('tesseract.js');
  const createWorker = T.createWorker || T.default?.createWorker;
  ocrWorker = await createWorker(langs, 1, {
    workerPath: '/engines/tesseract/worker.min.js',
    corePath: '/engines/tesseract/core/',
    langPath: '/engines/tesseract/lang',
    gzip: true,
    workerBlobURL: false,
    cacheMethod: 'none',
    logger: (m: any) => { if (m.status === 'recognizing text') progress?.(m.progress); },
  });
  ocrLangs = key;
  engineState.set('tesseract', 'ready');
  return ocrWorker;
}

export function resetEngines() { pyClient.reset(); toolsClient.reset(); pyReady = null; }

// ---------------------------------------------------------------------------
// Vorladen: Engines vorbereiten, bevor sie gebraucht werden
// ---------------------------------------------------------------------------
/** Passende Engine anwerfen, sobald ein Werkzeug geöffnet wird (der Nutzer stellt noch Optionen ein) */
export async function warmFor(engine: string | undefined, ocrLangs: string[] = ['deu', 'eng']) {
  try {
    if (engine === 'pymupdf') await warmPy();
    else if (engine === 'libreoffice') { if (!(await officeInfo()).available) await warmLibreOffice(); }
    else if (engine === 'tesseract') await ocrWorkerFor(ocrLangs);
  } catch { /* Fehler zeigt dann der eigentliche Aufruf */ }
}

let idleStarted = false;
/** PDF-Engine still im Hintergrund laden, wenn die App gerade nichts zu tun hat */
export function preloadWhenIdle() {
  if (idleStarted) return;
  idleStarted = true;
  const go = () => { warmPy().catch(() => { idleStarted = false; }); };
  const ric = (globalThis as any).requestIdleCallback as ((cb: () => void, o?: any) => void) | undefined;
  setTimeout(() => (ric ? ric(go, { timeout: 5000 }) : go()), 2500);
}
