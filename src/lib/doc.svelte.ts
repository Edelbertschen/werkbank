// Ein geöffnetes Dokument: Bytes, pdf.js-Objekt, Verlauf (Rückgängig/Wiederholen), Auswahl, Ansichtszustand.
import { openPdf, renderPage, type PDFDocumentProxy } from './pdf';
import { uid, baseName } from './util';
import type { OItem } from './overlay.svelte';

import { L } from './i18n';
export interface PageInfo { w: number; h: number; rot: number }
export interface Protection { user: string; owner: string; print: boolean; copy: boolean; forms: boolean; annotate: boolean; modify: boolean }
/** Ein Stand: PDF-Bytes plus die darauf liegenden Elemente (Formen, Text, Stempel …), die noch Elemente sind */
interface Version { bytes: Uint8Array; label: string; at: number; objects: OItem[] }
const clone = <T,>(v: T): T => structuredClone(v);

/** pdf.js-Dokument verzögert schließen: sofortiges destroy() lässt laufende Render-Aufträge mit
 *  „UnknownErrorException“ abbrechen, weil Viewer und Miniaturen noch kurz darauf zugreifen. */
function retire(pdf: PDFDocumentProxy) {
  setTimeout(() => { try { void pdf.destroy().catch(() => {}); } catch { /* egal */ } }, 3000);
}

const MAX_VERSIONS = 30;
const MAX_HISTORY_BYTES = 600 * 1024 * 1024;

export class Doc {
  readonly id = uid();
  name = $state(L("Dokument.pdf"));
  /** Pfad auf der Festplatte, null = noch nie gespeichert */
  path = $state<string | null>(null);
  /** Herkunft, falls aus einem anderen Format umgewandelt (z. B. "docx") */
  origin = $state<string | null>(null);
  bytes = $state.raw<Uint8Array>(new Uint8Array());
  pdf = $state.raw<PDFDocumentProxy | null>(null);
  pages = $state.raw<PageInfo[]>([]);
  /** Zähler, der bei jedem neuen Stand steigt (für Vorschaubilder, Viewer-Neuladen) */
  rev = $state(0);

  history: Version[] = [];
  pos = $state(0);
  savedPos = $state(0);
  /** pdf.js meldet ungespeicherte Formulareingaben */
  pendingEdits = $state(false);
  /** Elemente auf den Seiten (bearbeitbar, Teil jedes Stands); ins PDF geschrieben beim Speichern und vor Werkzeugen */
  objects = $state<OItem[]>([]);
  get overlayCount() { return this.objects.length; }
  private bakedCache = new WeakMap<Version, { key: string; bytes: Uint8Array }>();
  /** Miniaturen zeigen auch die Elemente: Ansicht des eingeschriebenen PDFs, nach kurzer Ruhe aktualisiert */
  private thumbPdf: PDFDocumentProxy | null = null;
  thumbRev = $state(0);
  private thumbTimer: ReturnType<typeof setTimeout> | undefined;
  private refreshThumbs() {
    clearTimeout(this.thumbTimer);
    this.thumbTimer = setTimeout(async () => {
      const old = this.thumbPdf;
      if (!this.objects.length) { if (old) { this.thumbPdf = null; this.thumbRev++; retire(old); } return; }
      try {
        const pdf = await openPdf(await this.baked(), this.password);
        this.thumbPdf = pdf; this.thumbRev++;
        if (old) retire(old);
      } catch { /* Miniaturen bleiben beim letzten Stand */ }
    }, 1200);
  }

  current = $state(1);
  selection = $state<number[]>([]);
  zoomMode = $state<'width' | 'page' | 'custom'>('width');
  scale = $state(1);
  /** Thumbnails, Schlüssel: rev:index */
  thumbs = new Map<string, string>();
  password: string | undefined;
  /** Ursprungsdatei bei umgewandelten Dokumenten (für den Speichern-Ordner) */
  sourcePath: string | null = null;
  /** War verschlüsselt und wurde zur Bearbeitung entschlüsselt */
  wasEncrypted = false;
  /** Wird beim Speichern angewendet */
  protection = $state<Protection | null>(null);

  constructor(name: string, bytes: Uint8Array, path: string | null = null, origin: string | null = null) {
    this.name = name;
    this.path = path;
    this.origin = origin;
    this.history = [{ bytes, label: origin ? L("Aus {0} erstellt", origin.toUpperCase()) : L("Geöffnet"), at: Date.now(), objects: [] }];
    this.pos = 0;
    this.savedPos = origin ? -1 : 0;
  }

  get dirty() { return this.pos !== this.savedPos || this.pendingEdits; }
  get title() { return baseName(this.name); }
  get canUndo() { return this.pos > 0; }
  get canRedo() { return this.pos < this.history.length - 1; }
  get undoLabel() { return this.canUndo ? this.history[this.pos].label : ''; }
  get redoLabel() { return this.canRedo ? this.history[this.pos + 1].label : ''; }
  get numPages() { return this.pages.length; }

