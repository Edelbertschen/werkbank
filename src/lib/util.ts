// Kleine Helfer ohne Abhängigkeiten
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const MM = 72 / 25.4;
export const mm = (pt: number) => Math.round(pt / MM);

// Endung = 1–5 Zeichen mit mindestens einem Buchstaben („Version 1.2“ hat keine Endung)
const EXT = /\.((?=[a-z0-9]*[a-z])[a-z0-9]{1,5})$/i;
export const baseName = (n: string) => String(n || 'Dokument').replace(EXT, '');
export const extOf = (n: string) => (String(n).match(EXT)?.[1] || '').toLowerCase();
export const withExt = (n: string, ext: string) => baseName(n) + '.' + ext;

export function fmtSize(b: number) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toLocaleString('de-DE', { maximumFractionDigits: 0 }) + ' KB';
  return (b / 1048576).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' MB';
}
export function fmtAgo(t: number) {
  const s = (Date.now() - t) / 1000;
  if (s < 50) return 'gerade eben';
  if (s < 3600) return `vor ${Math.round(s / 60)} Min.`;
  if (s < 86400) return `vor ${Math.round(s / 3600)} Std.`;
  if (s < 172800) return 'gestern';
  return new Date(t).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });
}
export const fmtNum = (n: number, d = 0) => n.toLocaleString('de-DE', { maximumFractionDigits: d, minimumFractionDigits: d });

export const PAPER: [string, number, number][] = [['A3', 297, 420], ['A4', 210, 297], ['A5', 148, 210], ['A6', 105, 148], ['Letter', 215.9, 279.4], ['Legal', 215.9, 355.6], ['B5', 176, 250], ['Tabloid', 279.4, 431.8]];
export function paperName(wPt: number, hPt: number) {
  const w = wPt / MM, h = hPt / MM, a = Math.min(w, h), b = Math.max(w, h);
  const p = PAPER.find(([, x, y]) => Math.abs(a - x) < 2.5 && Math.abs(b - y) < 2.5);
  return p ? p[0] + (w > h ? ' quer' : '') : '';
}

/** "1-3, 5, 8-" -> 0-basierte, sortierte Indizes */
export function parseRange(str: string, n: number): number[] {
  const out = new Set<number>();
  const missing = (k: number) => new Error(`Seite ${k} gibt es nicht – das Dokument hat ${n} Seite${n === 1 ? '' : 'n'}`);
  // „letzte“ als Seitenzahl; Leerzeichen um Bindestriche gehören zum Bereich („1 - 3“)
  const norm = String(str).replace(/\bletzte\b/gi, String(n)).replace(/\s*([-–])\s*/g, '$1');
  for (const part of norm.split(/[,;\s]+/).filter(Boolean)) {
    const m = part.match(/^(\d*)[-–](\d*)$/);
    if (m) {
      const a = m[1] ? +m[1] : 1, b = m[2] ? +m[2] : n;
      const lo = Math.min(a, b), hi = Math.max(a, b);
      if (lo > n || hi < 1) throw missing(lo > n ? lo : hi);
      for (let k = Math.max(1, lo); k <= Math.min(n, hi); k++) out.add(k - 1);
    } else if (/^\d+$/.test(part)) {
      const k = +part;
      if (k < 1 || k > n) throw missing(k);
      out.add(k - 1);
    } else if (/^ungerade$/i.test(part)) for (let k = 0; k < n; k += 2) out.add(k);
    else if (/^gerade$/i.test(part)) for (let k = 1; k < n; k += 2) out.add(k);
    else throw new Error(`„${part}“ ist keine gültige Seitenangabe`);
  }
  return [...out].sort((a, b) => a - b);
}
export function rangeLabel(idx: number[]) {
  if (!idx.length) return '';
  const s = [...idx].sort((a, b) => a - b), out: string[] = [];
  let a = s[0], p = a;
  for (const k of [...s.slice(1), Infinity]) { if (k === p + 1) { p = k; continue; } out.push(a === p ? `${a + 1}` : `${a + 1}–${p + 1}`); a = p = k; }
  return out.join(', ');
}

export const toBlob = (d: Uint8Array | Blob, type = 'application/octet-stream') => d instanceof Blob ? d : new Blob([d as BlobPart], { type });
export async function toBytes(d: Uint8Array | Blob | ArrayBuffer): Promise<Uint8Array> {
  if (d instanceof Uint8Array) return d;
  if (d instanceof ArrayBuffer) return new Uint8Array(d);
  return new Uint8Array(await d.arrayBuffer());
}
export function dataUrlToBytes(u: string) { const b = atob(u.split(',')[1]); const a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }
export function bytesToDataUrl(b: Uint8Array, mime: string) {
  let s = ''; const CH = 0x8000;
  for (let i = 0; i < b.length; i += CH) s += String.fromCharCode(...b.subarray(i, i + CH));
  return `data:${mime};base64,${btoa(s)}`;
}
export function hexToRgb01(hex: string): [number, number, number] {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
export const isPdf = (b: Uint8Array) => b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;
