// Datei- und Ansichtsbefehle
import * as I from '../icons';
import type { Tool } from './types';
import { app, active, savePrefs, applyTheme } from '../app.svelte';
import { openDialog, save, closeDoc, undo, redo, newBlankDoc } from '../actions';
import { toggleFullscreen } from '../platform';
import { viewer } from '../viewer.svelte';
import { printDoc } from '../print';
import SettingsPanel from '../../components/panels/SettingsPanel.svelte';
import HistoryPanel from '../../components/panels/HistoryPanel.svelte';

const hasDoc = () => !active();

export const appTools: Tool[] = [
  { id: 'open', label: 'Öffnen …', short: 'Öffnen', icon: I.FolderOpen, noDoc: true, direct: true, noBusy: true, shortcut: 'Mod+O', desc: 'PDF, Office-Dokumente, Bilder, E-Books und mehr öffnen', run: async () => { await openDialog(); } },
  { id: 'new', label: 'Neues leeres Dokument', short: 'Neu', icon: I.FilePlus2, noDoc: true, direct: true, shortcut: 'Mod+N', desc: 'Leeres A4-Dokument anlegen', run: async () => { await newBlankDoc(); } },
  { id: 'save', label: 'Speichern', icon: I.Save, direct: true, shortcut: 'Mod+S', disabled: hasDoc, desc: 'Änderungen in die Datei schreiben', run: async () => { await save(); } },
  { id: 'save-as', label: 'Speichern unter …', short: 'Speichern unter', icon: I.SaveAll, direct: true, shortcut: 'Mod+Shift+S', disabled: hasDoc, desc: 'Unter neuem Namen oder an anderem Ort speichern', run: async () => { await save(active(), true); } },
  { id: 'print', label: 'Drucken …', short: 'Drucken', icon: I.Printer, direct: true, shortcut: 'Mod+P', disabled: hasDoc, desc: 'Dokument drucken', run: async () => { await printDoc(); } },
  { id: 'close', label: 'Dokument schließen', short: 'Schließen', icon: I.X, direct: true, shortcut: 'Mod+W', disabled: hasDoc, run: async () => { await closeDoc(); } },
  { id: 'undo', label: 'Rückgängig', icon: I.Undo2, direct: true, shortcut: 'Mod+Z', disabled: () => { const d = active(); return !d || (!d.canUndo && !d.overlayCount); }, run: async () => { await undo(); } },
  { id: 'redo', label: 'Wiederholen', icon: I.Redo2, direct: true, shortcut: 'Mod+Shift+Z', disabled: () => !active()?.canRedo, run: async () => { await redo(); } },
  { id: 'history', label: 'Verlauf', icon: I.History, desc: 'Alle Bearbeitungsschritte dieses Dokuments – zu jedem Stand zurückspringen.', panel: HistoryPanel },
  { id: 'settings', label: 'Einstellungen', icon: I.Settings, noDoc: true, panel: SettingsPanel, desc: 'Name für Kommentare, Erscheinungsbild, Texterkennung' },
  // Werkzeuge im Viewer
  { id: 'tool-select', label: 'Text auswählen', short: 'Auswählen', icon: I.MousePointer2, direct: true, shortcut: 'V', active: () => app.mode === 'select', run: async () => { app.mode = 'select'; } },
  { id: 'tool-hand', label: 'Hand', icon: I.Hand, direct: true, shortcut: 'H', active: () => app.mode === 'hand', run: async () => { app.mode = 'hand'; } },
  { id: 'find', label: 'Suchen', icon: I.Search, direct: true, shortcut: 'Mod+F', disabled: hasDoc, run: async () => { app.sidebar = 'search'; setTimeout(() => (document.querySelector('#find-input') as HTMLInputElement)?.focus(), 30); } },
  // Ansicht
  { id: 'zoom-in', label: 'Vergrößern', icon: I.ZoomIn, direct: true, shortcut: 'Mod+=', disabled: hasDoc, run: async () => viewer.zoomBy(1.2) },
  { id: 'zoom-out', label: 'Verkleinern', icon: I.ZoomOut, direct: true, shortcut: 'Mod+-', disabled: hasDoc, run: async () => viewer.zoomBy(1 / 1.2) },
  { id: 'zoom-width', label: 'Seitenbreite', icon: I.MoveHorizontal, direct: true, shortcut: 'Mod+2', disabled: hasDoc, active: () => viewer.zoomMode === 'page-width', run: async () => viewer.setZoom('page-width') },
  { id: 'zoom-page', label: 'Ganze Seite', icon: I.Maximize, direct: true, shortcut: 'Mod+1', disabled: hasDoc, active: () => viewer.zoomMode === 'page-fit', run: async () => viewer.setZoom('page-fit') },
  { id: 'zoom-100', label: 'Originalgröße', icon: I.Scaling, direct: true, shortcut: 'Mod+0', disabled: hasDoc, active: () => viewer.zoomMode === 'page-actual', run: async () => viewer.setZoom('page-actual') },
  { id: 'view-single', label: 'Einzelseite', icon: I.FileText, direct: true, active: () => app.prefs.scroll === 3, run: async () => { app.prefs.scroll = 3; app.prefs.spread = 0; savePrefs(); viewer.applyLayout(); } },
  { id: 'view-continuous', label: 'Fortlaufend', icon: I.Rows3, direct: true, active: () => app.prefs.scroll === 0 && app.prefs.spread === 0, run: async () => { app.prefs.scroll = 0; app.prefs.spread = 0; savePrefs(); viewer.applyLayout(); } },
  { id: 'view-spread', label: 'Doppelseite', icon: I.BookOpen, direct: true, active: () => app.prefs.spread === 1, run: async () => { app.prefs.spread = 1; if (app.prefs.scroll === 3) app.prefs.scroll = 0; savePrefs(); viewer.applyLayout(); } },
  { id: 'view-spread-cover', label: 'Doppelseite mit Deckblatt', short: 'Mit Deckblatt', icon: I.BookOpen, direct: true, active: () => app.prefs.spread === 2, run: async () => { app.prefs.spread = 2; if (app.prefs.scroll === 3) app.prefs.scroll = 0; savePrefs(); viewer.applyLayout(); } },
  { id: 'view-horizontal', label: 'Horizontal blättern', short: 'Horizontal', icon: I.StretchHorizontal, direct: true, active: () => app.prefs.scroll === 1, run: async () => { app.prefs.scroll = 1; savePrefs(); viewer.applyLayout(); } },
  { id: 'view-wrapped', label: 'Raster', icon: I.Grid3x3, direct: true, active: () => app.prefs.scroll === 2, run: async () => { app.prefs.scroll = 2; savePrefs(); viewer.applyLayout(); } },
  { id: 'rotate-view', label: 'Ansicht drehen', short: 'Ansicht drehen', icon: I.RotateCw, direct: true, disabled: hasDoc, desc: 'Nur die Anzeige drehen, das Dokument bleibt unverändert', run: async () => viewer.rotateView() },
  { id: 'organize', label: 'Seiten organisieren', short: 'Organisieren', icon: I.LayoutGrid, direct: true, shortcut: 'Mod+Shift+O', disabled: hasDoc, active: () => app.organize, desc: 'Alle Seiten als Raster: ziehen, auswählen, drehen, löschen', run: async () => { app.organize = !app.organize; } },
  { id: 'sidebar', label: 'Seitenleiste', icon: I.PanelLeft, direct: true, shortcut: 'Mod+Alt+S', active: () => !!app.sidebar, run: async () => { app.sidebar = app.sidebar ? null : 'pages'; } },
  { id: 'fullscreen', label: 'Vollbild', icon: I.Expand, direct: true, shortcut: 'Mod+Ctrl+F', run: async () => toggleFullscreen() },
  { id: 'present', label: 'Präsentieren', icon: I.Tv, direct: true, disabled: hasDoc, shortcut: 'Mod+Enter', desc: 'Seiten bildschirmfüllend zeigen; Pfeiltasten blättern, Esc beendet', run: async () => viewer.present() },
  { id: 'night', label: 'Nachtmodus', icon: I.Moon, direct: true, active: () => app.prefs.nightReading, desc: 'Seiten dunkel darstellen (nur Anzeige)', run: async () => { app.prefs.nightReading = !app.prefs.nightReading; savePrefs(); } },
  { id: 'theme-light', label: 'Hell', icon: I.Sun, direct: true, noDoc: true, active: () => app.prefs.theme === 'light', run: async () => { app.prefs.theme = 'light'; savePrefs(); applyTheme(); } },
  { id: 'theme-dark', label: 'Dunkel', icon: I.Moon, direct: true, noDoc: true, active: () => app.prefs.theme === 'dark', run: async () => { app.prefs.theme = 'dark'; savePrefs(); applyTheme(); } },
  { id: 'theme-system', label: 'Wie System', short: 'System', icon: I.Monitor, direct: true, noDoc: true, active: () => app.prefs.theme === 'system', run: async () => { app.prefs.theme = 'system'; savePrefs(); applyTheme(); } },
  { id: 'bookmarks-panel', label: 'Lesezeichen', icon: I.Bookmark, direct: true, disabled: hasDoc, active: () => app.sidebar === 'outline', desc: 'Lesezeichen ansehen, anlegen, umbenennen und ordnen', run: async () => { app.sidebar = app.sidebar === 'outline' ? null : 'outline'; } },
  { id: 'attachments-panel', label: 'Anhänge', icon: I.Paperclip, direct: true, disabled: hasDoc, active: () => app.sidebar === 'attachments', desc: 'Eingebettete Dateien ansehen, speichern, hinzufügen', run: async () => { app.sidebar = app.sidebar === 'attachments' ? null : 'attachments'; } },
  { id: 'layers-panel', label: 'Ebenen', icon: I.Layers, direct: true, disabled: hasDoc, active: () => app.sidebar === 'layers', desc: 'Optionale Inhalte (z. B. aus CAD-Plänen) ein- und ausblenden', run: async () => { app.sidebar = app.sidebar === 'layers' ? null : 'layers'; } },
  { id: 'comments-panel', label: 'Kommentarliste', short: 'Liste', icon: I.MessagesSquare, direct: true, disabled: hasDoc, active: () => app.sidebar === 'comments', desc: 'Alle Kommentare des Dokuments', run: async () => { app.sidebar = app.sidebar === 'comments' ? null : 'comments'; } },
  { id: 'palette', label: 'Befehl suchen', icon: I.Command, direct: true, noDoc: true, shortcut: 'Mod+K', run: async () => { app.palette = true; } },
];
