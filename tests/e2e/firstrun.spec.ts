// Erster Start und leere Zustände: kurz erklären, was geht, und danach nicht mehr stören.
import { test, expect } from './app';

test('Einführung beim ersten Start; einmal geschlossen, bleibt sie weg', async ({ app }) => {
  const intro = app.page.locator('.intro');
  await expect(intro).toBeVisible();
  await expect(intro.getByRole('heading', { name: 'Willkommen in der Werkbank' })).toBeVisible();
  // drei kurze Punkte, keine Tour
  await expect(intro.locator('li')).toHaveCount(3);
  await intro.getByRole('button', { name: 'Verstanden' }).click();
  await expect(intro).toHaveCount(0);
  await app.page.waitForTimeout(400);
  await app.page.reload();
  await app.page.waitForFunction(() => (window as any).__wb);
  await expect(app.page.getByText('Datei hierher ziehen')).toBeVisible();
  await expect(app.page.locator('.intro')).toHaveCount(0);
});

test('Einführung lässt sich in den Einstellungen wieder zeigen', async ({ app }) => {
  await app.page.locator('.intro').getByRole('button', { name: 'Verstanden' }).click();
  await app.page.getByRole('button', { name: 'Einstellungen' }).click();
  await app.page.getByRole('button', { name: 'Einführung erneut zeigen' }).click();
  await expect(app.page.locator('.intro')).toBeVisible();
});

test('leere Seitenleisten erklären sich und bieten den nächsten Schritt an', async ({ app }) => {
  await app.open('text.pdf');
  const side = app.page.locator('.sidebar');
  const panel = async (name: string) => { await app.page.locator(`.rail button[aria-label="${name}"]`).click(); };

  await panel('Kommentare');
  let e = side.locator('.empty-state');
  await expect(e.getByRole('heading', { name: 'Noch keine Kommentare' })).toBeVisible();
  await expect(e.getByRole('button', { name: 'Markieren' })).toBeVisible();

  await panel('Lesezeichen');
  e = side.locator('.empty-state');
  await expect(e.getByRole('heading', { name: 'Keine Lesezeichen' })).toBeVisible();

  await panel('Anhänge');
  e = side.locator('.empty-state');
  await expect(e.getByRole('heading', { name: 'Keine Anhänge' })).toBeVisible();

  await panel('Suchen');
  e = side.locator('.empty-state');
  await expect(e.getByRole('heading', { name: 'Im ganzen Dokument suchen' })).toBeVisible();
  await app.page.locator('#find-input').fill('xyzzyqq');
  await expect(side.locator('.empty-state').getByRole('heading', { name: 'Nichts gefunden' })).toBeVisible({ timeout: 15_000 });
});

test('Organisieren: Auswahlleiste erscheint erst mit Auswahl', async ({ app }) => {
  await app.open('text.pdf');
  await app.runTool('organize');
  const org = app.page.locator('.org');
  await expect(org).toBeVisible();
  await expect(org.locator('.selbar')).toHaveCount(0);
  await org.locator('.cell').first().click();
  await expect(org.locator('.selbar')).toBeVisible();
  await expect(org.locator('.selbar')).toContainText('1 ausgewählt');
  // Esc hebt zuerst die Auswahl auf, erst das zweite schließt die Ansicht
  await app.page.keyboard.press('Escape');
  await expect(org.locator('.selbar')).toHaveCount(0);
  await expect(org).toBeVisible();
  await app.page.keyboard.press('Escape');
  await expect(org).toHaveCount(0);
});