  async load(bytes: Uint8Array = this.history[this.pos].bytes) {
    const pdf = await openPdf(bytes, this.password);
    const pages: PageInfo[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const p = await pdf.getPage(i);
      const v = p.getViewport({ scale: 1 });
      pages.push({ w: v.width, h: v.height, rot: p.rotate });
    }
    const old = this.pdf;
    this.bytes = bytes;
    this.pdf = pdf;
    this.pages = pages;
    this.pendingEdits = false;
    pdf.annotationStorage.onSetModified = () => { this.pendingEdits = true; };
    pdf.annotationStorage.onResetModified = () => { this.pendingEdits = false; };
    this.selection = this.selection.filter(i => i < pages.length);
    this.current = Math.min(Math.max(1, this.current), pages.length || 1);
    this.rev++;
    // Alte Fassung erst freigeben, wenn laufende Darstellungen (Viewer, Miniaturen) sicher fertig sind
    if (old) retire(old);
  }

  private push(v: Version) {
    this.history.splice(this.pos + 1);
    if (this.savedPos > this.pos) this.savedPos = -1;
    this.history.push(v);
    // Verlauf begrenzen (Anzahl und Speicher; gleiche Bytes zählen einmal)
    const total = () => [...new Set(this.history.map(h => h.bytes))].reduce((a, b) => a + b.length, 0);
    while (this.history.length > 2 && (this.history.length > MAX_VERSIONS || total() > MAX_HISTORY_BYTES)) {
      this.history.shift();
      this.savedPos--;
    }
    this.pos = this.history.length - 1;
  }

  /** Neuen Stand mit neuen Bytes (Werkzeug). Elemente sind darin eingeschrieben, sofern nicht ausdrücklich übergeben. */
  async commit(bytes: Uint8Array, label: string, opts: { selection?: number[]; current?: number; objects?: OItem[] } = {}) {
    const objects = opts.objects ?? [];
    this.push({ bytes, label, at: Date.now(), objects: clone(objects) });
    if (opts.selection) this.selection = opts.selection;
    if (opts.current) this.current = opts.current;
    this.objects = clone(objects);
    await this.load(bytes);
    this.refreshThumbs();
  }

  /** Neuen Stand nach einer Änderung an den Elementen (gleiche Bytes). Unveränderter Zustand ergibt keinen Stand. */
  commitObjects(label: string, snap: OItem[] = $state.snapshot(this.objects) as OItem[]) {
    const last = this.history[this.pos];
    if (JSON.stringify(snap) === JSON.stringify(last.objects)) return false;
    this.push({ bytes: this.bytes, label, at: Date.now(), objects: clone(snap) });
    this.refreshThumbs();
    return true;
  }

  private async restore() {
    const v = this.history[this.pos];
    this.objects = clone(v.objects);
    if (v.bytes !== this.bytes) await this.load(v.bytes);
    this.refreshThumbs();
  }
  async undo() { if (!this.canUndo) return null; const l = this.history[this.pos].label; this.pos--; await this.restore(); return l; }
  async redo() { if (!this.canRedo) return null; this.pos++; await this.restore(); return this.history[this.pos].label; }
  async goto(pos: number) { if (pos < 0 || pos >= this.history.length) return; this.pos = pos; await this.restore(); }
  versions() { return this.history.map((v, i) => ({ label: v.label, at: v.at, size: v.bytes.length, i })); }

  /** Formulareingaben (pdf.js) in einen neuen Stand schreiben; Elemente bleiben Elemente */
  async flushEdits(label = L("Formular ausgefüllt")) {
    if (!this.pdf || !this.pendingEdits) return false;
    const bytes = await this.pdf.saveDocument();
    await this.commit(new Uint8Array(bytes), label, { objects: $state.snapshot(this.objects) as OItem[] });
    return true;
  }

  /** Das PDF, wie es gespeichert würde: Formulareingaben und Elemente eingeschrieben. Ändert den Verlauf nicht. */
  async baked(): Promise<Uint8Array> {
    const v = this.history[this.pos];
    let bytes = this.pendingEdits && this.pdf ? new Uint8Array(await this.pdf.saveDocument()) : this.bytes;
    const objs = $state.snapshot(this.objects) as OItem[];
    if (!objs.length) return bytes;
    const key = JSON.stringify(objs);
    if (!this.pendingEdits) { const hit = this.bakedCache.get(v); if (hit?.key === key) return hit.bytes; }
    const { bakeObjects } = await import('./overlay.svelte');
    bytes = await bakeObjects(bytes, objs);
    if (!this.pendingEdits) this.bakedCache.set(v, { key, bytes });
    return bytes;
  }

  markSaved(path: string, name?: string) {
    this.path = path;
    if (name) this.name = name;
    this.origin = null;
    this.savedPos = this.pos;
  }

  async thumb(i: number, width = 180): Promise<string> {
    const withObjects = !!(this.objects.length && this.thumbPdf);
    const key = `${this.rev}:${withObjects ? this.thumbRev : 0}:${i}:${width}`;
    const hit = this.thumbs.get(key);
    if (hit) return hit;
    const pdf = withObjects ? this.thumbPdf! : this.pdf!;
    const c = await renderPage(pdf, i + 1, { width: width * Math.min(window.devicePixelRatio || 1, 2) });
    const url = c.toDataURL('image/jpeg', 0.82);
    c.width = 0;
    if (this.thumbs.size > 600) this.thumbs.clear();
    this.thumbs.set(key, url);
    return url;
  }

  destroy() { if (this.pdf) retire(this.pdf); this.history = []; this.thumbs.clear(); }
}
