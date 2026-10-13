// Aufbau der Bandleiste
import type { RibbonTab } from './app.svelte';

import { L } from './i18n';
export type RibbonItem = string | { id: string; size?: 'L' | 's'; menu?: string[] } | { custom: 'zoom' | 'style-shape' | 'style-ink' | 'style-highlight' | 'style-text' | 'quick-pages' };
export interface RibbonGroup { label: string; items: RibbonItem[]; large?: string[] }
export interface RibbonTabDef { id: RibbonTab; label: string; groups: RibbonGroup[] }

// Große Schaltflächen stehen in "large", alle übrigen werden klein gestapelt.
export const RIBBON: RibbonTabDef[] = [
  {
    id: 'start', label: L("Start"), groups: [
      { label: L("Datei"), items: ['open', 'save', 'save-as', 'print', 'close'], large: ['open', 'save'] },
      { label: L("Werkzeug"), items: ['tool-select', 'tool-hand', 'find'], large: [] },
      { label: 'Zoom', items: [{ custom: 'zoom' }, 'zoom-width', 'zoom-page'], large: [] },
      { label: L("Seiten"), items: ['organize', 'rotate-left', 'rotate-right', 'delete-pages', 'insert-file'], large: ['organize'] },
      { label: L("Schnellzugriff"), items: ['text-edit', 'sign', 'highlight', 'compress', 'to-word', 'ocr'], large: ['text-edit', 'sign', 'compress'] },
    ],
  },
  {
    id: 'pages', label: L("Seiten"), groups: [
      { label: L("Organisieren"), items: ['organize', 'insert-blank', 'insert-file', 'extract', 'replace-pages', 'duplicate', 'delete-range'], large: ['organize', 'insert-file', 'extract'] },
      { label: L("Drehen"), items: ['rotate-left', 'rotate-right', 'rotate'], large: [] },
      { label: L("Teilen und Verbinden"), items: ['merge', 'split', 'alternate', 'reverse', 'remove-blank'], large: ['merge', 'split'] },
      { label: L("Format"), items: ['crop', 'resize', 'divide', 'nup', 'booklet', 'one-page'], large: ['crop'] },
      { label: L("Kennzeichnen"), items: ['page-numbers', 'header-footer', 'watermark', 'bates', 'background', 'page-labels'], large: ['page-numbers', 'watermark'] },
    ],
  },
  {
    id: 'edit', label: L("Bearbeiten"), groups: [
      { label: 'Text', items: ['move', 'text-edit', 'text-add'], large: ['move', 'text-edit', 'text-add'] },
      { label: L("Einfügen"), items: ['image', 'sign', 'stamp', 'link'], large: ['image', 'sign'] },
      { label: L("Abdecken"), items: ['redact', 'find-redact', 'whiteout'], large: ['redact'] },
      { label: L("Struktur"), items: ['toc', 'bookmarks-panel', 'attachments-panel', 'layers-panel'], large: [] },
      { label: L("Stil"), items: [{ custom: 'style-text' }], large: [] },
    ],
  },
  {
    id: 'comment', label: L("Kommentieren"), groups: [
      { label: L("Markieren"), items: ['highlight', 'underline', 'strike'], large: ['highlight'] },
      { label: L("Notieren"), items: ['note', 'freetext'], large: ['note', 'freetext'] },
      { label: L("Zeichnen"), items: ['ink', 'rect', 'ellipse', 'line', 'arrow'], large: ['ink'] },
      { label: L("Stil"), items: [{ custom: 'style-shape' }], large: [] },
      { label: L("Verwalten"), items: ['comments-panel', 'export-comments', 'flatten-annots', 'remove-annots'], large: [] },
    ],
  },
  {
    id: 'forms', label: L("Formulare"), groups: [
      { label: L("Felder anlegen"), items: ['field-text', 'field-check', 'field-radio', 'field-choice', 'field-signature'], large: ['field-text'] },
      { label: L("Assistent"), items: ['form-detect'], large: ['form-detect'] },
      { label: L("Ausfüllen"), items: ['form-highlight', 'form-reset'], large: [] },
      { label: L("Daten"), items: ['form-export', 'form-import'], large: [] },
      { label: L("Abschließen"), items: ['form-flatten', 'form-remove'], large: ['form-flatten'] },
    ],
  },
  {
    id: 'convert', label: L("Umwandeln"), groups: [
      { label: L("PDF erstellen"), items: ['create-office', 'create-images', 'create-any', 'create-markdown'], large: ['create-office', 'create-images'] },
      { label: 'Office', items: ['to-word', 'to-excel', 'to-pptx'], large: ['to-word', 'to-excel', 'to-pptx'] },
      { label: L("Bild und Web"), items: ['to-images', 'to-svg', 'to-html'], large: ['to-images'] },
      { label: 'Text', items: ['to-text', 'to-markdown', 'to-json', 'to-epub', 'to-cbz'], large: [] },
      { label: L("Standard"), items: ['to-pdfa'], large: ['to-pdfa'] },
    ],
  },
  {
    id: 'optimize', label: L("Optimieren"), groups: [
      { label: L("Größe"), items: ['compress', 'linearize'], large: ['compress'] },
      { label: 'Scans', items: ['ocr', 'deskew', 'remove-blank', 'crop'], large: ['ocr'] },
      { label: L("Darstellung"), items: ['grayscale', 'adjust-colors', 'invert', 'outline-fonts', 'rasterize', 'scan-look'], large: ['grayscale'] },
      { label: L("Reparatur"), items: ['repair'], large: ['repair'] },
    ],
  },
  {
    id: 'protect', label: L("Schützen"), groups: [
      { label: L("Signatur"), items: ['sign-digital', 'verify', 'make-cert', 'sign'], large: ['sign-digital', 'verify'] },
      { label: L("Verschlüsselung"), items: ['protect', 'unprotect', 'save-protected-copy'], large: ['protect'] },
      { label: L("Schwärzen"), items: ['redact', 'find-redact'], large: ['redact', 'find-redact'] },
      { label: L("Datenschutz"), items: ['sanitize', 'strip-metadata', 'metadata'], large: ['sanitize'] },
    ],
  },
  {
    id: 'analyze', label: L("Analysieren"), groups: [
      { label: L("Prüfen"), items: ['compare', 'info', 'fonts'], large: ['compare', 'info'] },
      { label: L("Extrahieren"), items: ['extract-images', 'extract-tables', 'to-text', 'ai-prep'], large: ['extract-images', 'extract-tables', 'ai-prep'] },
      { label: L("Automatisieren"), items: ['batch'], large: ['batch'] },
    ],
  },
  {
    id: 'view', label: L("Ansicht"), groups: [
      { label: L("Seitenansicht"), items: ['view-continuous', 'view-single', 'view-spread', 'view-spread-cover', 'view-horizontal', 'view-wrapped'], large: [] },
      { label: 'Zoom', items: [{ custom: 'zoom' }, 'zoom-width', 'zoom-page', 'zoom-100'], large: [] },
      { label: L("Anzeige"), items: ['rotate-view', 'night', 'organize'], large: [] },
      { label: L("Fenster"), items: ['sidebar', 'history', 'fullscreen', 'present'], large: ['present'] },
      { label: L("Erscheinungsbild"), items: ['theme-system', 'theme-light', 'theme-dark', 'settings'], large: [] },
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
