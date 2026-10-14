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
