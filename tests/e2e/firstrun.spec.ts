// Erster Start: Splash, Willkommensfenster mit Sprache und Erscheinungsbild, leere Zustände.
import { test, expect } from './app';

test.describe('Willkommen', () => {
  test.use({ intro: true });

  test('Willkommensfenster beim ersten Start; einmal geschlossen, bleibt es weg', async ({ app }) => {
    const intro = app.page.getByRole('dialog', { name: 'Willkommen in der Werkbank' });
    await expect(intro).toBeVisible();
    await expect(intro.locator('.points li')).toHaveCount(3);
    await intro.getByRole('button', { name: 'Loslegen' }).click();
    await expect(intro).toHaveCount(0);
    await app.page.waitForTimeout(400);
    await app.page.reload();
    await app.page.waitForFunction(() => (window as any).__wb);
    await expect(app.page.getByText('Datei hierher ziehen')).toBeVisible();
    await expect(app.page.locator('.welcome')).toHaveCount(0);
  });

  test('Erscheinungsbild wählen wirkt sofort und gilt auch für den Splash beim nächsten Start', async ({ app }) => {
    const intro = app.page.getByRole('dialog', { name: 'Willkommen in der Werkbank' });
    await intro.getByRole('button', { name: 'Dunkel' }).click();
    expect(await app.page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
    await intro.getByRole('button', { name: 'Loslegen' }).click();
    await app.page.waitForTimeout(400);
    await app.page.addInitScript(() => document.addEventListener('DOMContentLoaded', () => {
      const s = document.getElementById('splash');
      (window as any).__splash = s ? { theme: document.documentElement.dataset.theme, bg: getComputedStyle(s).backgroundColor } : null;
    }));
    await app.page.reload();
    await app.page.waitForFunction(() => (window as any).__wb);
    const sp = await app.page.evaluate(() => (window as any).__splash);
    expect(sp.theme).toBe('dark');
    expect(sp.bg).toBe('rgb(17, 20, 21)');
    // Splash verschwindet, sobald die App bereit ist
    await expect(app.page.locator('#splash')).toHaveCount(0);
  });

  test('Sprache wählen: Werkbank startet auf Englisch neu, das Fenster bleibt bis „Get started“', async ({ app }) => {
    const intro = app.page.getByRole('dialog', { name: 'Willkommen in der Werkbank' });
    await intro.getByRole('button', { name: 'English' }).click();
    await app.page.waitForFunction(() => (window as any).__wb && document.querySelector('.welcome'));
    const en = app.page.getByRole('dialog', { name: 'Welcome to Werkbank' });
    await expect(en).toBeVisible({ timeout: 20_000 });
    await expect(en.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true');
    await en.getByRole('button', { name: 'Get started' }).click();
    await expect(app.page.getByText('Drag a file here')).toBeVisible();
  });

  test('Einführung lässt sich in den Einstellungen wieder zeigen', async ({ app }) => {
    await app.page.getByRole('button', { name: 'Loslegen' }).click();
    await app.page.getByRole('button', { name: 'Einstellungen' }).click();
    await app.page.getByRole('button', { name: 'Einführung erneut zeigen' }).click();
    await expect(app.page.getByRole('dialog', { name: 'Willkommen in der Werkbank' })).toBeVisible();
  });
});

test('Splash erscheint vor der App und ist danach verschwunden', async ({ app }) => {
  await app.page.addInitScript(() => document.addEventListener('DOMContentLoaded', () => { (window as any).__hadSplash = !!document.getElementById('splash'); }));
  await app.page.reload();
  await app.page.waitForFunction(() => (window as any).__wb);
  expect(await app.page.evaluate(() => (window as any).__hadSplash)).toBe(true);
  await expect(app.page.locator('#splash')).toHaveCount(0);
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
