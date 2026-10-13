// Abläufe: Öffnen, Speichern, Schließen, Werkzeuge ausführen
import { app, active, toast, addRecent, savePrefs } from './app.svelte';
import { Doc } from './doc.svelte';
import { PasswordNeeded, openPdf } from './pdf';
import { askPassword, confirm, dialog } from './dialogs.svelte';
import { anyToPdf, kindOf, hasPdfHeader } from './convert';
import { qpdf } from './engines';
import { isEncryptedPdf } from './ops';
import * as P from './platform';
import { baseName, extOf, sleep, fmtSize } from './util';
import { defaults } from './fields';
import type { Tool, ToolCtx, ToolResult, OutFile } from './tools/types';

import { L } from './i18n';
// ---------------------------------------------------------------------------
// Fortschritt
// ---------------------------------------------------------------------------
let busySeq = 0;
export async function withBusy<T>(label: string, fn: (progress: (p: number, msg?: string) => void) => Promise<T>): Promise<T> {
  // Kennung als Zahl: Objekte würden im $state-Proxy landen und der Vergleich schlüge fehl
  const token = ++busySeq;
  let shownAt = 0;
  let detail: string | undefined;
  let prog = -1;
  const mine = () => !!app.busy && (app.busy as any)._t === token;
  const show = () => { app.busy = { label, progress: prog, detail, _t: token } as any; shownAt = Date.now(); };
  const timer = setTimeout(() => { if (!mine()) show(); }, 150);
  const progress = (p: number, msg?: string) => {
    prog = p; if (msg) detail = msg;
    if (!mine()) { if (shownAt || p >= 0 || msg) { clearTimeout(timer); show(); } return; }
    app.busy!.progress = p; if (msg) app.busy!.detail = msg;
  };
  try { return await fn(progress); }
  finally {
    clearTimeout(timer);
    if (mine()) {
      const dt = Date.now() - shownAt; if (dt < 250) await sleep(250 - dt);
      if (mine()) app.busy = null;
    }
  }
}

// ---------------------------------------------------------------------------
// Öffnen
// ---------------------------------------------------------------------------
export function activate(doc: Doc) {
  app.activeId = doc.id;
  app.backstage = false;
  P.setWindowTitle(`${doc.title} – Werkbank`);
  // Sobald ein Dokument offen ist, die PDF-Engine still vorbereiten
  if (app.prefs.preloadEngines) import('./engines').then(m => m.preloadWhenIdle());
}

/** Bytes als Dokument öffnen (wandelt bei Bedarf um, fragt nach Passwörtern) */
export async function openBytes(name: string, bytes: Uint8Array, path: string | null, opts: { focus?: boolean } = {}): Promise<Doc | null> {
  const existing = path ? app.docs.find(d => d.path === path) : null;
  if (existing) { activate(existing); return existing; }
  return withBusy(L("„{0}“ wird geöffnet", name), async progress => {
    const kind = kindOf(name);
    const isPdf = kind === 'pdf' || hasPdfHeader(bytes);
    let pdfBytes = bytes;
    if (!isPdf) pdfBytes = await anyToPdf(name, bytes, progress);
    const doc = new Doc(isPdf ? name : baseName(name) + '.pdf', pdfBytes, isPdf ? path : null, isPdf ? null : extOf(name));
    if (!isPdf && path) doc.sourcePath = path;
    // Passwort?
    let retry = false;
    for (;;) {
      try { await doc.load(pdfBytes); break; }
      catch (e) {
        if (!(e instanceof PasswordNeeded)) throw e;
        app.busy = null;
        const pw = await askPassword(name, retry || e.retry);
        if (pw == null) return null;
        // Mit qpdf entschlüsseln, damit alle Werkzeuge arbeiten können
        try {
          pdfBytes = await qpdf(['--password=' + pw, '--decrypt', 'IN', 'OUT'], pdfBytes);
          doc.history[0].bytes = pdfBytes;
          doc.wasEncrypted = true;
          // Beim Speichern mit demselben Passwort wieder schützen
          doc.protection = { user: pw, owner: pw, print: true, copy: true, forms: true, annotate: true, modify: true };
          retry = false;
        } catch { retry = true; }
      }
    }
    // Nur Rechte-Passwort (kein Öffnen-Passwort): für die Bearbeitung entschlüsseln
    if (isPdf && !doc.wasEncrypted && await isEncrypted(pdfBytes)) {
      try { pdfBytes = await qpdf(['--decrypt', 'IN', 'OUT'], pdfBytes); doc.history[0].bytes = pdfBytes; await doc.load(pdfBytes); doc.wasEncrypted = true; } catch { /* bleibt so */ }
    }
    app.docs.push(doc);
    if (opts.focus !== false) activate(doc);
    if (path && isPdf) recordRecent(doc);
    if (doc.wasEncrypted && doc.protection) toast(L("Passwort erkannt. Beim Speichern wird das Dokument wieder mit diesem Passwort geschützt."), { ms: 7000 });
    else if (doc.wasEncrypted) toast(L("Bearbeitungssperre aufgehoben. Beim Speichern entsteht eine Fassung ohne Einschränkungen – mit „Schützen › Passwort“ lässt sie sich neu setzen."), { ms: 9000 });
    if (!isPdf) toast(L("Aus {0} umgewandelt. Speichern legt eine neue PDF-Datei an.", extOf(name).toUpperCase()));
    return doc;
  });
}

