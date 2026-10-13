// Analysieren: Vergleichen, Eigenschaften, Extrahieren, Stapel
import * as I from '../icons';
import type { Tool, OutFile } from './types';
import { PAGES, pagesOf, outName } from './common';
import { py, pyRun } from '../engines';
import { PY_TABLES } from './convert';
import { baseName } from '../util';

import InfoPanel from '../../components/panels/InfoPanel.svelte';
import FontsPanel from '../../components/panels/FontsPanel.svelte';
import BatchPanel from '../../components/panels/BatchPanel.svelte';
import ComparePanel from '../../components/panels/ComparePanel.svelte';

export const analyzeTools: Tool[] = [
  { id: 'compare', label: 'Dokumente vergleichen', short: 'Vergleichen', icon: I.GitCompare, desc: 'Zwei Fassungen nebeneinander, als Differenzbild oder als Textvergleich mit markierten Änderungen.', keys: 'unterschied diff version vergleich änderungen', panel: ComparePanel },
  { id: 'info', label: 'Eigenschaften', short: 'Eigenschaften', icon: I.Info, desc: 'Datei, PDF-Version, Seitenformate, Schutz, Formulare, Anhänge und Statistik.', keys: 'details version info statistik wörter', panel: InfoPanel },
  { id: 'fonts', label: 'Schriften', icon: I.Type, desc: 'Alle verwendeten Schriften mit Typ und Einbettung – wichtig für Druck und PDF/A.', keys: 'fonts eingebettet', panel: FontsPanel, engine: 'pymupdf' },
  {
    id: 'extract-images', label: 'Bilder extrahieren', short: 'Bilder', icon: I.Images, engine: 'pymupdf', desc: 'Alle eingebetteten Bilder in Originalqualität speichern.', keys: 'fotos grafiken herausholen',
    fields: [{ key: 'min', type: 'number', label: 'Kleinste Kantenlänge (Pixel)', def: 48, min: 1, max: 2000, hint: 'Kleinere Bilder (Linien, Symbole) überspringen.' }, PAGES('all')], action: 'Extrahieren',
    run: async (v, ctx) => {
      const r = await pyRun<any[]>(`
doc = open_in()
seen = set(); out = []; k = 0
for pno in json.loads(ARGS['pages']):
    for img in doc[pno].get_images(full=True):
        x = img[0]
        if x in seen: continue
        seen.add(x)
        try:
            d = doc.extract_image(x)
        except Exception:
            continue
        if not d or min(d['width'], d['height']) < int(ARGS['min']): continue
        k += 1
        name = f"S{pno+1}-{k}.{d['ext']}"
        with open('/w/' + name, 'wb') as f: f.write(d['image'])
        out.append(name)
out`, { files: { 'in.pdf': ctx.bytes }, vars: { pages: JSON.stringify(pagesOf(v.pages, ctx)), min: v.min } });
      if (!r.result.length) return { message: 'Keine Bilder gefunden.' };
      const files = await pyRun(`0`, { outputs: r.result });
      return { files: r.result.map((n: string) => ({ name: `${baseName(ctx.doc!.name)} – ${n}`, data: files.files[n] })).filter((f: any) => f.data), zipName: outName(ctx, 'Bilder', 'zip') };
    },
  },
  {
    id: 'extract-tables', label: 'Tabellen extrahieren', short: 'Tabellen', icon: I.Table, engine: 'pymupdf', desc: 'Erkannte Tabellen als Excel-Datei (eine Tabelle je Blatt) oder CSV.', keys: 'tabelle excel csv daten',
    fields: [{ key: 'fmt', type: 'seg', label: 'Format', opts: [['xlsx', 'Excel'], ['csv', 'CSV']], def: 'xlsx' }, PAGES('all')], action: 'Extrahieren',
    run: async (v, ctx) => {
      const r = await pyRun<{ page: number; rows: (string | null)[][] }[]>(PY_TABLES, { files: { 'in.pdf': ctx.bytes }, vars: { pages: JSON.stringify(pagesOf(v.pages, ctx)) }, progress: ctx.progress });
      if (!r.result.length) return { message: 'Keine Tabellen erkannt.' };
      const XLSX: any = await import('xlsx');
      if (v.fmt === 'csv') return { files: r.result.map((t, k) => ({ name: outName(ctx, `Tabelle ${k + 1} (S${t.page + 1})`, 'csv'), data: new Blob(['﻿' + XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet(t.rows), { FS: ';' })], { type: 'text/csv' }) })), zipName: outName(ctx, 'Tabellen', 'zip') };
      const wb = XLSX.utils.book_new();
      r.result.forEach((t, k) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(t.rows.map(row => row.map(c => c ?? ''))), `Tabelle ${k + 1} (S${t.page + 1})`.slice(0, 31)));
      return { files: [{ name: outName(ctx, 'Tabellen', 'xlsx'), data: new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' })) }], message: `${r.result.length} Tabelle(n) gefunden` };
    },
  },
  {
    id: 'ai-prep', label: 'Für KI aufbereiten', short: 'Für KI', icon: I.Bot, engine: 'pymupdf', desc: 'Sauberes Markdown und Textabschnitte mit Seitenangaben – zum Einfügen in ChatGPT, Claude oder eigene Suchsysteme.', keys: 'ki llm rag chunks claude chatgpt markdown',
    fields: [{ key: 'fmt', type: 'seg', label: 'Ausgabe', opts: [['md', 'Markdown'], ['chunks', 'Abschnitte (JSON)'], ['both', 'Beides']], def: 'md' }], action: 'Aufbereiten',
    run: async (v, ctx) => {
      const files: OutFile[] = [];
      if (v.fmt !== 'chunks') files.push({ name: outName(ctx, 'für KI', 'md'), data: new Blob([await py<string>('pdfToMarkdown', ctx.bytes, { pageBreaks: true })], { type: 'text/markdown' }) });
      if (v.fmt !== 'md') files.push({ name: outName(ctx, 'Abschnitte', 'json'), data: new Blob([JSON.stringify(await py<any[]>('pdfToLlmChunks', ctx.bytes), null, 1)], { type: 'application/json' }) });
      return { files };
    },
  },
  { id: 'batch', label: 'Stapelverarbeitung', short: 'Stapel', icon: I.Workflow, noDoc: true, desc: 'Ein Werkzeug auf viele Dateien auf einmal anwenden – z. B. 200 Scans mit Texterkennung versehen und komprimieren.', keys: 'stapel batch viele dateien automatisch ordner', panel: BatchPanel },
];
