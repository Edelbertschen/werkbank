// pdf.js läuft in Node mit seinem eingebauten „Fake-Worker“: Ist der Worker-Code global vorhanden,
// nutzt pdf.js ihn direkt im selben Thread.
import * as worker from 'pdfjs-dist/legacy/build/pdf.worker.mjs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
(globalThis as any).pdfjsWorker = worker;

// Die App lädt Schriften und Engine-Dateien über den eigenen Server (/engines/…).
// In Node beantworten wir genau diese Pfade aus public/ – die Dateien sind dieselben.
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = typeof input === 'string' ? input : input?.url;
  if (typeof url === 'string' && url.startsWith('/')) {
    try { return new Response(await readFile(resolve('public' + url.split('?')[0]))); }
    catch { return new Response(null, { status: 404 }); }
  }
  return realFetch(input, init);
}) as typeof fetch;

