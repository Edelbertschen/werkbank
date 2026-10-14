// Beschädigte Dateien: beim Öffnen reparieren statt abzulehnen.
import { test, expect } from './app';

test('PDF mit kaputtem Root-Verweis wird beim Öffnen repariert und ist voll bearbeitbar', async ({ app }) => {
  await app.open('kaputt-root.pdf');
  const info = (await app.docInfo())!;
  expect(info.docs).toBe(1);
  expect(info.pages).toBe(6);
  expect(info.texts[2]).toContain('Kapitel 3');
  await expect(app.page.locator('.toast').filter({ hasText: 'beschädigt' })).toBeVisible();
  // danach funktionieren Werkzeuge wie gewohnt
  const r = await app.runTool('rotate-right');
  expect(r.ok).toBe(true);
});

test('eine Rückfrage während einer langen Arbeit (z. B. Passwort beim Öffnen) bleibt bedienbar – der Fortschrittsschleier liegt nicht darüber', async ({ app }) => {
  const answer = app.page.evaluate(async () => {
    const W = (window as any).__wb;
    return W.actions.withBusy('Wird geöffnet', async () => {
      await new Promise(r => setTimeout(r, 400)); // Schleier erscheint nach 150 ms
      return (await W.dialogs.dialog({ title: 'Passwort', buttons: [{ label: 'Öffnen', value: 'ok', primary: true }] }))?.button;
    });
  });
  await expect(app.page.locator('.dialog-veil')).toBeVisible();
  await expect(app.page.locator('.veil[aria-busy]')).toHaveCount(0);
  await app.page.locator('.buttons .btn.primary').last().click({ timeout: 5000 });
  expect(await answer).toBe('ok');
});
