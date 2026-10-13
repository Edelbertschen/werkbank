// Steuerung des pdf.js-Viewers (eine Instanz, die zwischen Dokumenten wechselt)
import { pdfjsLib } from './pdf';
import type { Doc } from './doc.svelte';
import { app } from './app.svelte';
import { openExternal } from './platform';
import { clamp } from './util';

import { L, getLocale, intlLocale } from './i18n';
type ViewerMod = typeof import('pdfjs-dist/legacy/web/pdf_viewer.mjs');
let V: ViewerMod | null = null;

// pdf.js erwartet eine Übersetzungsschicht; wir liefern deutsche Texte für das Wenige, was sichtbar wird.
const L10N_DE: Record<string, string> = {
  'pdfjs-editor-alt-text-button-label': L("Alternativtext"),
  'pdfjs-editor-remove-ink-button': { toString: () => L("Entfernen") } as any,
  'pdfjs-editor-remove-freetext-button': L("Entfernen"),
  'pdfjs-editor-remove-stamp-button': L("Entfernen"),
  'pdfjs-editor-remove-highlight-button': L("Entfernen"),
  'pdfjs-free-text2': { toString: () => L("Text eingeben …") } as any,
  'pdfjs-editor-free-text-default-content': L("Text eingeben …"),
};
const l10n = {
  getLanguage: () => getLocale(),
  getDirection: () => 'ltr',
  get: async (ids: any, _args?: any, fallback?: string) => (typeof ids === 'string' ? (L10N_DE[ids] as string) : '') || fallback || '',
  translate: async (_el: HTMLElement) => {},
  translateOnce: async (_el: HTMLElement) => {},
  pause() {}, resume() {}, destroy: async () => {},
};

export interface PageHost { index: number; div: HTMLElement }

class ViewerController {
  zoomMode = $state<'page-width' | 'page-fit' | 'page-actual' | 'custom'>('page-width');
  scale = $state(1);
  page = $state(1);
  pages = $state(0);
  editorType = $state(0);
  findTotal = $state(0);
  findCurrent = $state(0);
  findPending = $state(false);
  presenting = $state(false);

  inst: any = null;
  bus: any = null;
  link: any = null;
  find: any = null;
  container: HTMLDivElement | null = null;
  doc: Doc | null = null;
  private loadedRev = -1;
  private pageHostListeners = new Set<(h: PageHost) => void>();
  private restore: { page: number; top?: number; left?: number; scale?: string | number } | null = null;

