// Erkennt Zeilen und Absätze in der Textebene einer Seite – Grundlage für „Text bearbeiten“.
// Reine Logik auf Rechtecken (Bildschirmkoordinaten), damit sie unabhängig von der Darstellung testbar ist.

export interface Box { text: string; left: number; top: number; right: number; bottom: number }
export interface Line extends Box { parts: Box[]; height: number }
export interface Paragraph { lines: Line[]; box: Box; lineHeight: number }

const mid = (b: Box) => (b.top + b.bottom) / 2;

/** Textstücke zu Zeilen bündeln: gleiche Grundlinie, kein großer horizontaler Abstand */
export function groupLines(boxes: Box[]): Line[] {
  const sorted = boxes.filter(b => b.right - b.left > 0 && b.text.trim()).sort((a, b) => mid(a) - mid(b) || a.left - b.left);
  const lines: Line[] = [];
  for (const b of sorted) {
    const h = b.bottom - b.top;
    const line = lines.find(l => Math.abs(mid(l) - mid(b)) < Math.min(l.height, h) * 0.45 && b.left - l.right < Math.max(l.height, h) * 1.6 && l.left - b.right < Math.max(l.height, h) * 1.6);
    if (line) {
      line.parts.push(b);
      line.parts.sort((x, y) => x.left - y.left);
      line.left = Math.min(line.left, b.left); line.right = Math.max(line.right, b.right);
      line.top = Math.min(line.top, b.top); line.bottom = Math.max(line.bottom, b.bottom);
      line.height = line.bottom - line.top;
      line.text = joinParts(line.parts);
    } else {
      lines.push({ ...b, parts: [b], height: h, text: b.text.trim() });
    }
  }
  return lines.sort((a, b) => a.top - b.top || a.left - b.left);
}

function joinParts(parts: Box[]) {
  let s = '';
  parts.forEach((p, i) => {
    const gap = i ? p.left - parts[i - 1].right : 0;
    const t = p.text;
    if (i && !s.endsWith(' ') && !t.startsWith(' ') && gap > (p.bottom - p.top) * 0.15) s += ' ';
    s += t;
  });
  return s.replace(/\s+/g, ' ').trim();
}

/** Absatz um die Zeile i: gleiche Schrifthöhe, gleicher linker Rand (Einzug erlaubt), enger Zeilenabstand */
export function paragraphAt(lines: Line[], i: number): Paragraph {
  const base = lines[i];
  const similar = (a: Line, b: Line) => Math.abs(a.height - b.height) <= Math.max(a.height, b.height) * 0.2;
  const aligned = (a: Line, b: Line) => Math.abs(a.left - b.left) <= Math.max(a.height, b.height) * 2.5 && a.left < b.right && b.left < a.right;
  const close = (upper: Line, lower: Line) => lower.top - upper.bottom >= -upper.height * 0.3 && lower.top - upper.bottom <= upper.height * 0.9;
  const below = (l: Line) => lines.filter(x => x !== l && x.top > l.top + l.height * 0.5 && aligned(l, x) && similar(l, x)).sort((a, b) => a.top - b.top)[0];
  const above = (l: Line) => lines.filter(x => x !== l && x.top < l.top - l.height * 0.5 && aligned(l, x) && similar(l, x)).sort((a, b) => b.top - a.top)[0];
  const out = [base];
  for (let cur = base, nx = below(cur); nx && close(cur, nx); cur = nx, nx = below(cur)) out.push(nx);
  for (let cur = base, pv = above(cur); pv && close(pv, cur); cur = pv, pv = above(cur)) out.unshift(pv);
  const box: Box = {
    text: joinLines(out.map(l => l.text)),
    left: Math.min(...out.map(l => l.left)), right: Math.max(...out.map(l => l.right)),
    top: Math.min(...out.map(l => l.top)), bottom: Math.max(...out.map(l => l.bottom)),
  };
  const lineHeight = out.length > 1 ? (out[out.length - 1].top - out[0].top) / (out.length - 1) : base.height;
  return { lines: out, box, lineHeight };
}

/** Zeilen zu Fließtext: Bindestrich am Ende bleibt bei Großschreibung/Zusammensetzung, sonst Silbentrennung entfernen */
export function joinLines(lines: string[]): string {
  let s = '';
  for (const raw of lines) {
    const l = raw.trim();
    if (!s) { s = l; continue; }
    if (/[A-Za-zÄÖÜäöüß]-$/.test(s)) s = /^[a-zäöüß]/.test(l) ? s.slice(0, -1) + l : s + l;
    else s += ' ' + l;
  }
  return s;
}

// ---------------------------------------------------------------------------
// Schriftart erkennen – dieselben Regeln wie beim Schreiben ins PDF (overlay.svelte.ts, font_style)
// ---------------------------------------------------------------------------
export type FontFamily = 'sans' | 'serif' | 'mono';
export interface FontStyle { family: FontFamily; bold: boolean; italic: boolean }
const SERIF = ['times', 'serif', 'roman', 'georgia', 'garamond', 'cambria', 'minion', 'palatino', 'antiqua', 'baskerville', 'bodoni', 'century', 'caslon', 'tiro', 'nimbusrom'];
const MONO = ['courier', 'mono', 'consol', 'menlo', 'code', 'fixed', 'typewriter', 'nimbusmon'];
const BOLD = ['bold', 'black', 'heavy', 'semibold', 'demi', 'extrab'];

/** Familie und Schnitt aus dem Schriftnamen; Angaben des Renderers (pdf.js) haben Vorrang */
export function classifyFont(name: string, hint: { bold?: boolean; italic?: boolean; serif?: boolean; mono?: boolean } = {}): FontStyle {
  const low = (name.split('+').pop() || '').toLowerCase().replace(/[\s-]/g, '');
  const family: FontFamily = hint.mono || MONO.some(w => low.includes(w)) ? 'mono'
    : hint.serif ? 'serif' : low.includes('sans') ? 'sans' : SERIF.some(w => low.includes(w)) ? 'serif' : 'sans';
  return { family, bold: !!hint.bold || BOLD.some(w => low.includes(w)), italic: !!hint.italic || low.includes('italic') || low.includes('oblique') };
}

/** CSS-Schriftstapel für die Vorschau beim Bearbeiten (metrisch passend zu den eingebetteten Ersatzschriften) */
export const FONT_STACK: Record<FontFamily, string> = {
  sans: "Helvetica, Arial, 'Liberation Sans', 'Nimbus Sans', sans-serif",
  serif: "'Times New Roman', Times, 'Liberation Serif', 'Nimbus Roman', serif",
  mono: "'Courier New', Courier, 'Liberation Mono', 'Nimbus Mono PS', monospace",
};