const isEncrypted = (b: Uint8Array) => isEncryptedPdf(b);

export async function openPaths(paths: string[]) {
  let last: Doc | null = null;
  for (const p of paths) {
    try { const bytes = await P.readPath(p); last = (await openBytes(p.split(/[\\/]/).pop() || p, bytes, p)) || last; }
    catch (e: any) { toast(L("„{0}“ ließ sich nicht öffnen: {1}", p, e.message || e), { kind: 'error' }); }
  }
  if (last) activate(last);
}

/** Abgelegte Dateien an Position `at` (0 = vor der ersten Seite) ins aktive Dokument einfügen */
export async function insertDropped(payload: { paths?: string[]; files?: File[] }, at: number) {
  const src: { id: string; name: string; bytes: Uint8Array }[] = [];
  try {
    for (const p of payload.paths || []) src.push({ id: p, name: p.split(/[\\/]/).pop() || p, bytes: await P.readPath(p) });
    for (const f of payload.files || []) src.push({ id: f.name, name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) });
  } catch (e: any) { toast(L("Datei ließ sich nicht lesen: {0}", e.message || e), { kind: 'error' }); return; }
  if (!src.length) return;
  const { tool } = await import('./tools');
  await runTool(tool('insert-file'), { src, where: 'at', at });
}

export async function openDialog() {
  const files = await P.pickFiles({ multiple: true, filters: P.FILTERS.openable, title: L("Öffnen") });
  for (const f of files) {
    try { await openBytes(f.name, f.bytes, f.path); }
    catch (e: any) { toast(L("„{0}“ ließ sich nicht öffnen: {1}", f.name, e.message || e), { kind: 'error' }); }
  }
}

export async function openDropped(payload: { paths?: string[]; files?: File[] }) {
  if (payload.paths?.length) return openPaths(payload.paths);
  for (const f of payload.files || []) {
    try { await openBytes(f.name, new Uint8Array(await f.arrayBuffer()), null); }
    catch (e: any) { toast(L("„{0}“ ließ sich nicht öffnen: {1}", f.name, e.message || e), { kind: 'error' }); }
  }
}

async function recordRecent(doc: Doc) {
  if (!doc.path) return;
  let thumb: string | undefined;
  try { thumb = await doc.thumb(0, 120); } catch { /* egal */ }
  addRecent({ path: doc.path, name: doc.name, at: Date.now(), pages: doc.numPages, size: doc.bytes.length, thumb });
}

export async function newBlankDoc() {
  const { PDFDocument } = await import('pdf-lib');
  const d = await PDFDocument.create();
  d.addPage([595.28, 841.89]);
  const doc = new Doc(L("Unbenannt.pdf"), await d.save(), null, 'neu');
  doc.history[0].label = L("Neues Dokument");
  await doc.load();
  app.docs.push(doc); activate(doc);
  return doc;
}

// ---------------------------------------------------------------------------
// Speichern
// ---------------------------------------------------------------------------
/** Das PDF zum Weiterverarbeiten: Formulareingaben und Elemente eingeschrieben (ändert den Verlauf nicht) */
export function workBytes(doc: Doc): Promise<Uint8Array> {
  return doc.baked();
}

