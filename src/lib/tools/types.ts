import type { Component } from 'svelte';
import type { Doc } from '../doc.svelte';
import type { Field } from '../fields';
import type { EditMode } from '../app.svelte';

export interface ToolCtx {
  doc: Doc | null;
  /** Aktueller Stand (ungespeicherte Eingaben sind bereits eingeflossen) */
  bytes: Uint8Array;
  /** 0-basierte aktuelle Seite */
  current: number;
  selection: number[];
  progress: (p: number, msg?: string) => void;
}

export interface OutFile { name: string; data: Uint8Array | Blob; filters?: { name: string; extensions: string[] }[] }

export interface ToolResult {
  /** neuer Stand des aktuellen Dokuments */
  bytes?: Uint8Array;
  label?: string;
  selection?: number[];
  current?: number;
  /** neues Dokument (wird in einem Tab geöffnet) */
  doc?: { bytes: Uint8Array; name: string; label?: string };
  docs?: { bytes: Uint8Array; name: string; label?: string }[];
  /** Dateien zum Speichern (eine: Dialog; mehrere: Ordner oder ZIP) */
  files?: OutFile[];
  zipName?: string;
  message?: string;
  /** Aufgabenbereich offen lassen (z. B. für mehrere Durchgänge) */
  keepOpen?: boolean;
}

export interface Tool {
  id: string;
  label: string;
  /** Kurzer Name für die Bandleiste, falls anders */
  short?: string;
  icon: Component<any>;
  desc?: string;
  keys?: string;
  fields?: Field[];
  action?: string;
  /** ohne offenes Dokument nutzbar */
  noDoc?: boolean;
  /** sofort ausführen (keine Optionen) */
  direct?: boolean;
  run?: (v: Record<string, any>, ctx: ToolCtx) => Promise<ToolResult | void>;
  /** schaltet einen Bearbeitungsmodus im Viewer */
  mode?: EditMode;
  /** eigener Inhalt im Aufgabenbereich */
  panel?: Component<any>;
  /** Bereich erst beim Öffnen laden (hält den Start schlank) */
  loadPanel?: () => Promise<{ default: Component<any> }>;
  /** Hinweis, welche Engine geladen wird */
  engine?: 'pymupdf' | 'libreoffice' | 'ghostscript' | 'tesseract';
  /** aktiver Zustand (für Umschalter) */
  active?: () => boolean;
  /** deaktiviert? */
  disabled?: () => boolean;
  shortcut?: string;
  /** ohne Fortschrittsanzeige ausführen (öffnet eigene Dialoge) */
  noBusy?: boolean;
}
