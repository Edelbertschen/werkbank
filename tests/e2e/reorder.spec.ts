// Seiten per Ziehen umordnen – in der Seitenleiste und in „Organisieren“.
// Das Ziehen darf keine native Drag-Sitzung starten: Die Desktop-Hülle hält jede
// native Sitzung für „Datei von außen“ und zeigt dann nur das Drop-Ziel.
import { test, expect } from './app';

const firstWords = (texts: string[]) => texts.map(t => t.match(/Kapitel \d/)?.[0]);

async function drag(app: any, from: any, to: any) {
  const page = app.page;
  const a = (await from.boundingBox())!, b = (await to.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2 + 8, { steps: 4 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height * 0.8, { steps: 16 });
  // Während des Ziehens: Ersatzbild statt nativer Sitzung, kein Drop-Ziel
  await expect(page.locator('.sortable-fallback')).toHaveCount(1);
  await expect(page.locator('.drop-veil')).toHaveCount(0);
  await page.mouse.up();
  await app.idle();
}

test('Seitenleiste: Seite 1 hinter Seite 3 ziehen', async ({ app }) => {
  await app.open('outline.pdf');
  const items = app.page.locator('.thumbs .item');
  await expect(items).toHaveCount(5);
  await drag(app, items.nth(0), items.nth(2));
  const info = (await app.docInfo())!;
  expect(firstWords(info.texts)).toEqual(['Kapitel 2', 'Kapitel 3', 'Kapitel 1', 'Kapitel 4', 'Kapitel 5']);
  expect(info.history.at(-1)).toBe('Seiten umsortiert');
});

test('Organisieren: Seite 4 an den Anfang ziehen', async ({ app }) => {
  await app.open('outline.pdf');
  await app.page.keyboard.press('Control+Shift+o');
  const cells = app.page.locator('.org .cell');
  await expect(cells).toHaveCount(5);
  const a = (await cells.nth(3).boundingBox())!, b = (await cells.nth(0).boundingBox())!;
  const page = app.page;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 8, a.y + a.height / 2, { steps: 4 });
  await page.mouse.move(b.x + b.width * 0.2, b.y + b.height / 2, { steps: 16 });
  await expect(page.locator('.sortable-fallback')).toHaveCount(1);
  await expect(page.locator('.drop-veil')).toHaveCount(0);
  await page.mouse.up();
  await app.idle();
  const info = (await app.docInfo())!;
  expect(firstWords(info.texts)).toEqual(['Kapitel 4', 'Kapitel 1', 'Kapitel 2', 'Kapitel 3', 'Kapitel 5']);
});