export async function save(doc: Doc | null = active(), as = false): Promise<boolean> {
  if (!doc) return false;
  try {
    let bytes = await withBusy(L("Wird gespeichert"), () => doc.baked());
    if (doc.protection) { const { encryptBytes } = await import('./tools/protect'); bytes = await encryptBytes(bytes, doc.protection); }
    if (!as && doc.path && P.isTauri) {
      await P.writePath(doc.path, bytes);
      doc.markSaved(doc.path);
      toast(L("Gespeichert"), { kind: 'ok', ms: 2000 });
    } else {
      const dir = doc.path ? P.dirOf(doc.path) : (doc.sourcePath ? P.dirOf(doc.sourcePath) : app.prefs.lastDir || undefined);
      const p = await P.saveAs(doc.name, bytes, P.FILTERS.pdf, dir);
      if (!p) return false;
      const name = p.split(/[\\/]/).pop() || doc.name;
      if (P.isTauri) { doc.markSaved(p, name); app.prefs.lastDir = P.dirOf(p); savePrefs(); }
      else doc.markSaved(doc.path || name, name);
      toast(L("Gespeichert als „{0}“", name), { kind: 'ok' });
    }
    recordRecent(doc);
    clearRecovery(doc);
    P.setWindowTitle(`${doc.title} – Werkbank`);
    return true;
  } catch (e: any) {
    toast(L("Speichern fehlgeschlagen: ") + (e.message || e), { kind: 'error' });
    return false;
  }
}

/** Datei(en) speichern, die ein Werkzeug erzeugt hat */
export async function saveFiles(files: OutFile[], zipName?: string) {
  if (!files.length) return;
  const doc = active();
  const dir = doc?.path ? P.dirOf(doc.path) : app.prefs.lastDir || undefined;
  if (files.length === 1) {
    const f = files[0];
    const p = await P.saveAs(f.name, f.data, f.filters || filtersFor(f.name), dir);
    if (p) { toast(L("„{0}“ gespeichert", p.split(/[\\/]/).pop()), { kind: 'ok', action: P.isTauri ? { label: L("Im Ordner zeigen"), run: () => P.revealInFolder(p) } : undefined }); if (P.isTauri) { app.prefs.lastDir = P.dirOf(p); savePrefs(); } }
    return;
  }
  // Mehrere Dateien: in einen Ordner oder als ZIP
  let folder: string | null = null;
  if (P.isTauri) {
    const r = await dialog({ title: L("{0} Dateien speichern", files.length), message: L("Wie sollen die Dateien gespeichert werden?"), buttons: [{ label: L("Abbrechen"), value: 'cancel' }, { label: L("Als ZIP-Archiv"), value: 'zip' }, { label: L("In einen Ordner"), value: 'folder', primary: true }] });
    if (!r || r.button === 'cancel') return;
    if (r.button === 'folder') { folder = await P.pickFolder(L("Zielordner wählen")); if (!folder) return; }
  }
  if (folder) {
    for (const f of files) await P.writePath(P.joinPath(folder, f.name), f.data);
    toast(L("{0} Dateien gespeichert", files.length), { kind: 'ok', action: { label: L("Ordner öffnen"), run: () => P.revealInFolder(P.joinPath(folder!, files[0].name)) } });
    return;
  }
  const zip = new (await import('jszip')).default(); const used = new Set<string>();
  for (const f of files) { let n = f.name, k = 2; while (used.has(n)) n = f.name.replace(/(\.[^.]+)$/, ` (${k++})$1`); used.add(n); zip.file(n, f.data); }
  const blob = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  await saveFiles([{ name: zipName || L("Werkbank-Export.zip"), data: blob }]);
}

function filtersFor(name: string) {
  const e = extOf(name);
  const label: Record<string, string> = { pdf: 'PDF', docx: 'Word', xlsx: 'Excel', pptx: 'PowerPoint', odt: L("OpenDocument Text"), ods: L("OpenDocument Tabelle"), odp: L("OpenDocument Präsentation"), png: L("PNG-Bild"), jpg: L("JPEG-Bild"), webp: 'WebP-Bild', tif: 'TIFF', tiff: 'TIFF', svg: 'SVG', txt: 'Text', md: 'Markdown', html: 'HTML', json: 'JSON', csv: 'CSV', zip: L("ZIP-Archiv"), rtf: 'RTF', epub: 'EPUB', cbz: L("Comic-Archiv"), bmp: 'BMP' };
  return e ? [{ name: label[e] || e.toUpperCase(), extensions: [e] }] : undefined;
}

