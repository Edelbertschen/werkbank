// Analysieren: Vergleichen, Eigenschaften, Extrahieren, Stapel
import * as I from '../icons';
import type { Tool, OutFile } from './types';
import { PAGES, pagesOf, outName } from './common';
import { py, pyRun } from '../engines';
import { PY_TABLES } from './convert';
import { baseName } from '../util';


import { L } from '../i18n';
export const analyzeTools: Tool[] = [
  { id: 'compare', label: L("Dokumente vergleichen"), short: L("Vergleichen"), icon: I.GitCompare, desc: L("Zwei Fassungen nebeneinander, als Differenzbild oder als Textvergleich mit markierten Änderungen."), keys: L("unterschied diff version vergleich änderungen"), loadPanel: () => import('../../components/panels/ComparePanel.svelte') },
  { id: 'info', label: L("Eigenschaften"), short: L("Eigenschaften"), icon: I.Info, desc: L("Datei, PDF-Version, Seitenformate, Schutz, Formulare, Anhänge und Statistik."), keys: L("details version info statistik wörter"), loadPanel: () => import('../../components/panels/InfoPanel.svelte') },
  { id: 'fonts', label: L("Schriften"), icon: I.Type, desc: L("Alle verwendeten Schriften mit Typ und Einbettung – wichtig für Druck und PDF/A."), keys: L("fonts eingebettet"), loadPanel: () => import('../../components/panels/FontsPanel.svelte'), engine: 'pymupdf' },
  {
    id: 'extract-images', label: L("Bilder extrahieren"), short: L("Bilder"), icon: I.Images, engine: 'pymupdf', desc: L("Alle eingebetteten Bilder in Originalqualität speichern."), keys: L("fotos grafiken herausholen"),
    fields: [{ key: 'min', type: 'number', label: L("Kleinste Kantenlänge (Pixel)"), def: 48, min: 1, max: 2000, hint: L("Kleinere Bilder (Linien, Symbole) überspringen.") }, PAGES('all')], action: L("Extrahieren"),
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
      if (!r.result.length) return { message: L("Keine Bilder gefunden.") };
      const files = await pyRun(`0`, { outputs: r.result });
      return { files: r.result.map((n: string) => ({ name: `${baseName(ctx.doc!.name)} – ${n}`, data: files.files[n] })).filter((f: any) => f.data), zipName: outName(ctx, L("Bilder"), 'zip') };
    },
  },
  {
    id: 'extract-tables', label: L("Tabellen extrahieren"), short: L("Tabellen"), icon: I.Table, engine: 'pymupdf', desc: L("Erkannte Tabellen als Excel-Datei (eine Tabelle je Blatt) oder CSV."), keys: L("tabelle excel csv daten"),
    fields: [{ key: 'fmt', type: 'seg', label: L("Format"), opts: [['xlsx', 'Excel'], ['csv', 'CSV']], def: 'xlsx' }, PAGES('all')], action: L("Extrahieren"),
    run: async (v, ctx) => {
      const r = await pyRun<{ page: number; rows: (string | null)[][] }[]>(PY_TABLES, { files: { 'in.pdf': ctx.bytes }, vars: { pages: JSON.stringify(pagesOf(v.pages, ctx)) }, progress: ctx.progress });
      if (!r.result.length) return { message: L("Keine Tabellen erkannt.") };
      const XLSX: any = await import('xlsx');
      if (v.fmt === 'csv') return { files: r.result.map((t, k) => ({ name: outName(ctx, L("Tabelle {0} (S{1})", k + 1, t.page + 1), 'csv'), data: new Blob(['﻿' + XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet(t.rows), { FS: ';' })], { type: 'text/csv' }) })), zipName: outName(ctx, L("Tabellen"), 'zip') };
      const wb = XLSX.utils.book_new();
      r.result.forEach((t, k) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(t.rows.map(row => row.map(c => c ?? ''))), L("Tabelle {0} (S{1})", k + 1, t.page + 1).slice(0, 31)));
      return { files: [{ name: outName(ctx, L("Tabellen"), 'xlsx'), data: new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' })) }], message: L("{0} Tabelle(n) gefunden", r.result.length) };
    },
  },
  {
    id: 'ai-prep', label: L("Für KI aufbereiten"), short: L("Für KI"), icon: I.Bot, engine: 'pymupdf', desc: L("Sauberes Markdown und Textabschnitte mit Seitenangaben – zum Einfügen in ChatGPT, Claude oder eigene Suchsysteme."), keys: L("ki llm rag chunks claude chatgpt markdown"),
    fields: [{ key: 'fmt', type: 'seg', label: L("Ausgabe"), opts: [['md', 'Markdown'], ['chunks', L("Abschnitte (JSON)")], ['both', L("Beides")]], def: 'md' }], action: L("Aufbereiten"),
    run: async (v, ctx) => {
      const files: OutFile[] = [];
      if (v.fmt !== 'chunks') files.push({ name: outName(ctx, L("für KI"), 'md'), data: new Blob([await py<string>('pdfToMarkdown', ctx.bytes, { pageBreaks: true })], { type: 'text/markdown' }) });
      if (v.fmt !== 'md') files.push({ name: outName(ctx, L("Abschnitte"), 'json'), data: new Blob([JSON.stringify(await py<any[]>('pdfToLlmChunks', ctx.bytes), null, 1)], { type: 'application/json' }) });
      return { files };
    },
  },
  { id: 'batch', label: L("Stapelverarbeitung"), short: L("Stapel"), icon: I.Workflow, noDoc: true, desc: L("Ein Werkzeug auf viele Dateien auf einmal anwenden – z. B. 200 Scans mit Texterkennung versehen und komprimieren."), keys: L("stapel batch viele dateien automatisch ordner"), loadPanel: () => import('../../components/panels/BatchPanel.svelte') },
];