  async init(container: HTMLDivElement) {
    V ??= await import('pdfjs-dist/legacy/web/pdf_viewer.mjs');
    this.container = container;
    const bus = new V.EventBus();
    const link = new V.PDFLinkService({ eventBus: bus, externalLinkTarget: 2, externalLinkRel: 'noopener noreferrer' });
    const find = new V.PDFFindController({ eventBus: bus, linkService: link, updateMatchesCountOnProgress: true });
    const inst = new V.PDFViewer({
      container, eventBus: bus, linkService: link, findController: find, l10n: l10n as any,
      annotationMode: pdfjsLib.AnnotationMode.ENABLE_FORMS,
      annotationEditorMode: pdfjsLib.AnnotationEditorType.NONE,
      textLayerMode: 1,
      removePageBorders: false,
      maxCanvasPixels: 2 ** 26,
      enableHWA: true,
      imageResourcesPath: '/pdfjs-images/',
      annotationEditorHighlightColors: L("gelb=#FFF066,grün=#5BFF7C,blau=#86E2FF,rosa=#FF98C8,rot=#FF4F5F"),
    } as any);
    link.setViewer(inst);
    Object.assign(this, { inst, bus, link, find });

    bus.on('pagesinit', () => {
      const r = this.restore; this.restore = null;
      this.applyLayout();
      inst.currentScaleValue = String(r?.scale ?? (this.zoomMode === 'custom' ? this.scale : this.zoomMode));
      if (r?.top != null) inst.scrollPageIntoView({ pageNumber: r.page, destArray: [null, { name: 'XYZ' }, r.left ?? null, r.top, null], allowNegativeOffset: true });
      else if (r?.page && r.page > 1) inst.currentPageNumber = r.page;
      this.pages = inst.pagesCount;
      if (this.editorType) this.setEditor(this.editorType, true);
    });
    bus.on('pagechanging', (e: any) => { this.page = e.pageNumber; if (this.doc) this.doc.current = e.pageNumber; });
    bus.on('scalechanging', (e: any) => { this.scale = e.scale; if (this.doc) this.doc.scale = e.scale; });
    bus.on('pagerendered', (e: any) => this.emitHost(e.pageNumber - 1));
    bus.on('textlayerrendered', (e: any) => this.emitHost(e.pageNumber - 1));
    bus.on('annotationlayerrendered', (e: any) => this.emitHost(e.pageNumber - 1));
    bus.on('updatefindmatchescount', (e: any) => { this.findTotal = e.matchesCount?.total || 0; this.findCurrent = e.matchesCount?.current || 0; });
    bus.on('updatefindcontrolstate', (e: any) => { this.findPending = e.state === 3; if (e.matchesCount) { this.findTotal = e.matchesCount.total || 0; this.findCurrent = e.matchesCount.current || 0; } });
    bus.on('annotationeditormodechanged', (e: any) => { this.editorType = e.mode > 0 ? e.mode : 0; });

    // Externe Links im Systembrowser öffnen
    container.addEventListener('click', ev => {
      const a = (ev.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null;
      if (!a) return;
      const href = a.getAttribute('href') || '';
      if (/^(https?:|mailto:)/i.test(href)) { ev.preventDefault(); ev.stopPropagation(); openExternal(href); }
    }, true);
  }

  /** Dokument anzeigen bzw. nach einer Änderung neu laden (Position bleibt erhalten) */
  show(doc: Doc | null) {
    if (!this.inst) return;
    const same = doc && this.doc === doc;
    if (same && doc!.rev === this.loadedRev) return;
    if (this.doc && this.doc !== doc) this.saveState(this.doc);
    if (same && this.inst.pdfDocument) {
      const loc = this.inst._location;
      this.restore = loc ? { page: Math.min(loc.pageNumber, doc!.numPages), top: loc.top, left: loc.left, scale: this.inst.currentScaleValue } : { page: doc!.current };
    } else if (doc) {
      const st = (doc as any)._view as typeof this.restore | undefined;
      this.restore = st || { page: doc.current };
    }
    this.doc = doc;
    this.loadedRev = doc?.rev ?? -1;
    this.findTotal = 0; this.findCurrent = 0;
    if (!doc || !doc.pdf) { this.inst.setDocument(null); this.link.setDocument(null); this.pages = 0; return; }
    this.inst.setDocument(doc.pdf);
    this.link.setDocument(doc.pdf, null);
  }
  saveState(doc: Doc) {
    const loc = this.inst?._location;
    if (loc) (doc as any)._view = { page: loc.pageNumber, top: loc.top, left: loc.left, scale: this.inst.currentScaleValue };
  }

  onPageHost(cb: (h: PageHost) => void) { this.pageHostListeners.add(cb); return () => this.pageHostListeners.delete(cb); }
  private emitHost(index: number) {
    const pv = this.inst?.getPageView(index);
    if (!pv?.div) return;
    for (const cb of this.pageHostListeners) cb({ index, div: pv.div });
  }
  pageDivs(): PageHost[] {
    const out: PageHost[] = [];
    for (let i = 0; i < (this.inst?.pagesCount || 0); i++) { const pv = this.inst.getPageView(i); if (pv?.div) out.push({ index: i, div: pv.div }); }
    return out;
  }

  // Zoom & Layout
  zoomBy(f: number) { if (!this.inst?.pdfDocument) return; this.zoomMode = 'custom'; this.inst.currentScale = clamp(this.inst.currentScale * f, 0.1, 8); }
  setScale(s: number) { if (!this.inst?.pdfDocument) return; this.zoomMode = 'custom'; this.inst.currentScale = clamp(s, 0.1, 8); }
  setZoom(mode: 'page-width' | 'page-fit' | 'page-actual') { this.zoomMode = mode; if (this.inst?.pdfDocument) this.inst.currentScaleValue = mode; }
  applyLayout() {
    if (!this.inst) return;
    try { this.inst.scrollMode = app.prefs.scroll; } catch { /* egal */ }
    try { this.inst.spreadMode = app.prefs.scroll === 1 ? 0 : app.prefs.spread; } catch { /* egal */ }
  }
  rotateView() { if (this.inst?.pdfDocument) this.inst.pagesRotation = (this.inst.pagesRotation + 90) % 360; }
  goto(n: number) { if (this.inst?.pdfDocument) this.inst.currentPageNumber = clamp(n, 1, this.inst.pagesCount); }
  next() { this.inst?.nextPage(); }
  prev() { this.inst?.previousPage(); }
  refit() { if (this.inst?.pdfDocument && this.zoomMode !== 'custom') this.inst.currentScaleValue = this.zoomMode; }

  // Suche
  search(query: string, opts: { again?: boolean; previous?: boolean; caseSensitive?: boolean; entireWord?: boolean } = {}) {
    if (!this.bus) return;
    this.bus.dispatch('find', { source: this, type: opts.again ? 'again' : '', query, caseSensitive: !!opts.caseSensitive, entireWord: !!opts.entireWord, highlightAll: true, findPrevious: !!opts.previous, matchDiacritics: false });
  }
  clearSearch() { this.bus?.dispatch('findbarclose', { source: this }); this.findTotal = 0; this.findCurrent = 0; }

  // pdf.js-Editoren (echte PDF-Anmerkungen)
  setEditor(type: number, force = false) {
    if (!this.inst?.pdfDocument) return;
    if (!force && this.editorType === type) return;
    this.editorType = type;
    try { this.inst.annotationEditorMode = { mode: type }; } catch (e) { console.warn(e); }
  }
  editorParam(type: number, value: any) { this.bus?.dispatch('switchannotationeditorparams', { source: this, type, value }); }

  // Präsentieren
  private presentState: any = null;
  async present() {
    if (!this.inst?.pdfDocument) return;
    this.presentState = { scroll: this.inst.scrollMode, spread: this.inst.spreadMode, scale: this.inst.currentScaleValue, page: this.inst.currentPageNumber };
    this.presenting = true;
    try { await document.documentElement.requestFullscreen?.(); } catch { /* egal */ }
    const { toggleFullscreen, isTauri } = await import('./platform');
    if (isTauri) await toggleFullscreen();
    setTimeout(() => { this.inst.scrollMode = 3; this.inst.spreadMode = 0; this.inst.currentScaleValue = 'page-fit'; this.inst.currentPageNumber = this.presentState.page; }, 120);
  }
  async endPresent() {
    if (!this.presenting) return;
    this.presenting = false;
    const s = this.presentState;
    const { toggleFullscreen, isTauri } = await import('./platform');
    if (isTauri) await toggleFullscreen(); else if (document.fullscreenElement) await document.exitFullscreen();
    setTimeout(() => { if (!s) return; this.inst.scrollMode = s.scroll; this.inst.spreadMode = s.spread; this.inst.currentScaleValue = s.scale; this.inst.currentPageNumber = this.inst.currentPageNumber; }, 120);
  }

  /** Bildschirmkoordinaten → Anteile der angezeigten Seite */
  frac(index: number, clientX: number, clientY: number) {
    const pv = this.inst?.getPageView(index);
    const r = (pv?.div.querySelector('.canvasWrapper') || pv?.div)?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return { x: (clientX - r.left) / r.width, y: (clientY - r.top) / r.height };
  }
}

export const viewer = new ViewerController();
