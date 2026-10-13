// Installierte Schriften, die zur Schrift im PDF passen – zwischengespeichert je Name und Schnitt
import { findSystemFont, listSystemFonts } from './platform';

const bytes = new Map<string, Promise<Uint8Array | null>>();
const faces = new Map<string, Promise<string | null>>();
const key = (name: string, bold: boolean, italic: boolean) => `${name.replace(/^[A-Z]{6}\+/, '')}|${+bold}|${+italic}`;

export function systemFont(name: string, bold = false, italic = false): Promise<Uint8Array | null> {
  const k = key(name, bold, italic);
  if (!bytes.has(k)) bytes.set(k, findSystemFont(name, bold, italic).catch(() => null));
  return bytes.get(k)!;
}

/** CSS-Familienname der installierten Schrift für die Vorschau beim Bearbeiten, sonst null */
export function previewFamily(name: string, bold = false, italic = false): Promise<string | null> {
  const k = key(name, bold, italic);
  if (!faces.has(k)) faces.set(k, (async () => {
    const b = await systemFont(name, bold, italic);
    if (!b) return null;
    const fam = 'wb-sys-' + faces.size;
    realNames.set(fam, name.replace(/^[A-Z]{6}\+/, ''));
    const ff = new FontFace(fam, b.slice().buffer);
    await ff.load();
    document.fonts.add(ff);
    return fam;
  })().catch(() => null));
  return faces.get(k)!;
}

/** CSS-Name der Vorschauschrift → Name der installierten Schrift (für das Schreiben ins PDF) */
export const realNames = new Map<string, string>();

let families: Promise<string[]> | null = null;
/** Installierte Schriftfamilien für die Schriftwahl */
export function systemFamilies(): Promise<string[]> {
  return (families ??= listSystemFonts().catch(() => []));
}
