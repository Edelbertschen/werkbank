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

import { L } from '../i18n';
const hasDoc = () => !active();

export const appTools: Tool[] = [
  { id: 'open', label: L("Öffnen …"), short: L("Öffnen"), icon: I.FolderOpen, noDoc: true, direct: true, noBusy: true, shortcut: 'Mod+O', desc: L("PDF, Office-Dokumente, Bilder, E-Books und mehr öffnen"), run: async () => { await openDialog(); } },
  { id: 'new', label: L("Neues leeres Dokument"), short: L("Neu"), icon: I.FilePlus2, noDoc: true, direct: true, shortcut: 'Mod+N', desc: L("Leeres A4-Dokument anlegen"), run: async () => { await newBlankDoc(); } },
  { id: 'save', label: L("Speichern"), icon: I.Save, direct: true, shortcut: 'Mod+S', disabled: hasDoc, desc: L("Änderungen in die Datei schreiben"), run: async () => { await save(); } },
  { id: 'save-as', label: L("Speichern unter …"), short: L("Speichern unter"), icon: I.SaveAll, direct: true, shortcut: 'Mod+Shift+S', disabled: hasDoc, desc: L("Unter neuem Namen oder an anderem Ort speichern"), run: async () => { await save(active(), true); } },
  { id: 'print', label: L("Drucken …"), short: L("Drucken"), icon: I.Printer, direct: true, shortcut: 'Mod+P', disabled: hasDoc, desc: L("Dokument drucken"), run: async () => { await printDoc(); } },
  { id: 'close', label: L("Dokument schließen"), short: L("Schließen"), icon: I.X, direct: true, shortcut: 'Mod+W', disabled: hasDoc, run: async () => { await closeDoc(); } },
  { id: 'undo', label: L("Rückgängig"), icon: I.Undo2, direct: true, shortcut: 'Mod+Z', disabled: () => { const d = active(); return !d || (!d.canUndo && !d.overlayCount); }, run: async () => { await undo(); } },
  { id: 'redo', label: L("Wiederholen"), icon: I.Redo2, direct: true, shortcut: 'Mod+Shift+Z', disabled: () => !active()?.canRedo, run: async () => { await redo(); } },
  { id: 'history', label: L("Verlauf"), icon: I.History, desc: L("Alle Bearbeitungsschritte dieses Dokuments – zu jedem Stand zurückspringen."), panel: HistoryPanel },
  { id: 'settings', label: L("Einstellungen"), icon: I.Settings, noDoc: true, panel: SettingsPanel, desc: L("Name für Kommentare, Erscheinungsbild, Texterkennung") },
  // Werkzeuge im Viewer
  { id: 'tool-select', label: L("Text auswählen"), short: L("Auswählen"), icon: I.MousePointer2, direct: true, shortcut: 'V', active: () => app.mode === 'select', run: async () => { app.mode = 'select'; } },
  { id: 'tool-hand', label: L("Hand"), icon: I.Hand, direct: true, shortcut: 'H', active: () => app.mode === 'hand', run: async () => { app.mode = 'hand'; } },
  { id: 'find', label: L("Suchen"), icon: I.Search, direct: true, shortcut: 'Mod+F', disabled: hasDoc, run: async () => { app.sidebar = 'search'; setTimeout(() => (document.querySelector('#find-input') as HTMLInputElement)?.focus(), 30); } },
  // Ansicht
  { id: 'zoom-in', label: L("Vergrößern"), icon: I.ZoomIn, direct: true, shortcut: 'Mod+=', disabled: hasDoc, run: async () => viewer.zoomBy(1.2) },
  { id: 'zoom-out', label: L("Verkleinern"), icon: I.ZoomOut, direct: true, shortcut: 'Mod+-', disabled: hasDoc, run: async () => viewer.zoomBy(1 / 1.2) },
  { id: 'zoom-width', label: L("Seitenbreite"), icon: I.MoveHorizontal, direct: true, shortcut: 'Mod+2', disabled: hasDoc, active: () => viewer.zoomMode === 'page-width', run: async () => viewer.setZoom('page-width') },
  { id: 'zoom-page', label: L("Ganze Seite"), icon: I.Maximize, direct: true, shortcut: 'Mod+1', disabled: hasDoc, active: () => viewer.zoomMode === 'page-fit', run: async () => viewer.setZoom('page-fit') },
  { id: 'zoom-100', label: L("Originalgröße"), icon: I.Scaling, direct: true, shortcut: 'Mod+0', disabled: hasDoc, active: () => viewer.zoomMode === 'page-actual', run: async () => viewer.setZoom('page-actual') },
  { id: 'view-single', label: L("Einzelseite"), icon: I.FileText, direct: true, active: () => app.prefs.scroll === 3, run: async () => { app.prefs.scroll = 3; app.prefs.spread = 0; savePrefs(); viewer.applyLayout(); } },
  { id: 'view-continuous', label: L("Fortlaufend"), icon: I.Rows3, direct: true, active: () => app.prefs.scroll === 0 && app.prefs.spread === 0, run: async () => { app.prefs.scroll = 0; app.prefs.spread = 0; savePrefs(); viewer.applyLayout(); } },
  { id: 'view-spread', label: L("Doppelseite"), icon: I.BookOpen, direct: true, active: () => app.prefs.spread === 1, run: async () => { app.prefs.spread = 1; if (app.prefs.scroll === 3) app.prefs.scroll = 0; savePrefs(); viewer.applyLayout(); } },
  { id: 'view-spread-cover', label: L("Doppelseite mit Deckblatt"), short: L("Mit Deckblatt"), icon: I.BookOpen, direct: true, active: () => app.prefs.spread === 2, run: async () => { app.prefs.spread = 2; if (app.prefs.scroll === 3) app.prefs.scroll = 0; savePrefs(); viewer.applyLayout(); } },
  { id: 'view-horizontal', label: L("Horizontal blättern"), short: 'Horizontal', icon: I.StretchHorizontal, direct: true, active: () => app.prefs.scroll === 1, run: async () => { app.prefs.scroll = 1; savePrefs(); viewer.applyLayout(); } },
  { id: 'view-wrapped', label: L("Raster"), icon: I.Grid3x3, direct: true, active: () => app.prefs.scroll === 2, run: async () => { app.prefs.scroll = 2; savePrefs(); viewer.applyLayout(); } },
  { id: 'rotate-view', label: L("Ansicht drehen"), short: L("Ansicht drehen"), icon: I.RotateCw, direct: true, disabled: hasDoc, desc: L("Nur die Anzeige drehen, das Dokument bleibt unverändert"), run: async () => viewer.rotateView() },
  { id: 'organize', label: L("Seiten organisieren"), short: L("Organisieren"), icon: I.LayoutGrid, direct: true, shortcut: 'Mod+Shift+O', disabled: hasDoc, active: () => app.organize, desc: L("Alle Seiten als Raster: ziehen, auswählen, drehen, löschen"), run: async () => { app.organize = !app.organize; } },
  { id: 'sidebar', label: L("Seitenleiste"), icon: I.PanelLeft, direct: true, shortcut: 'Mod+Alt+S', active: () => !!app.sidebar, run: async () => { app.sidebar = app.sidebar ? null : 'pages'; } },
  { id: 'fullscreen', label: L("Vollbild"), icon: I.Expand, direct: true, shortcut: 'Mod+Ctrl+F', run: async () => toggleFullscreen() },
  { id: 'present', label: L("Präsentieren"), icon: I.Tv, direct: true, disabled: hasDoc, shortcut: 'Mod+Enter', desc: L("Seiten bildschirmfüllend zeigen; Pfeiltasten blättern, Esc beendet"), run: async () => viewer.present() },
  { id: 'night', label: L("Nachtmodus"), icon: I.Moon, direct: true, active: () => app.prefs.nightReading, desc: L("Seiten dunkel darstellen (nur Anzeige)"), run: async () => { app.prefs.nightReading = !app.prefs.nightReading; savePrefs(); } },
  { id: 'theme-light', label: L("Hell"), icon: I.Sun, direct: true, noDoc: true, active: () => app.prefs.theme === 'light', run: async () => { app.prefs.theme = 'light'; savePrefs(); applyTheme(); } },
  { id: 'theme-dark', label: L("Dunkel"), icon: I.Moon, direct: true, noDoc: true, active: () => app.prefs.theme === 'dark', run: async () => { app.prefs.theme = 'dark'; savePrefs(); applyTheme(); } },
  { id: 'theme-system', label: L("Wie System"), short: 'System', icon: I.Monitor, direct: true, noDoc: true, active: () => app.prefs.theme === 'system', run: async () => { app.prefs.theme = 'system'; savePrefs(); applyTheme(); } },
  { id: 'bookmarks-panel', label: L("Lesezeichen"), icon: I.Bookmark, direct: true, disabled: hasDoc, active: () => app.sidebar === 'outline', desc: L("Lesezeichen ansehen, anlegen, umbenennen und ordnen"), run: async () => { app.sidebar = app.sidebar === 'outline' ? null : 'outline'; } },
  { id: 'attachments-panel', label: L("Anhänge"), icon: I.Paperclip, direct: true, disabled: hasDoc, active: () => app.sidebar === 'attachments', desc: L("Eingebettete Dateien ansehen, speichern, hinzufügen"), run: async () => { app.sidebar = app.sidebar === 'attachments' ? null : 'attachments'; } },
  { id: 'layers-panel', label: L("Ebenen"), icon: I.Layers, direct: true, disabled: hasDoc, active: () => app.sidebar === 'layers', desc: L("Optionale Inhalte (z. B. aus CAD-Plänen) ein- und ausblenden"), run: async () => { app.sidebar = app.sidebar === 'layers' ? null : 'layers'; } },
  { id: 'comments-panel', label: L("Kommentarliste"), short: L("Liste"), icon: I.MessagesSquare, direct: true, disabled: hasDoc, active: () => app.sidebar === 'comments', desc: L("Alle Kommentare des Dokuments"), run: async () => { app.sidebar = app.sidebar === 'comments' ? null : 'comments'; } },
  { id: 'palette', label: L("Befehl suchen"), icon: I.Command, direct: true, noDoc: true, shortcut: 'Mod+K', run: async () => { app.palette = true; } },
];
