// Globaler Zustand der App
import type { Doc } from './doc.svelte';
import { stateLoad, stateSave } from './platform';

export type RibbonTab = 'start' | 'pages' | 'edit' | 'comment' | 'forms' | 'convert' | 'optimize' | 'protect' | 'analyze' | 'view';
export type SidebarPanel = 'pages' | 'outline' | 'search' | 'comments' | 'attachments' | 'layers' | 'history';

/** Bearbeitungsmodi im Viewer. Alle Bearbeitungen sind Elemente im Dokument (Overlay), jede ist sofort ein Stand. */
export type EditMode =
  | 'select' | 'hand'
  | 'shape:rect' | 'shape:ellipse' | 'shape:line' | 'shape:arrow'
  | 'note' | 'text:add' | 'text:edit' | 'move' | 'image' | 'sign' | 'stamp'
  | 'redact' | 'whiteout' | 'link'
  | 'field:text' | 'field:check' | 'field:radio' | 'field:choice' | 'field:signature'
  | 'markup:underline' | 'markup:strike' | 'markup:highlight' | 'ink' | 'comment:text';

export interface Toast { id: number; text: string; kind: 'info' | 'ok' | 'error'; action?: { label: string; run: () => void }; ms: number }
export interface Busy { label: string; progress: number; detail?: string; cancel?: () => void }
export interface RecentFile { path: string; name: string; at: number; pages?: number; size?: number; thumb?: string }

export interface Prefs {
  theme: 'system' | 'light' | 'dark';
  author: string;
  ribbonCollapsed: boolean;
  sidebarWidth: number;
  paneWidth: number;
  spread: 0 | 1 | 2;
  scroll: 0 | 1 | 2 | 3;
  nightReading: boolean;
  ocrLangs: string[];
  signatures: string[];
  lastDir: string;
  quickAccess: string[];
  showFieldHighlight: boolean;
  preloadEngines: boolean;
  lang: 'system' | 'de' | 'en';
  hiddenTabs: RibbonTab[];
}

const defaultPrefs: Prefs = {
  theme: 'system',
  author: '',
  ribbonCollapsed: false,
  sidebarWidth: 232,
  paneWidth: 320,
  spread: 0,
  scroll: 0,
  nightReading: false,
  ocrLangs: ['deu', 'eng'],
  signatures: [],
  lastDir: '',
  quickAccess: ['open', 'save', 'undo', 'redo', 'print'],
  showFieldHighlight: true,
  preloadEngines: true,
  lang: 'system',
  hiddenTabs: [],
};

export const app = $state({
  docs: [] as Doc[],
  activeId: null as string | null,
  tab: 'start' as RibbonTab,
  ribbonPeek: false,
  sidebar: 'pages' as SidebarPanel | null,
  pane: null as null | { tool: string; nonce: number; values?: Record<string, any> },
  organize: false,
  backstage: false,
  mode: 'select' as EditMode,
  /** Vorbereitetes Bild für Stempel/Unterschrift/Bild-Modus */
  placing: null as null | { src: string; ratio: number; width: number; kind: 'sign' | 'stamp' | 'image' },
  style: { stroke: '#E5484D', fill: 'transparent', width: 2, ink: '#1F4FD1', inkWidth: 2, highlight: '#FFD60A', textColor: '#1C1C1E', fontSize: 12, opacity: 1 },
  busy: null as Busy | null,
  toasts: [] as Toast[],
  recent: [] as RecentFile[],
  prefs: { ...defaultPrefs } as Prefs,
  palette: false,
  dropping: false,
  ready: false,
  findQuery: '',
  viewerRev: 0,
});

export function active(): Doc | null {
  return app.docs.find(d => d.id === app.activeId) || null;
}

let toastSeq = 0;
export function toast(text: string, opts: { kind?: Toast['kind']; action?: Toast['action']; ms?: number } = {}) {
  const t: Toast = { id: ++toastSeq, text, kind: opts.kind || 'info', action: opts.action, ms: opts.ms ?? (opts.kind === 'error' ? 8000 : 4500) };
  app.toasts.push(t);
  setTimeout(() => dismissToast(t.id), t.ms);
  return t.id;
}
export function dismissToast(id: number) {
  const i = app.toasts.findIndex(t => t.id === id);
  if (i >= 0) app.toasts.splice(i, 1);
}

export async function loadPersisted() {
  const p = await stateLoad<Prefs>('prefs', defaultPrefs);
  Object.assign(app.prefs, defaultPrefs, p);
  const r = await stateLoad<{ list: RecentFile[] }>('recent', { list: [] });
  app.recent = r.list || [];
  applyTheme();
}
export function savePrefs() { stateSave('prefs', $state.snapshot(app.prefs)); }
export function saveRecent() { stateSave('recent', { list: $state.snapshot(app.recent).slice(0, 30) }); }

export function addRecent(entry: RecentFile) {
  app.recent = [entry, ...app.recent.filter(r => r.path !== entry.path)].slice(0, 30);
  saveRecent();
}

export function applyTheme() {
  const t = app.prefs.theme;
  if (t === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
}
