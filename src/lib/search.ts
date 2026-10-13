// Befehlssuche: versteht Alltagssprache („kleiner machen“), Umlaut-Schreibweisen und kleine Tippfehler.
import { TOOLS } from './tools';
import { RIBBON } from './ribbon';
import type { Tool } from './tools/types';

const STOP = new Set(['wie', 'kann', 'ich', 'will', 'mochte', 'die', 'der', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem', 'und', 'oder',
  'mit', 'als', 'zu', 'zum', 'zur', 'in', 'im', 'ins', 'auf', 'aus', 'von', 'fur', 'mein', 'meine', 'meinen', 'pdf', 'pdfs', 'datei', 'dateien',
  'dokument', 'dokumente', 'machen', 'mache', 'bitte', 'hier', 'alle', 'etwas', 'was', 'wo', 'man', 'eine', 'es', 'sie', 'neu', 'neue', 'neues',
  // Englisch
  'how', 'can', 'want', 'would', 'like', 'the', 'an', 'and', 'or', 'with', 'as', 'to', 'into', 'on', 'from', 'of', 'for', 'my', 'file', 'files',
  'document', 'documents', 'make', 'please', 'all', 'some', 'what', 'where', 'it', 'this', 'new', 'do']);

// Häufigste Befehle zuerst, wenn noch nichts eingegeben ist
const POPULAR = ['open', 'save', 'merge', 'compress', 'to-word', 'ocr', 'sign', 'redact', 'protect', 'rotate-right', 'delete-pages', 'split', 'page-numbers', 'organize', 'find', 'text-edit', 'to-pdfa', 'create-office'];

export const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u');
const tokens = (s: string) => norm(s).split(/[^a-z0-9]+/).filter(t => t.length > 1);

function near(a: string, b: string) {
  // Höchstens ein Tippfehler (Einfügen, Löschen, Vertauschen, Ersetzen)
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else if (a[i + 1] === b[j] && a[i] === b[j + 1]) { i += 2; j += 2; }
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/** Wie gut passt das Suchwort zu einem Wort aus Name/Stichworten? 0 = gar nicht, 1 = genau */
function strength(w: string, t: string): number {
  if (t === w) return 1;
  if (t.startsWith(w)) return w.length >= 3 ? 0.9 : 0.5;
  if (w.length >= 5) {
    let k = 0; while (k < w.length && k < t.length && w[k] === t[k]) k++;
    if (k >= 5 && k >= 0.7 * Math.min(w.length, t.length) && k < t.length) return 0.7; // gemeinsamer Stamm: zusammenfügen ~ zusammenführen
    if (t.includes(w.slice(0, Math.max(5, w.length - 2)))) return 0.6; // Wortteil: erkennen ~ texterkennung
    if (near(w, t) || near(w, t.slice(0, w.length + 1)) || near(w, t.slice(0, w.length))) return 0.6; // Tippfehler
  }
  if (w.length >= 4 && t.length >= 4 && w.startsWith(t)) return 0.25; // Teil eines zusammengesetzten Worts
  return 0;
}
const best = (w: string, ts: string[]) => ts.reduce((m, t) => Math.max(m, strength(w, t)), 0);
interface Indexed { t: Tool; label: string[]; short: string[]; keys: string[]; desc: string[] }
let index: Indexed[] | null = null;
function build(): Indexed[] {
  const tabOf = new Map<string, string>();
  for (const tab of RIBBON) for (const g of tab.groups) for (const it of g.items) {
    const id = typeof it === 'string' ? it : 'id' in it ? it.id : '';
    if (id && !tabOf.has(id)) tabOf.set(id, `${tab.label} ${g.label}`);
  }
  return TOOLS.filter(t => t.id !== 'palette').map(t => ({
    t, label: tokens(t.label), short: tokens(t.short || ''), keys: tokens(`${t.keys || ''} ${t.id.replace(/-/g, ' ')}`), desc: tokens(`${t.desc || ''} ${tabOf.get(t.id) || ''}`),
  }));
}

export function searchTools(q: string, opts: { hasDoc?: boolean } = {}): Tool[] {
  index ??= build();
  const words = tokens(q).filter(w => !STOP.has(w));
  if (!words.length) {
    if (q.trim() && !tokens(q).length) return [];
    const rank = (t: Tool) => { const i = POPULAR.indexOf(t.id); return i < 0 ? 999 : i; };
    return index.map(x => x.t).sort((a, b) => rank(a) - rank(b));
  }
  const scored = index.map(x => {
    let score = 0, hits = 0;
    for (const w of words) {
      const s = Math.max(8 * best(w, x.label), 5 * best(w, x.short), 3 * best(w, x.keys), 1 * best(w, x.desc));
      if (s >= 0.9) { hits++; score += s; }
    }
    return { t: x.t, score, hits };
  });
  // Erst alle Suchwörter verlangen; findet das nichts, genügt die Mehrheit
  let list = scored.filter(x => x.hits === words.length);
  if (!list.length && words.length > 1) list = scored.filter(x => x.hits >= Math.ceil(words.length / 2) && x.score >= 3);
  const bonus = (t: Tool) => (t.noDoc || opts.hasDoc ? 0.5 : 0) + (POPULAR.includes(t.id) ? 0.3 : 0);
  return list.sort((a, b) => b.score + bonus(b.t) - (a.score + bonus(a.t))).map(x => x.t);
}
