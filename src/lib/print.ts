// Drucken: Seiten als Bilder in einen Druckbereich legen und den Druckdialog des Systems öffnen
import { active, toast } from './app.svelte';
import { withBusy, flush } from './actions';
import { openPdf, renderPage, canvasBlob } from './pdf';
import { printView } from './platform';
import { dialog } from './dialogs.svelte';
import { parseRange } from './util';

import { L } from './i18n';
export async function printDoc() {
  const doc = active(); if (!doc) return;
  await flush(doc);
  const r = await dialog({
    title: L("Drucken"), icon: 'info',
    fields: [
      { key: 'range', type: 'text', label: L("Seiten"), def: '', ph: L("alle (1–{0}) oder z. B. 1-3, 5", doc.numPages) },
      { key: 'quality', type: 'seg', label: L("Qualität"), opts: [['150', 'Normal'], ['300', L("Hoch")]], def: '150' },
      { key: 'forms', type: 'check', label: L("Formularfelder und Kommentare mitdrucken"), def: true },
    ],
    buttons: [{ label: L("Abbrechen"), value: 'cancel' }, { label: L("Weiter zum Druckdialog"), value: 'ok', primary: true }],
  });
  if (!r || r.button !== 'ok') return;
  const idx = r.values.range?.trim() ? parseRange(r.values.range, doc.numPages) : [...Array(doc.numPages).keys()];
  if (!idx.length) { toast(L("Keine Seiten ausgewählt"), { kind: 'error' }); return; }
  document.getElementById('print-host')?.remove();
  document.getElementById('print-style')?.remove();
  const host = document.createElement('div');
  host.id = 'print-host';
  const urls: string[] = [];
  await withBusy(L("Druck wird vorbereitet"), async progress => {
    const pdf = await openPdf(doc.bytes);
    for (const [k, i] of idx.entries()) {
      const page = await pdf.getPage(i + 1);
      const v = page.getViewport({ scale: 1 });
      const c = await renderPage(pdf, i + 1, { scale: +r.values.quality / 72, forms: r.values.forms });
      const url = URL.createObjectURL(await canvasBlob(c, 'image/png'));
      urls.push(url); c.width = 0;
      const sheet = document.createElement('div');
      sheet.className = 'print-sheet';
      sheet.style.setProperty('--w', v.width + 'pt'); sheet.style.setProperty('--h', v.height + 'pt');
      const img = document.createElement('img'); img.src = url; sheet.append(img); host.append(sheet);
      progress((k + 1) / idx.length, L("Seite {0}", i + 1));
    }
    pdf.destroy();
    document.body.append(host);
    await Promise.all([...host.querySelectorAll('img')].map(im => (im as HTMLImageElement).decode().catch(() => {})));
  });
  // Seitengröße der ersten Seite als Druckformat vorschlagen
  const first = doc.pages[idx[0]];
  const style = document.createElement('style');
  style.id = 'print-style';
  style.textContent = `@page { size: ${first.w}pt ${first.h}pt; margin: 0; }`;
  document.head.append(style);
  // Der Druckbereich bleibt bis zum nächsten Druck oder bis "afterprint" erhalten:
  // Manche Systemdialoge lesen den Inhalt erst, wenn gedruckt wird.
  const cleanup = () => { host.remove(); style.remove(); urls.forEach(u => URL.revokeObjectURL(u)); };
  addEventListener('afterprint', () => setTimeout(cleanup, 500), { once: true });
  await printView();
}
