// Brücke zwischen Bedienelementen und Werkzeugen
import { app, active, toast, dismissToast, savePrefs } from './app.svelte';
import { tool } from './tools';
import { warmFor } from './engines';
import { runTool } from './actions';
import { dialog } from './dialogs.svelte';
import type { EditMode } from './app.svelte';
import { viewer } from './viewer.svelte';
import SignaturePad from '../components/dialogs/SignaturePad.svelte';
import StampPicker from '../components/dialogs/StampPicker.svelte';
import { pickFiles } from './platform';
import { bytesToDataUrl } from './util';

import { L } from './i18n';
let nonce = 0;

/** Werkzeug über Bandleiste, Palette oder Kürzel auslösen */
export async function openTool(id: string) {
  const t = tool(id);
  if (t.disabled?.()) return;
  if (!t.noDoc && !active()) { toast(L("Öffne zuerst ein Dokument")); return; }
  if (t.mode) { if (t.mode !== 'select' && t.mode !== 'hand') app.pane = null; await setMode(app.mode === t.mode ? 'select' : t.mode); return; }
  if (t.direct) { await runTool(t); return; }
  app.pane = { tool: id, nonce: ++nonce };
  if (t.engine) warmFor(t.engine, app.prefs.ocrLangs);
}

const PLACE_MODES: EditMode[] = ['sign', 'stamp', 'image'];

let hintToast = 0;
export async function setMode(m: EditMode) {
  if (m !== 'select' && m !== 'hand') {
    if (viewer.inst?.pagesRotation) { toast(L("Bitte zuerst die Ansichtsdrehung zurücksetzen (Ansicht › Ansicht drehen).")); return; }
    app.organize = false;
  }
  if (PLACE_MODES.includes(m)) {
    const src = await pickPlacement(m as 'sign' | 'stamp' | 'image');
    if (!src) return;
    app.placing = src;
  } else app.placing = null;
  app.mode = m;
  if (hintToast) { dismissToast(hintToast); hintToast = 0; }
  if (m !== 'select' && m !== 'hand' && !m.startsWith('pdfjs:') && MODE_HINT[m]) hintToast = toast(MODE_HINT[m]!, { ms: 3500 });
}

export const MODE_HINT: Partial<Record<EditMode, string>> = {
  'text:edit': L("Auf eine Textzeile klicken, um sie zu ändern."),
  move: L("Element anklicken und ziehen. Pfeiltasten schieben fein, Entf löscht, Doppelklick bearbeitet eigenen Text."),
  'text:add': L("Auf die Seite klicken und schreiben."),
  image: L("Auf die Seite klicken, um das Bild zu platzieren."),
  sign: L("Auf die Seite klicken, um die Unterschrift zu platzieren."),
  stamp: L("Auf die Seite klicken, um den Stempel zu setzen."),
  redact: L("Bereiche aufziehen, die geschwärzt werden sollen."),
  whiteout: L("Bereich aufziehen, der weiß abgedeckt wird."),
  link: L("Bereich für den Link aufziehen."),
  note: L("Klicken, um eine Notiz anzuheften."),
  'shape:rect': L("Rechteck aufziehen."), 'shape:ellipse': L("Ellipse aufziehen – mit Umschalt ein Kreis."), 'shape:line': L("Linie ziehen."), 'shape:arrow': L("Pfeil ziehen."),
  'markup:underline': L("Text auswählen, um ihn zu unterstreichen."), 'markup:strike': L("Text auswählen, um ihn durchzustreichen."),
  'field:text': L("Textfeld aufziehen."), 'field:check': L("Kontrollkästchen aufziehen."), 'field:radio': L("Optionsfeld aufziehen."), 'field:choice': L("Auswahlliste aufziehen."), 'field:signature': L("Unterschriftsfeld aufziehen."),
};

async function pickPlacement(kind: 'sign' | 'stamp' | 'image') {
  if (kind === 'image') {
    const [f] = await pickFiles({ filters: [{ name: L("Bilder"), extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'heic'] }], title: L("Bild einfügen") });
    if (!f) return null;
    const { imagesToPdf } = await import('./convert');
    // Bild normalisieren (Drehung aus EXIF, HEIC …) über einen Canvas
    void imagesToPdf;
    const url = await normalizeImage(f.bytes, f.name);
    return { ...url, width: 0.35, kind } as const;
  }
  const r = await dialog({ title: kind === 'sign' ? L("Unterschrift") : L("Stempel"), component: kind === 'sign' ? SignaturePad : StampPicker, width: kind === 'sign' ? 560 : 520 });
  if (!r || r.button !== 'ok' || !r.values.src) return null;
  if (kind === 'sign' && r.values.keep) {
    app.prefs.signatures = [r.values.src, ...app.prefs.signatures.filter(s => s !== r.values.src)].slice(0, 8);
    savePrefs();
  }
  return { src: r.values.src as string, ratio: r.values.ratio as number, width: kind === 'sign' ? 0.26 : 0.24, kind } as const;
}

async function normalizeImage(bytes: Uint8Array, name: string): Promise<{ src: string; ratio: number }> {
  let blob = new Blob([bytes as BlobPart]);
  if (/\.(heic|heif)$/i.test(name)) { const h = (await import('heic2any')).default as any; const r = await h({ blob, toType: 'image/jpeg', quality: 0.92 }); blob = Array.isArray(r) ? r[0] : r; }
  if (/\.svg$/i.test(name)) blob = new Blob([bytes as BlobPart], { type: 'image/svg+xml' });
  let bmp: any;
  try { bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' } as any); }
  catch { const u = URL.createObjectURL(blob); bmp = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = u; }); }
  const max = 2400, s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  const png = /\.(png|svg|gif|webp)$/i.test(name);
  const out: Blob = await new Promise(r => c.toBlob(b => r(b!), png ? 'image/png' : 'image/jpeg', 0.92));
  return { src: bytesToDataUrl(new Uint8Array(await out.arrayBuffer()), png ? 'image/png' : 'image/jpeg'), ratio: c.height / c.width };
}
