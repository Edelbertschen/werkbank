// Formatierter Text aus dem Editor (contenteditable): bereinigen und für den PDF-Satz vorbereiten.
// Erlaubt sind Fett, Kursiv, Unterstrichen, Zeilen, Farbe, Größe (in em relativ zum Block) und Schrift.
import { realNames } from './sysfonts';

export const BUILTIN = ['Helvetica', 'Times', 'Courier'] as const;
export const BUILTIN_STACK: Record<string, string> = {
  Helvetica: "Helvetica, Arial, 'Liberation Sans', 'Nimbus Sans', sans-serif",
  Times: "'Times New Roman', Times, 'Liberation Serif', 'Nimbus Roman', serif",
  Courier: "'Courier New', Courier, 'Liberation Mono', 'Nimbus Mono PS', monospace",
};

/** CSS-Schriftangabe (Vorschau) → Name, unter dem die Schrift ins PDF kommt */
export function familyOf(css: string): string {
  const first = (css.split(',')[0] || '').trim().replace(/^["']|["']$/g, '');
  if (first.startsWith('wb-sys-')) return realNames.get(first) || 'Helvetica';
  if (first === 'wb-orig') return '__orig__';
  if (/times|serif$|roman/i.test(first) && !/sans/i.test(first)) return 'Times';
  if (/courier|mono/i.test(first)) return 'Courier';
  if (/helvetica|arial|sans-serif/i.test(first)) return 'Helvetica';
  return first || 'Helvetica';
}

export function escapeHtml(t: string) {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
}

const KEEP_STYLE = ['color', 'font-size', 'font-family', 'font-weight', 'font-style', 'text-decoration', 'text-decoration-line'];

/** Nur erlaubte Auszeichnungen behalten; Fremdes wird zu reinem Text. `forPdf`: Schriften auf echte Namen abbilden. */
export function cleanHtml(html: string, forPdf = false): { html: string; families: Set<string> } {
  const families = new Set<string>();
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const out = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return escapeHtml((node.textContent || '').normalize('NFC'));
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const el = node as HTMLElement;
    const inner = [...el.childNodes].map(out).join('');
    const tag = el.tagName.toLowerCase();
    if (tag === 'br') return '<br>';
    const styles: string[] = [];
    for (const p of KEEP_STYLE) {
      let v = el.style.getPropertyValue(p);
      if (!v) continue;
      if (p === 'font-size' && !/^[\d.]+em$/.test(v)) continue; // nur relative Größen (Block-Größe gilt sonst)
      if (p === 'font-family') { const f = familyOf(v); families.add(f); v = forPdf ? `"${f}"` : v; }
      if (p === 'font-weight') v = /bold|[6-9]00/.test(v) ? 'bold' : 'normal';
      styles.push(`${p}:${v.replace(/"/g, "'")}`);
    }
    if (tag === 'font') { const c = el.getAttribute('color'); if (c) styles.push(`color:${c}`); const f = el.getAttribute('face'); if (f) { const n = familyOf(f); families.add(n); styles.push(`font-family:${forPdf ? `"${n}"` : f}`); } }
    const st = styles.length ? ` style="${styles.join(';').replace(/"/g, "'")}"` : '';
    if (tag === 'b' || tag === 'strong') return `<b${st}>${inner}</b>`;
    if (tag === 'i' || tag === 'em') return `<i${st}>${inner}</i>`;
    if (tag === 'u') return `<u${st}>${inner}</u>`;
    if (tag === 'div' || tag === 'p') return `<div${st}>${inner || '<br>'}</div>`;
    return st ? `<span${st}>${inner}</span>` : inner;
  };
  const root = doc.body.firstChild as HTMLElement;
  return { html: [...root.childNodes].map(out).join(''), families };
}

/** Steckt im HTML mehr als reiner Text (Auszeichnung)? */
export function hasMarkup(html: string) { return /<(b|i|u|span|font)[\s>]/i.test(html); }
