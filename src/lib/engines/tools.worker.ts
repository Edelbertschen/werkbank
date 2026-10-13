// Ghostscript und qpdf im Worker (beides Emscripten-Programme mit Kommandozeile)
import { serve } from './rpc';

async function loadModule(url: string, wasm: string, log: string[]) {
  const mod: any = await import(/* @vite-ignore */ url);
  const factory = mod.default || (self as any).Module;
  return factory({ locateFile: (p: string) => (p.endsWith('.wasm') ? wasm : p), print: (t: string) => log.push(t), printErr: (t: string) => log.push(t), noInitialRun: true });
}

let qpdfP: Promise<any> | null = null;
let qpdfLog: string[] = [];
async function qpdfMod() {
  return (qpdfP ??= (async () => {
    // qpdf.js ist ein klassisches Skript, das eine globale "Module"-Fabrik anlegt
    const src = await (await fetch('/engines/qpdf/qpdf.js')).text();
    const factory = new Function(src + '\n;return Module;')();
    const wasmBinary = await (await fetch('/engines/qpdf/qpdf.wasm')).arrayBuffer();
    return factory({ wasmBinary, locateFile: (p: string) => '/engines/qpdf/' + p, print: (t: string) => qpdfLog.push(t), printErr: (t: string) => qpdfLog.push(t) });
  })().catch(e => { qpdfP = null; throw e; }));
}

serve({
  async gs({ args, input, outputs }) {
    const log: string[] = [];
    const m = await loadModule('/engines/ghostscript/assets/gs.js', '/engines/ghostscript/assets/gs.wasm', log);
    for (const [n, b] of Object.entries(input || {})) m.FS.writeFile('/' + n, b as Uint8Array);
    let rc = 0;
    try { rc = m.callMain(args); } catch (e: any) { rc = typeof e?.status === 'number' ? e.status : 1; }
    const files: Record<string, Uint8Array> = {};
    for (const n of outputs || []) { try { files[n] = m.FS.readFile('/' + n); } catch { /* fehlt */ } }
    // Ghostscript schreibt mehrere Seiten mit %d-Platzhaltern: alle erzeugten Dateien einsammeln
    if ((outputs || []).some((o: string) => o.includes('%'))) {
      for (const f of m.FS.readdir('/')) if (/^out-\d+\./.test(f)) files[f] = m.FS.readFile('/' + f);
    }
    if (rc !== 0 && !Object.keys(files).length) throw new Error('Ghostscript: ' + (log.slice(-4).join(' ') || 'Fehler ' + rc));
    return { files, log: log.join('\n') };
  },
  async qpdf({ args, input }) {
    const m = await qpdfMod();
    qpdfLog.length = 0;
    m.FS.writeFile('/in.pdf', input);
    try { m.FS.unlink('/out.pdf'); } catch { /* egal */ }
    let rc = 0;
    try { rc = m.callMain(args.map((a: string) => (a === 'IN' ? '/in.pdf' : a === 'OUT' ? '/out.pdf' : a))); } catch (e: any) { rc = typeof e?.status === 'number' ? e.status : 2; }
    if (rc !== 0 && rc !== 3) throw new Error(qpdfLog.join(' ').replace(/this\.program: \/in\.pdf: /g, '').slice(0, 300) || 'qpdf-Fehler ' + rc);
    return m.FS.readFile('/out.pdf');
  },
});
