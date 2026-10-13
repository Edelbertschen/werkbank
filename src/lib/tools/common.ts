import type { Field, PagesValue } from '../fields';
import type { ToolCtx } from './types';
import { parseRange, baseName } from '../util';
import { app } from '../app.svelte';

import { L } from '../i18n';
/** Seitenauswahl auflösen → 0-basierte Indizes */
export function pagesOf(pv: PagesValue | undefined, ctx: ToolCtx, n = ctx.doc?.numPages || 0): number[] {
  const all = [...Array(n).keys()];
  if (!pv) return all;
  switch (pv.mode) {
    case 'cur': return [ctx.current];
    case 'sel': return ctx.selection.length ? [...ctx.selection].sort((a, b) => a - b) : [ctx.current];
    case 'odd': return all.filter(i => i % 2 === 0);
    case 'even': return all.filter(i => i % 2 === 1);
    case 'range': { const r = parseRange(pv.range, n); if (!r.length) throw new Error(L("Keine Seiten im angegebenen Bereich")); return r; }
    default: return all;
  }
}

export const PAGES = (scope: Field['scope'] = 'all', label = L("Seiten")): Field => ({ key: 'pages', type: 'pages', label, scope });
export const outName = (ctx: ToolCtx, suffix: string, ext = 'pdf') => `${baseName(ctx.doc?.name || L("Dokument"))}${suffix ? ' – ' + suffix : ''}.${ext}`;
export const author = () => app.prefs.author || '';

/** Eintrag eines Dokument-Wählers: offenes Dokument oder Datei von der Platte */
export interface DocRef { id: string; name: string; bytes?: Uint8Array; open?: boolean }
export async function refBytes(r: DocRef): Promise<Uint8Array> {
  if (r.bytes) {
    const { hasPdfHeader, anyToPdf } = await import('../convert');
    return hasPdfHeader(r.bytes) ? r.bytes : anyToPdf(r.name, r.bytes);
  }
  const d = app.docs.find(x => x.id === r.id);
  if (!d) throw new Error(L("„{0}“ ist nicht mehr geöffnet", r.name));
  return d.baked();
}

export const POSITIONS: [string, string][] = [['tl', L("Oben links")], ['tc', L("Oben Mitte")], ['tr', L("Oben rechts")], ['bl', L("Unten links")], ['bc', L("Unten Mitte")], ['br', L("Unten rechts")]];
