// Aufbau der Bandleiste
import type { RibbonTab } from './app.svelte';

export type RibbonItem = string | { id: string; size?: 'L' | 's'; menu?: string[] } | { custom: 'zoom' | 'style-shape' | 'style-ink' | 'style-highlight' | 'style-text' | 'quick-pages' };
export interface RibbonGroup { label: string; items: RibbonItem[]; large?: string[] }
export interface RibbonTabDef { id: RibbonTab; label: string; groups: RibbonGroup[] }

// Große Schaltflächen stehen in "large", alle übrigen werden klein gestapelt.
export const RIBBON: RibbonTabDef[] = [
  {
    id: 'start', label: 'Start', groups: [
      { label: 'Datei', items: ['open', 'save', 'save-as', 'print', 'close'], large: ['open', 'save'] },
      { label: 'Werkzeug', items: ['tool-select', 'tool-hand', 'find'], large: [] },
      { label: 'Zoom', items: [{ custom: 'zoom' }, 'zoom-width', 'zoom-page'], large: [] },
      { label: 'Seiten', items: ['organize', 'rotate-left', 'rotate-right', 'delete-pages', 'insert-file'], large: ['organize'] },
      { label: 'Schnellzugriff', items: ['text-edit', 'sign', 'highlight', 'compress', 'to-word', 'ocr'], large: ['text-edit', 'sign', 'compress'] },
    ],
  },
  {
    id: 'pages', label: 'Seiten', groups: [
      { label: 'Organisieren', items: ['organize', 'insert-blank', 'insert-file', 'extract', 'replace-pages', 'duplicate', 'delete-range'], large: ['organize', 'insert-file', 'extract'] },
      { label: 'Drehen', items: ['rotate-left', 'rotate-right', 'rotate'], large: [] },
      { label: 'Teilen und Verbinden', items: ['merge', 'split', 'alternate', 'reverse', 'remove-blank'], large: ['merge', 'split'] },
      { label: 'Format', items: ['crop', 'resize', 'divide', 'nup', 'booklet', 'one-page'], large: ['crop'] },
      { label: 'Kennzeichnen', items: ['page-numbers', 'header-footer', 'watermark', 'bates', 'background', 'page-labels'], large: ['page-numbers', 'watermark'] },
    ],
  },
  {
    id: 'edit', label: 'Bearbeiten', groups: [
      { label: 'Text', items: ['text-edit', 'text-add'], large: ['text-edit', 'text-add'] },
      { label: 'Einfügen', items: ['image', 'sign', 'stamp', 'link'], large: ['image', 'sign'] },
      { label: 'Abdecken', items: ['redact', 'find-redact', 'whiteout'], large: ['redact'] },
      { label: 'Struktur', items: ['toc', 'bookmarks-panel', 'attachments-panel', 'layers-panel'], large: [] },
      { label: 'Stil', items: [{ custom: 'style-text' }], large: [] },
    ],
  },
  {
    id: 'comment', label: 'Kommentieren', groups: [
      { label: 'Markieren', items: ['highlight', 'underline', 'strike'], large: ['highlight'] },
      { label: 'Notieren', items: ['note', 'freetext'], large: ['note', 'freetext'] },
      { label: 'Zeichnen', items: ['ink', 'rect', 'ellipse', 'line', 'arrow'], large: ['ink'] },
      { label: 'Stil', items: [{ custom: 'style-shape' }], large: [] },
      { label: 'Verwalten', items: ['comments-panel', 'export-comments', 'flatten-annots', 'remove-annots'], large: [] },
    ],
  },
  {
    id: 'forms', label: 'Formulare', groups: [
      { label: 'Felder anlegen', items: ['field-text', 'field-check', 'field-radio', 'field-choice', 'field-signature'], large: ['field-text'] },
      { label: 'Assistent', items: ['form-detect'], large: ['form-detect'] },
      { label: 'Ausfüllen', items: ['form-highlight', 'form-reset'], large: [] },
      { label: 'Daten', items: ['form-export', 'form-import'], large: [] },
      { label: 'Abschließen', items: ['form-flatten', 'form-remove'], large: ['form-flatten'] },
    ],
  },
  {
    id: 'convert', label: 'Umwandeln', groups: [
      { label: 'PDF erstellen', items: ['create-office', 'create-images', 'create-any', 'create-markdown'], large: ['create-office', 'create-images'] },
      { label: 'Office', items: ['to-word', 'to-excel', 'to-pptx'], large: ['to-word', 'to-excel', 'to-pptx'] },
      { label: 'Bild und Web', items: ['to-images', 'to-svg', 'to-html'], large: ['to-images'] },
      { label: 'Text', items: ['to-text', 'to-markdown', 'to-json', 'to-epub', 'to-cbz'], large: [] },
      { label: 'Standard', items: ['to-pdfa'], large: ['to-pdfa'] },
    ],
  },
  {
    id: 'optimize', label: 'Optimieren', groups: [
      { label: 'Größe', items: ['compress', 'linearize'], large: ['compress'] },
      { label: 'Scans', items: ['ocr', 'deskew', 'remove-blank', 'crop'], large: ['ocr'] },
      { label: 'Darstellung', items: ['grayscale', 'adjust-colors', 'invert', 'outline-fonts', 'rasterize', 'scan-look'], large: ['grayscale'] },
      { label: 'Reparatur', items: ['repair'], large: ['repair'] },
    ],
  },
  {
    id: 'protect', label: 'Schützen', groups: [
      { label: 'Signatur', items: ['sign-digital', 'verify', 'make-cert', 'sign'], large: ['sign-digital', 'verify'] },
      { label: 'Verschlüsselung', items: ['protect', 'unprotect', 'save-protected-copy'], large: ['protect'] },
      { label: 'Schwärzen', items: ['redact', 'find-redact'], large: ['redact', 'find-redact'] },
      { label: 'Datenschutz', items: ['sanitize', 'strip-metadata', 'metadata'], large: ['sanitize'] },
    ],
  },
  {
    id: 'analyze', label: 'Analysieren', groups: [
      { label: 'Prüfen', items: ['compare', 'info', 'fonts'], large: ['compare', 'info'] },
      { label: 'Extrahieren', items: ['extract-images', 'extract-tables', 'to-text', 'ai-prep'], large: ['extract-images', 'extract-tables', 'ai-prep'] },
      { label: 'Automatisieren', items: ['batch'], large: ['batch'] },
    ],
  },
  {
    id: 'view', label: 'Ansicht', groups: [
      { label: 'Seitenansicht', items: ['view-continuous', 'view-single', 'view-spread', 'view-spread-cover', 'view-horizontal', 'view-wrapped'], large: [] },
      { label: 'Zoom', items: [{ custom: 'zoom' }, 'zoom-width', 'zoom-page', 'zoom-100'], large: [] },
      { label: 'Anzeige', items: ['rotate-view', 'night', 'organize'], large: [] },
      { label: 'Fenster', items: ['sidebar', 'history', 'fullscreen', 'present'], large: ['present'] },
      { label: 'Erscheinungsbild', items: ['theme-system', 'theme-light', 'theme-dark', 'settings'], large: [] },
    ],
  },
];

export const RIBBON_LABEL: Record<RibbonTab, string> = Object.fromEntries(RIBBON.map(t => [t.id, t.label])) as any;

/** Registerkarten, die „Nur das Wichtigste“ ausblendet (bleiben über Strg+K erreichbar) */
export const ESSENTIAL_HIDDEN: RibbonTab[] = ['forms', 'optimize', 'analyze'];

/** Sichtbare Registerkarten; Start lässt sich nicht ausblenden */
export function visibleTabs(hidden: string[]): RibbonTabDef[] {
  return RIBBON.filter(t => t.id === 'start' || !hidden.includes(t.id));
}
export function effectiveTab(tab: RibbonTab, hidden: string[]): RibbonTab {
  return tab !== 'start' && hidden.includes(tab) ? 'start' : tab;
}
