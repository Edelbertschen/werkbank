// Seiten zusammenstellen (Zusammenführen, Einfügen, Extrahieren, Aufteilen) mit PyMuPDF:
// interne Links, benannte Ziele, Formularfelder, Ebenen, Anhänge und Lesezeichen bleiben erhalten.
import { pyRun } from './engines';
import GRAFT from './engines/graft.py?raw';

export interface Part { bytes: Uint8Array; pages?: number[] | null; title?: string }
/** keep: Lesezeichen der Quelle; files: je Datei ein Lesezeichen; concat: Lesezeichen aller Dateien; insert: einfügen an `at` */
export type TocMode = 'keep' | 'files' | 'concat' | 'insert';

/** Mehrere Teile zu einem PDF */
export async function assemble(parts: Part[], toc: TocMode, at?: number): Promise<Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  parts.forEach((p, k) => { files[`p${k}.pdf`] = p.bytes; });
  const spec = parts.map((p, k) => ({ path: `/w/p${k}.pdf`, pages: p.pages ?? null, title: p.title || '' }));
  const r = await pyRun(`${GRAFT}
out = assemble(json.loads(ARGS['spec']), ARGS['toc'], ARGS.get('at'), ARGS.get('password', ''))
save_out(out)
out.page_count`, { files, outputs: ['out.pdf'], vars: { spec: JSON.stringify(spec), toc, at: at ?? null } });
  const out = r.files['out.pdf'];
  if (!out) throw new Error('Zusammenstellen fehlgeschlagen');
  return out;
}

/** Aus einem Dokument mehrere Teile (Aufteilen, Extrahieren je Seite) in einem Durchgang */
export async function pick(bytes: Uint8Array, groups: number[][], progress?: (f: number) => void): Promise<Uint8Array[]> {
  const outputs = groups.map((_, k) => `o${k}.pdf`);
  const r = await pyRun(`${GRAFT}
groups = json.loads(ARGS['groups'])
for k, g in enumerate(groups):
    d = assemble([{'path': '/w/in.pdf', 'pages': g}], 'keep', None, ARGS.get('password', ''))
    save_out(d, 'o%d.pdf' % k)
    progress((k + 1) / len(groups))
len(groups)`, { files: { 'in.pdf': bytes }, outputs, vars: { groups: JSON.stringify(groups) }, progress: progress ? (f: number) => progress(f) : undefined });
  return outputs.map(o => { const b = r.files[o]; if (!b) throw new Error('Teil fehlt'); return b; });
}
