// Schwierige PDFs aus dem Alltag: öffnen, bearbeiten, umwandeln, speichern.
import { test, expect } from './app';

test('verschlüsseltes PDF: Passwort, Bearbeiten, Speichern mit gleichem Schutz', async ({ app }) => {
  await app.openBytes('encrypted.pdf', 'geheim');
  let info = await app.docInfo();
  expect(info!.pages).toBe(2);
  expect(info!.protected).toBe(true);
  expect((await app.runTool('page-numbers')).ok).toBe(true);
  const dl = app.page.waitForEvent('download');
  await app.page.keyboard.press('Control+s');
  const file = await (await dl).path();
  const head = (await import('node:fs')).readFileSync(file!).toString('latin1');
  expect(head).toMatch(/\/Encrypt/);
});

test('nur rechtebeschränktes PDF öffnet ohne Passwort und lässt sich bearbeiten', async ({ app }) => {
  await app.openBytes('restricted.pdf');
  expect((await app.docInfo())!.pages).toBe(2);
  const r = await app.runTool('page-numbers');
  expect(r.ok, r.toasts.join()).toBe(true);
});

test('beschädigtes PDF öffnet und lässt sich reparieren', async ({ app }) => {
  await app.open('damaged.pdf');
  expect((await app.docInfo())!.pages).toBe(6);
  expect((await app.runTool('repair')).ok).toBe(true);
});

test('Scan: Texterkennung macht ihn durchsuchbar', async ({ app }) => {
  await app.open('scan.pdf');
  expect((await app.docInfo())!.texts.join('').trim()).toBe('');
  const r = await app.runTool('ocr', { langs: ['deu'], dpi: '200', skip: true, deskew: false, pages: { mode: 'all', range: '' } });
  expect(r.ok, r.toasts.join()).toBe(true);
  expect((await app.docInfo())!.texts[0]).toMatch(/Kapitel/);
});

test('Formular: Felder exportieren und abflachen', async ({ app }) => {
  await app.open('form.pdf');
  const stop = app.dismissDialogs();
  const exp = await app.runTool('form-export');
  expect(exp.ok, exp.toasts.join()).toBe(true);
  const flat = await app.runTool('form-flatten');
  expect(flat.ok, flat.toasts.join()).toBe(true);
  stop();
});

test('vorhandene Anmerkungen: auflisten und einbrennen', async ({ app }) => {
  await app.open('annotated.pdf');
  await app.ribbon('Kommentare');
  const r = await app.runTool('flatten-annots');
  expect(r.ok, r.toasts.join()).toBe(true);
});

test('Suchen und Schwärzen entfernt E-Mail-Adressen und IBANs wirklich', async ({ app }) => {
  await app.open('text.pdf');
  const r = await app.runTool('find-redact', { terms: '', presets: ['email', 'iban'], pages: { mode: 'all', range: '' } });
  expect(r.ok, r.toasts.join()).toBe(true);
  const t = (await app.docInfo())!.texts.join(' ');
  expect(t).not.toMatch(/mustermann@example\.com/);
  expect(t).not.toMatch(/DE89 3704/);
  expect(t).toMatch(/Werkbank ist eine PDF-Anwendung/);
});

test('versetzte Seitenbox: OCR-freie Werkzeuge und PDF/A', async ({ app }) => {
  await app.open('offset-box.pdf');
  for (const id of ['compress', 'grayscale', 'to-pdfa']) {
    const r = await app.runTool(id);
    expect(r.ok, `${id}: ${r.toasts.join()}`).toBe(true);
  }
});

test('Word-Export enthält Text mit Umlauten und Sonderzeichen', async ({ app }) => {
  await app.open('unicode.pdf');
  const dl = app.page.waitForEvent('download');
  expect((await app.runTool('to-word')).ok).toBe(true);
  const file = await (await dl).path();
  const JSZip = (await import('jszip')).default;
  const xml = await (await JSZip.loadAsync((await import('node:fs')).readFileSync(file!))).file('word/document.xml')!.async('string');
  expect(xml).toMatch(/Łódź/);
  expect(xml).toMatch(/Grüße/);
});

test('120 Seiten: Miniaturen und Organisieren bleiben flüssig', async ({ app }) => {
  await app.open('long.pdf');
  const t0 = Date.now();
  await app.page.keyboard.press('Control+Shift+o');
  await expect(app.page.locator('.org')).toBeVisible();
  expect(Date.now() - t0).toBeLessThan(5000);
  await app.page.keyboard.press('Escape');
});
