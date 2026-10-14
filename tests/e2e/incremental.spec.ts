// Speichern hängt Änderungen an, statt die Datei neu zu schreiben: Originalbytes bleiben, Signaturen gültig.
import { test, expect } from './app';

const W = (page: any, fn: string) => page.evaluate(`(async () => { const W = window.__wb; ${fn} })()`);

/** text.pdf selbst signieren (Zertifikat wird im Test erzeugt) und als Dokument öffnen */
async function openSigned(app: any) {
  await app.open('text.pdf');
  await W(app.page, `
    const d = W.active();
    const p12 = W.sign.createSelfSigned({ name: 'Test Signer', years: 1, password: 'geheim1' });
    const signed = await W.sign.signPdf(d.bytes, { p12, password: 'geheim1', reason: 'Test' });
    window.__signed = signed;
    await W.actions.openBytes('signiert.pdf', signed, null);`);
  await app.idle();
}
const valid = (page: any, expr: string) => W(page, `
  const b = ${expr};
  const sigs = W.sign.extractSignatures(b);
  const r = await W.sign.validateSignature(sigs[0], b);
  return { count: sigs.length, crypto: !!r.cryptoVerified, coverage: r.coverageStatus, err: r.errorMessage || '' };`);

test('Rechteck auf signiertem PDF: Original bleibt Byte für Byte, Signatur bleibt gültig', async ({ app }) => {
  test.setTimeout(180_000);
  await openSigned(app);
  const before = await valid(app.page, 'window.__signed');
  expect(before.count).toBe(1);
  expect(before, JSON.stringify(before)).toMatchObject({ crypto: true, coverage: 'full' });

  await app.runTool('zoom-page'); await app.page.waitForTimeout(400);
  const b = (await app.page.locator('.page[data-page-number="1"]').boundingBox())!;
  await app.tab('Kommentieren');
  await app.page.locator('.ribbon button[aria-label="Rechteck"]').first().click();
  await app.page.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.6); await app.page.mouse.down();
  await app.page.mouse.move(b.x + b.width * 0.8, b.y + b.height * 0.7, { steps: 6 }); await app.page.mouse.up();
  await app.page.keyboard.press('Escape'); await app.page.keyboard.press('Escape');

  const r = await W(app.page, `
    const out = await W.actions.outputBytes(W.active());
    window.__out = out;
    const s = window.__signed;
    let prefix = out.length > s.length;
    for (let i = 0; prefix && i < s.length; i++) if (out[i] !== s[i]) prefix = false;
    const p = await W.openPdf(out);
    const annots = (await (await p.getPage(1)).getAnnotations()).map(a => a.subtype);
    return { prefix, annots };`);
  expect(r.prefix).toBe(true);
  expect(r.annots).toContain('Square');
  const after = await valid(app.page, 'window.__out');
  // wie Acrobat: Signatur gültig, das Dokument wurde danach ergänzt (angehängte Kommentare)
  expect(after).toMatchObject({ count: 1, crypto: true, coverage: 'partial' });
});

test('Seite drehen auf signiertem PDF: vor dem Speichern kommt der Hinweis, dass die Signatur ungültig wird', async ({ app }) => {
  test.setTimeout(180_000);
  await openSigned(app);
  await app.runTool('rotate-right');
  const asked = W(app.page, `return await W.actions.confirmSignedSave(W.active());`);
  const dlg = app.page.locator('.dialog');
  await expect(dlg).toContainText('signiert');
  await dlg.getByRole('button', { name: 'Abbrechen' }).click();
  expect(await asked).toBe(false);
});

test('Ohne Änderungen am Grunddokument bleibt auch ein normales PDF unverändert vorne erhalten', async ({ app }) => {
  await app.open('formular.pdf');
  await W(app.page, `window.__orig = W.active().bytes;`);
  // Text hinzufügen (Inhalt, nicht Anmerkung) – auch das wird angehängt
  await app.runTool('zoom-page'); await app.page.waitForTimeout(400);
  const b = (await app.page.locator('.page[data-page-number="1"]').boundingBox())!;
  await app.tab('Bearbeiten');
  await app.page.locator('.ribbon button[aria-label="Text hinzufügen"]').first().click();
  await app.page.mouse.click(b.x + b.width * 0.2, b.y + b.height * 0.85);
  await app.page.keyboard.type('Angehängt');
  await app.page.keyboard.press('Escape');
  await expect.poll(() => W(app.page, 'return W.active().history.length')).toBe(2);
  const r = await W(app.page, `
    const out = await W.actions.outputBytes(W.active());
    const s = window.__orig;
    let prefix = out.length > s.length;
    for (let i = 0; prefix && i < s.length; i++) if (out[i] !== s[i]) prefix = false;
    const p = await W.openPdf(out);
    const t = (await (await p.getPage(1)).getTextContent()).items.map(i => i.str).join(' ');
    return { prefix, has: t.includes('Angehängt') };`);
  expect(r).toEqual({ prefix: true, has: true });
});