// ---------------------------------------------------------------------------
// Schließen
// ---------------------------------------------------------------------------
export async function closeDoc(doc: Doc | null = active()): Promise<boolean> {
  if (!doc) return true;
  if (doc.dirty) {
    activate(doc);
    const r = await dialog({
      title: L("Änderungen an „{0}“ speichern?", doc.title), icon: 'warn',
      message: L("Wenn du nicht speicherst, gehen die Änderungen verloren."),
      buttons: [{ label: L("Nicht speichern"), value: 'discard', danger: true }, { label: L("Abbrechen"), value: 'cancel' }, { label: L("Speichern"), value: 'save', primary: true }],
    });
    if (!r || r.button === 'cancel') return false;
    if (r.button === 'save' && !(await save(doc))) return false;
  }
  const i = app.docs.indexOf(doc);
  app.docs.splice(i, 1);
  clearRecovery(doc);
  doc.destroy();
  if (app.activeId === doc.id) {
    const next = app.docs[Math.min(i, app.docs.length - 1)];
    if (next) activate(next); else { app.activeId = null; app.organize = false; P.setWindowTitle('Werkbank'); }
  }
  return true;
}
export async function closeAll(): Promise<boolean> {
  for (const d of [...app.docs]) if (!(await closeDoc(d))) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Rückgängig / Wiederholen
// ---------------------------------------------------------------------------
export async function undo() {
  const d = active(); if (!d) return;
  // Offene Formulareingaben werden zuerst ein Stand, damit Rückgängig sie zurücknimmt
  if (d.pendingEdits) await d.flushEdits();
  const l = await d.undo(); if (l) toast(L("Rückgängig: ") + l);
}
export async function redo() {
  const d = active(); if (!d) return;
  const l = await d.redo(); if (l) toast(L("Wiederholt: ") + l);
}

// ---------------------------------------------------------------------------
// Werkzeuge ausführen
// ---------------------------------------------------------------------------
export async function runTool(tool: Tool, values?: Record<string, any>): Promise<boolean> {
  const doc = active();
  if (!doc && !tool.noDoc) { toast(L("Öffne zuerst ein Dokument")); return false; }
  if (!tool.run) return false;
  const v = values ?? defaults(tool.fields);
  const engineHint = tool.engine === 'libreoffice' ? L("Office-Engine") : tool.engine === 'pymupdf' ? L("PDF-Engine") : tool.engine === 'tesseract' ? L("Texterkennung") : '';
  try {
    if (tool.noBusy) { const r = await tool.run({ ...v }, { doc, bytes: doc?.bytes || new Uint8Array(), current: (doc?.current || 1) - 1, selection: doc ? [...doc.selection] : [], progress: () => {} }); if (r) await applyResult(r, tool); return true; }
    const result = await withBusy(tool.label, async progress => {
      if (engineHint) progress(-1, L("{0} wird vorbereitet …", engineHint));
      // Werkzeuge arbeiten mit dem PDF, wie es gespeichert würde (Elemente eingeschrieben).
      // Ansichtsbefehle (run ohne ctx-Parameter: Zoom, Seitenleiste …) brauchen die Bytes nicht.
      const needsBytes = !!doc && (tool.run?.length ?? 0) >= 2;
      const ctx: ToolCtx = { doc, bytes: needsBytes ? await doc!.baked() : doc?.bytes || new Uint8Array(), current: (doc?.current || 1) - 1, selection: doc ? [...doc.selection] : [], progress };
      return tool.run!(v, ctx);
    });
    if (!result) return true;
    await applyResult(result, tool);
    return true;
  } catch (e: any) {
    console.error(e);
    const msg = L(String(e?.message || e)); // Meldungen aus den Engines (Python) ebenfalls übersetzen
    toast(`${tool.label}: ${msg}`, { kind: 'error' });
    return false;
  }
}

export async function applyResult(r: ToolResult, tool?: Tool) {
  const doc = active();
  if (r.bytes && doc) {
    const before = doc.bytes.length;
    await doc.commit(r.bytes, r.label || tool?.label || L("Bearbeitet"), { selection: r.selection, current: r.current });
    app.viewerRev++;
    toast(r.label || tool?.label || L("Erledigt"), { kind: 'ok', action: { label: L("Rückgängig"), run: () => undo() } });
    scheduleRecovery(doc);
    void before;
  }
  const list = r.docs || (r.doc ? [r.doc] : []);
  let first: Doc | null = null;
  for (const d of list) {
    const nd = new Doc(d.name, d.bytes, null, 'neu');
    nd.history[0].label = d.label || L("Erstellt");
    await nd.load();
    app.docs.push(nd);
    first ||= nd;
  }
  if (first) { activate(first); toast(list.length === 1 ? L("„{0}“ geöffnet – noch nicht gespeichert", first.name) : L("{0} neue Dokumente geöffnet", list.length)); }
  if (r.files?.length) await saveFiles(r.files, r.zipName);
  if (r.message) toast(r.message, { ms: 8000 });
}

// ---------------------------------------------------------------------------
// Wiederherstellung nach Absturz
// ---------------------------------------------------------------------------
const recTimers = new Map<string, ReturnType<typeof setTimeout>>();
export function scheduleRecovery(doc: Doc) {
  clearTimeout(recTimers.get(doc.id));
  recTimers.set(doc.id, setTimeout(async () => {
    if (!doc.dirty || !app.docs.includes(doc)) return;
    try {
      await P.blobSave('rec-' + doc.id + '.pdf', await doc.baked());
      const idx = await P.stateLoad<{ list: any[] }>('recovery', { list: [] });
      idx.list = [{ id: doc.id, name: doc.name, path: doc.path, at: Date.now(), size: doc.bytes.length }, ...idx.list.filter((x: any) => x.id !== doc.id)].slice(0, 10);
      P.stateSave('recovery', idx, 0);
    } catch { /* egal */ }
  }, 4000));
}
async function clearRecovery(doc: Doc) {
  clearTimeout(recTimers.get(doc.id));
  const idx = await P.stateLoad<{ list: any[] }>('recovery', { list: [] });
  if (!idx.list.some((x: any) => x.id === doc.id)) return;
  idx.list = idx.list.filter((x: any) => x.id !== doc.id);
  P.stateSave('recovery', idx, 0);
  P.blobDelete('rec-' + doc.id + '.pdf');
}
export async function offerRecovery() {
  const idx = await P.stateLoad<{ list: any[] }>('recovery', { list: [] });
  if (!idx.list.length) return;
  const r = await dialog({
    title: L("Ungesicherte Dokumente wiederherstellen?"), icon: 'info',
    message: idx.list.length === 1 ? L("Beim letzten Mal wurde die Werkbank beendet, während ein Dokument ungespeicherte Änderungen hatte.") : L("Beim letzten Mal wurde die Werkbank beendet, während {0} Dokumente ungespeicherte Änderungen hatten.", idx.list.length),
    detail: idx.list.map((x: any) => `${x.name} (${fmtSize(x.size)})`).join('\n'),
    buttons: [{ label: L("Verwerfen"), value: 'discard', danger: true }, { label: L("Wiederherstellen"), value: 'restore', primary: true }],
  });
  for (const x of idx.list) {
    const bytes = await P.blobLoad('rec-' + x.id + '.pdf');
    if (r?.button === 'restore' && bytes) {
      try {
        await openPdf(bytes).then(p => p.destroy());
        const d = new Doc(x.name, bytes, null, 'wiederhergestellt');
        d.history[0].label = L("Wiederhergestellt");
        if (x.path) d.sourcePath = x.path;
        await d.load(); app.docs.push(d); activate(d);
      } catch { /* defekt */ }
    }
    P.blobDelete('rec-' + x.id + '.pdf');
  }
  P.stateSave('recovery', { list: [] }, 0);
}

// ---------------------------------------------------------------------------
// Beenden
// ---------------------------------------------------------------------------
export async function confirmQuit(): Promise<boolean> {
  const dirty = app.docs.filter(d => d.dirty);
  if (!dirty.length) return true;
  if (dirty.length === 1) return closeDoc(dirty[0]);
  const r = await dialog({
    title: L("{0} Dokumente haben ungespeicherte Änderungen", dirty.length), icon: 'warn',
    message: dirty.map(d => d.title).join(', '),
    buttons: [{ label: L("Alle verwerfen"), value: 'discard', danger: true }, { label: L("Abbrechen"), value: 'cancel' }, { label: L("Einzeln prüfen …"), value: 'review', primary: true }],
  });
  if (!r || r.button === 'cancel') return false;
  if (r.button === 'discard') return true;
  for (const d of dirty) if (!(await closeDoc(d))) return false;
  return true;
}

export async function confirmDanger(title: string, message: string, ok: string) { return confirm(title, message, ok, { danger: true }); }
