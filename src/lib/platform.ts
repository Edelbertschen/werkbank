// Plattform-Schicht: dieselbe Oberfläche läuft als Tauri-Desktop-App und (zum Entwickeln
// und Testen) im Browser. Alles, was Dateisystem, Dialoge oder Fenster betrifft, geht hier durch.
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open as dialogOpen, save as dialogSave } from '@tauri-apps/plugin-dialog';

import { L } from './i18n';
export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export type OS = 'macos' | 'windows' | 'linux' | 'web';
export let os: OS = 'web';
export async function initPlatform() {
  if (isTauri) {
    try {
      const info = await invoke<{ os: string }>('platform_info');
      os = info.os === 'macos' ? 'macos' : info.os === 'windows' ? 'windows' : 'linux';
    } catch { os = 'linux'; }
  } else {
    const p = navigator.platform.toLowerCase();
    os = 'web';
    document.documentElement.dataset.webos = p.includes('mac') ? 'macos' : p.includes('win') ? 'windows' : 'linux';
  }
  document.documentElement.dataset.os = os;
}
export const isMac = () => os === 'macos' || (os === 'web' && navigator.platform.toLowerCase().includes('mac'));
export const modKey = () => (isMac() ? '⌘' : L("Strg+"));

export interface FileFilter { name: string; extensions: string[] }
export interface PickedFile { name: string; path: string | null; bytes: Uint8Array; size: number }

