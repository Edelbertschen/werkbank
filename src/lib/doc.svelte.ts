// Ein geöffnetes Dokument: Bytes, pdf.js-Objekt, Verlauf (Rückgängig/Wiederholen), Auswahl, Ansichtszustand.
import { openPdf, renderPage, type PDFDocumentProxy } from './pdf';
import { uid, baseName } from './util';

export interface PageInfo { w: number; h: number; rot: number }
export interface Protection { user: string; owner: string; print: boolean; copy: boolean; forms: boolean; annotate: boolean; modify: boolean }
interface Version { bytes: Uint8Array; label: string; at: number }

/** pdf.js-Dokument verzögert schließen: sofortiges destroy() lässt laufende Render-Aufträge mit
 *  „UnknownErrorException“ abbrechen, weil Viewer und Miniaturen noch kurz darauf zugreifen. */
function retire(pdf: PDFDocumentProxy) {
  setTimeout(() => { try { void pdf.destroy().catch(() => {}); } catch { /* egal */ } }, 3000);
}

const MAX_VERSIONS = 30;
const MAX_HISTORY_BYTES = 600 * 1024 * 1024;

export class Doc {
  readonly id = uid();
  name = $state('Dokument.pdf');
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
  /** pdf.js meldet ungespeicherte Formulareingaben / Anmerkungen */
  pendingEdits = $state(false);
  /** Eigene Overlay-Elemente (Formen, Stempel, Schwärzungen …), noch nicht ins PDF geschrieben */
  overlayCount = $state(0);

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
    this.history = [{ bytes, label: origin ? `Aus ${origin.toUpperCase()} erstellt` : 'Geöffnet', at: Date.now() }];
    this.pos = 0;
    this.savedPos = origin ? -1 : 0;
  }

  get dirty() { return this.pos !== this.savedPos || this.pendingEdits || this.overlayCount > 0; }
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

  /** Neuen Stand übernehmen */
  async commit(bytes: Uint8Array, label: string, opts: { selection?: number[]; current?: number } = {}) {
    this.history.splice(this.pos + 1);
    if (this.savedPos > this.pos) this.savedPos = -1;
    this.history.push({ bytes, label, at: Date.now() });
    // Verlauf begrenzen (Anzahl und Speicher)
    let total = this.history.reduce((a, v) => a + v.bytes.length, 0);
    while (this.history.length > 2 && (this.history.length > MAX_VERSIONS || total > MAX_HISTORY_BYTES)) {
      total -= this.history[0].bytes.length;
      this.history.shift();
      this.savedPos--;
    }
    this.pos = this.history.length - 1;
    if (opts.selection) this.selection = opts.selection;
    if (opts.current) this.current = opts.current;
    await this.load(bytes);
  }

  async undo() { if (!this.canUndo) return null; const l = this.history[this.pos].label; this.pos--; await this.load(); return l; }
  async redo() { if (!this.canRedo) return null; this.pos++; await this.load(); return this.history[this.pos].label; }
  async goto(pos: number) { if (pos < 0 || pos >= this.history.length) return; this.pos = pos; await this.load(); }
  versions() { return this.history.map((v, i) => ({ label: v.label, at: v.at, size: v.bytes.length, i })); }

  /** Formulareingaben und pdf.js-Anmerkungen in einen neuen Stand schreiben */
  async flushEdits(label = 'Anmerkungen und Eingaben') {
    if (!this.pdf || !this.pendingEdits) return false;
    const bytes = await this.pdf.saveDocument();
    await this.commit(new Uint8Array(bytes), label);
    return true;
  }

  markSaved(path: string, name?: string) {
    this.path = path;
    if (name) this.name = name;
    this.origin = null;
    this.savedPos = this.pos;
  }

  async thumb(i: number, width = 180): Promise<string> {
    const key = `${this.rev}:${i}:${width}`;
    const hit = this.thumbs.get(key);
    if (hit) return hit;
    const pdf = this.pdf!;
    const c = await renderPage(pdf, i + 1, { width: width * Math.min(window.devicePixelRatio || 1, 2) });
    const url = c.toDataURL('image/jpeg', 0.82);
    c.width = 0;
    if (this.thumbs.size > 600) this.thumbs.clear();
    this.thumbs.set(key, url);
    return url;
  }

  destroy() { if (this.pdf) retire(this.pdf); this.history = []; this.thumbs.clear(); }
}
