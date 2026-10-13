import { L } from '../i18n';
// Ladezustand der Engines für die Statusleiste
export type EngineName = 'pymupdf' | 'libreoffice' | 'ghostscript' | 'tesseract';
export type EngineStatus = 'idle' | 'loading' | 'ready' | 'error';

const s = $state<Record<EngineName, EngineStatus>>({ pymupdf: 'idle', libreoffice: 'idle', ghostscript: 'idle', tesseract: 'idle' });

export const engineState = {
  get: (n: EngineName) => s[n],
  set: (n: EngineName, v: EngineStatus) => { s[n] = v; },
  get all() { return s; },
};

export const ENGINE_LABEL: Record<EngineName, string> = {
  pymupdf: L("PDF-Engine"),
  libreoffice: L("Office-Engine"),
  ghostscript: 'Ghostscript',
  tesseract: L("Texterkennung"),
};