export const FILTERS = {
  pdf: [{ name: L("PDF-Dokumente"), extensions: ['pdf'] }],
  openable: [
    { name: L("Alle unterstützten Dateien"), extensions: ['pdf', 'docx', 'doc', 'odt', 'rtf', 'xlsx', 'xls', 'ods', 'csv', 'pptx', 'ppt', 'odp', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tif', 'tiff', 'heic', 'heif', 'svg', 'txt', 'md', 'markdown', 'html', 'htm', 'epub', 'mobi', 'fb2', 'cbz', 'xps', 'oxps', 'eml', 'msg', 'json', 'xml'] },
    { name: L("PDF-Dokumente"), extensions: ['pdf'] },
    { name: L("Office-Dokumente"), extensions: ['docx', 'doc', 'odt', 'rtf', 'xlsx', 'xls', 'ods', 'csv', 'pptx', 'ppt', 'odp'] },
    { name: L("Bilder"), extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tif', 'tiff', 'heic', 'heif', 'svg'] },
    { name: L("Text und E-Books"), extensions: ['txt', 'md', 'markdown', 'html', 'htm', 'epub', 'mobi', 'fb2', 'cbz', 'xps', 'oxps', 'eml', 'msg', 'json', 'xml'] },
  ] as FileFilter[],
};

const baseName = (p: string) => p.split(/[\\/]/).pop() || p;

/** Dateien auswählen und einlesen */
// Nur ein Systemdialog gleichzeitig (Doppelklicks öffnen sonst mehrere)
let dialogBusy = false;
async function oneDialog<T>(fallback: T, fn: () => Promise<T>): Promise<T> {
  if (dialogBusy) return fallback;
  dialogBusy = true;
  try { return await fn(); } finally { dialogBusy = false; }
}

export function pickFiles(opts: { multiple?: boolean; filters?: FileFilter[]; title?: string } = {}): Promise<PickedFile[]> {
  return oneDialog<PickedFile[]>([], () => pickFilesNow(opts));
}
async function pickFilesNow(opts: { multiple?: boolean; filters?: FileFilter[]; title?: string }): Promise<PickedFile[]> {
  if (isTauri) {
    const sel = await dialogOpen({ multiple: !!opts.multiple, filters: opts.filters, title: opts.title });
    if (!sel) return [];
    const paths = Array.isArray(sel) ? sel : [sel];
    const out: PickedFile[] = [];
    for (const p of paths) { const bytes = await readPath(p); out.push({ name: baseName(p), path: p, bytes, size: bytes.length }); }
    return out;
  }
  return new Promise(resolve => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.multiple = !!opts.multiple;
    inp.style.display = 'none'; document.body.append(inp);
    let settled = false;
    const finish = (v: PickedFile[]) => { if (settled) return; settled = true; inp.remove(); removeEventListener('focus', onFocus); resolve(v); };
    // Fallback für Browser ohne 'cancel'-Ereignis: nach Rückkehr des Fokus ohne Auswahl abbrechen
    const onFocus = () => setTimeout(() => { if (!inp.files?.length) finish([]); }, 1500);
    setTimeout(() => addEventListener('focus', onFocus), 300);
    if (opts.filters) inp.accept = opts.filters.flatMap(f => f.extensions.map(e => '.' + e)).join(',');
    inp.onchange = async () => {
      const out: PickedFile[] = [];
      for (const f of Array.from(inp.files || [])) { const bytes = new Uint8Array(await f.arrayBuffer()); out.push({ name: f.name, path: null, bytes, size: bytes.length }); }
      finish(out);
    };
    inp.addEventListener('cancel', () => finish([]));
    inp.click();
  });
}

export async function pickFolder(title?: string): Promise<string | null> {
  if (!isTauri) return null;
  const sel = await dialogOpen({ directory: true, title });
  return typeof sel === 'string' ? sel : null;
}

export async function readPath(path: string): Promise<Uint8Array> {
  const buf = await invoke<ArrayBuffer>('read_file', { path });
  return new Uint8Array(buf);
}

export async function writePath(path: string, data: Uint8Array | Blob): Promise<void> {
  const bytes = data instanceof Blob ? new Uint8Array(await data.arrayBuffer()) : data;
  await invoke('write_file', bytes, { headers: { 'x-path': encodeURIComponent(path) } });
}

export async function fileInfo(path: string): Promise<{ exists: boolean; size: number; modified: number; name: string; dir: string }> {
  if (!isTauri) return { exists: false, size: 0, modified: 0, name: baseName(path), dir: '' };
  return invoke('file_info', { path });
}

/** "Speichern unter": fragt nach dem Ziel und schreibt. Liefert den Pfad (oder null bei Abbruch). */
export async function saveAs(defaultName: string, data: Uint8Array | Blob, filters?: FileFilter[], defaultDir?: string): Promise<string | null> {
  if (isTauri) {
    const p = await dialogSave({ defaultPath: defaultDir ? joinPath(defaultDir, defaultName) : defaultName, filters });
    if (!p) return null;
    await writePath(p, data);
    return p;
  }
  const blob = data instanceof Blob ? data : new Blob([data as BlobPart]);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = defaultName; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return defaultName;
}

export function joinPath(dir: string, name: string) {
  const sep = dir.includes('\\') && !dir.includes('/') ? '\\' : '/';
  return dir.replace(/[\\/]+$/, '') + sep + name;
}
export const dirOf = (p: string) => p.replace(/[\\/][^\\/]*$/, '');

// ---------------------------------------------------------------------------
// Zustand (zuletzt geöffnet, Einstellungen, Unterschriften …)
// ---------------------------------------------------------------------------
export async function stateLoad<T>(name: string, fallback: T): Promise<T> {
  try {
    const raw = isTauri ? await invoke<string | null>('state_load', { name: name + '.json' }) : localStorage.getItem('werkbank.' + name);
    return raw ? { ...fallback as object, ...JSON.parse(raw) } as T : fallback;
  } catch { return fallback; }
}
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
/** Sofort speichern und abwarten (z. B. vor einem Neustart) */
export async function stateSaveNow(name: string, value: unknown) {
  clearTimeout(saveTimers.get(name));
  const json = JSON.stringify(value);
  if (isTauri) await invoke('state_save', { name: name + '.json', content: json }); else localStorage.setItem('werkbank.' + name, json);
}
export function stateSave(name: string, value: unknown, delay = 300) {
  clearTimeout(saveTimers.get(name));
  saveTimers.set(name, setTimeout(async () => {
    const json = JSON.stringify(value);
    try { if (isTauri) await invoke('state_save', { name: name + '.json', content: json }); else localStorage.setItem('werkbank.' + name, json); } catch (e) { console.warn('Zustand nicht gespeichert', e); }
  }, delay));
}

// Binäre Ablage (Wiederherstellung)
const idb = () => new Promise<IDBDatabase>((res, rej) => { const r = indexedDB.open('werkbank', 1); r.onupgradeneeded = () => r.result.createObjectStore('blobs'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
export async function blobSave(name: string, data: Uint8Array) {
  if (isTauri) return invoke('blob_save', data, { headers: { 'x-name': name } });
  const db = await idb(); await new Promise((res, rej) => { const t = db.transaction('blobs', 'readwrite'); t.objectStore('blobs').put(new Blob([data as BlobPart]), name); t.oncomplete = res; t.onerror = rej; });
}
export async function blobLoad(name: string): Promise<Uint8Array | null> {
  try {
    if (isTauri) return new Uint8Array(await invoke<ArrayBuffer>('blob_load', { name }));
    const db = await idb(); const b = await new Promise<Blob | undefined>((res, rej) => { const r = db.transaction('blobs').objectStore('blobs').get(name); r.onsuccess = () => res(r.result); r.onerror = rej; });
    return b ? new Uint8Array(await b.arrayBuffer()) : null;
  } catch { return null; }
}
export async function blobDelete(name: string) {
  try {
    if (isTauri) return await invoke('blob_delete', { name });
    const db = await idb(); db.transaction('blobs', 'readwrite').objectStore('blobs').delete(name);
  } catch { /* egal */ }
}

// ---------------------------------------------------------------------------
// Ereignisse: Dateien vom System, Ziehen & Ablegen
// ---------------------------------------------------------------------------
export async function onOpenFiles(cb: (paths: string[]) => void) {
  if (!isTauri) return;
  await listen<string[]>('open-files', async () => { const p = await invoke<string[]>('take_pending_files'); if (p.length) cb(p); });
  const initial = await invoke<string[]>('take_pending_files');
  if (initial.length) cb(initial);
}

export type DropState = 'enter' | 'over' | 'leave' | 'drop';
export interface DropPayload { paths?: string[]; files?: File[]; x?: number; y?: number }
export async function onFileDrop(cb: (state: DropState, payload?: DropPayload) => void) {
  if (isTauri) {
    const { getCurrentWebview } = await import('@tauri-apps/api/webview');
    // Nur Ziehvorgänge mit echten Dateipfaden zeigen das Drop-Ziel – internes Ziehen bleibt unberührt
    let active = false;
    // Position kommt in physischen Pixeln relativ zur WebView
    const at = (pos?: { x: number; y: number }) => pos ? { x: pos.x / devicePixelRatio, y: pos.y / devicePixelRatio } : {};
    await getCurrentWebview().onDragDropEvent(e => {
      const p = e.payload as { type: string; paths?: string[]; position?: { x: number; y: number } };
      if (p.type === 'enter') { active = !!p.paths?.length; if (active) cb('enter', at(p.position)); }
      else if (p.type === 'over') { if (active) cb('over', at(p.position)); }
      else if (p.type === 'leave') { if (active) cb('leave'); active = false; }
      else if (p.type === 'drop') { const was = active; active = false; if (p.paths?.length) cb('drop', { paths: p.paths, ...at(p.position) }); else if (was) cb('leave'); }
    });
    return;
  }
  let depth = 0;
  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types || []).includes('Files');
  addEventListener('dragenter', e => { if (hasFiles(e)) { depth++; cb('enter', { x: e.clientX, y: e.clientY }); } });
  addEventListener('dragleave', e => { if (hasFiles(e) && --depth <= 0) { depth = 0; cb('leave'); } });
  addEventListener('dragover', e => { if (hasFiles(e)) { e.preventDefault(); cb('over', { x: e.clientX, y: e.clientY }); } });
  addEventListener('drop', e => { if (!e.dataTransfer?.files.length) return; e.preventDefault(); depth = 0; cb('drop', { files: Array.from(e.dataTransfer.files), x: e.clientX, y: e.clientY }); });
}

export async function revealInFolder(path: string) { if (isTauri) await invoke('reveal_in_folder', { path }); }
export async function openExternal(url: string) { if (isTauri) await invoke('open_external', { url }); else window.open(url, '_blank', 'noopener'); }
export async function printView() { if (isTauri) await invoke('print_view'); else window.print(); }
export async function httpFetch(url: string, opts: { method?: string; body?: Uint8Array; contentType?: string } = {}): Promise<Uint8Array> {
  if (!isTauri) {
    const r = await fetch(url, { method: opts.method || 'GET', body: opts.body as BodyInit | undefined, headers: opts.contentType ? { 'Content-Type': opts.contentType } : undefined });
    if (!r.ok) throw new Error(`${url}: ${r.status}`);
    return new Uint8Array(await r.arrayBuffer());
  }
  const headers: Record<string, string> = { 'x-url': encodeURIComponent(url), 'x-method': opts.method || 'GET' };
  if (opts.contentType) headers['x-content-type'] = opts.contentType;
  return new Uint8Array(await invoke<ArrayBuffer>('http_fetch', opts.body || new Uint8Array(), { headers }));
}

// Installierte Schrift zum Namen einer PDF-Schrift (nur Desktop-App; Testbuilds können Schriften vorgeben)
export async function findSystemFont(name: string, bold: boolean, italic: boolean): Promise<Uint8Array | null> {
  if (!name) return null;
  if (!isTauri) {
    const fake = import.meta.env.VITE_WB_TEST ? (globalThis as any).__wbSystemFonts : null;
    const key = name.replace(/^[A-Z]{6}\+/, '');
    return fake?.[key] ? Uint8Array.from(atob(fake[key]), c => c.charCodeAt(0)) : null;
  }
  try { const b = new Uint8Array(await invoke<ArrayBuffer>('system_font', { name, bold, italic })); return b.length ? b : null; }
  catch { return null; }
}

// Installiertes LibreOffice (nur Desktop-App)
let officeInfoP: Promise<{ available: boolean; path?: string }> | null = null;
export function officeInfo() {
  if (!isTauri) return Promise.resolve({ available: false });
  return (officeInfoP ??= invoke<{ available: boolean; path?: string }>('office_info').catch(() => ({ available: false })));
}
export async function officeConvert(data: Uint8Array, ext: string, format: string, pdfa?: 1 | 2 | 3): Promise<Uint8Array> {
  const headers: Record<string, string> = { 'x-ext': ext, 'x-format': format };
  if (pdfa) headers['x-pdfa'] = String(pdfa);
  return new Uint8Array(await invoke<ArrayBuffer>('office_convert', data, { headers }));
}

export async function setWindowTitle(title: string) {
  document.title = title;
  if (!isTauri) return;
  try { const { getCurrentWindow } = await import('@tauri-apps/api/window'); await getCurrentWindow().setTitle(title); } catch { /* egal */ }
}
export async function toggleFullscreen() {
  if (isTauri) { const { getCurrentWindow } = await import('@tauri-apps/api/window'); const w = getCurrentWindow(); await w.setFullscreen(!(await w.isFullscreen())); }
  else if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen();
}
export async function startWindowDrag() { if (!isTauri) return; const { getCurrentWindow } = await import('@tauri-apps/api/window'); await getCurrentWindow().startDragging(); }
export async function toggleMaximize() { if (!isTauri) return; const { getCurrentWindow } = await import('@tauri-apps/api/window'); await getCurrentWindow().toggleMaximize(); }
export async function closeWindowNow() { if (!isTauri) return; const { getCurrentWindow } = await import('@tauri-apps/api/window'); await getCurrentWindow().destroy(); }
let dirtyCheck: (() => boolean) | null = null;
export async function onCloseRequested(cb: () => Promise<boolean>, isDirty?: () => boolean) {
  dirtyCheck = isDirty || null;
  if (!isTauri) { addEventListener('beforeunload', e => { if (dirtyCheck?.()) e.preventDefault(); }); return; }
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  await getCurrentWindow().onCloseRequested(async ev => { const ok = await cb(); if (!ok) ev.preventDefault(); });
}
