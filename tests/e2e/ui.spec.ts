// Oberfläche: Bandleiste, Befehlssuche, Erscheinungsbild, Schutz vor Datenverlust.
import { test, expect } from './app';

test('Bandleiste faltet Gruppen bei wenig Platz zu Menüs', async ({ app }) => {
  await app.open('text.pdf');
  await app.page.setViewportSize({ width: 1000, height: 800 });
  await app.tab('Seiten');
  await expect(app.page.locator('.ribbon .fold').first()).toBeVisible();
  await app.page.locator('.ribbon .fold').last().click();
  await expect(app.page.locator('.gpop')).toBeVisible();
  await app.page.setViewportSize({ width: 1800, height: 900 });
  await app.page.waitForTimeout(400);
  await expect(app.page.locator('.ribbon .fold')).toHaveCount(0);
});

test('kein Inhalt der Bandleiste ragt über den Rand', async ({ app }) => {
  await app.open('text.pdf');
  for (const w of [1100, 1440]) {
    await app.page.setViewportSize({ width: w, height: 850 });
    for (const t of ['Start', 'Seiten', 'Bearbeiten', 'Kommentieren', 'Formulare', 'Umwandeln', 'Optimieren', 'Schützen', 'Analysieren', 'Ansicht']) {
      await app.tab(t); await app.page.waitForTimeout(150);
      const over = await app.page.evaluate(() => { const b = document.querySelector('.ribbon .body')!; return b.scrollWidth - b.clientWidth; });
      expect(over, `${t} bei ${w}px`).toBeLessThanOrEqual(1);
    }
  }
});

test('Befehlssuche findet Werkzeuge nach Alltagswörtern', async ({ app }) => {
  await app.open('text.pdf');
  await app.page.keyboard.press('Control+k');
  await app.page.keyboard.type('kleiner machen');
  await expect(app.page.locator('.palette, [role=dialog]').getByText('Komprimieren').first()).toBeVisible();
  await app.page.keyboard.press('Escape');
});

test('dunkles Erscheinungsbild folgt dem System', async ({ app }) => {
  await app.page.emulateMedia({ colorScheme: 'dark' });
  const bg = await app.page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const [r, g, b] = bg.match(/\d+/g)!.map(Number);
  expect(r + g + b).toBeLessThan(200);
});

test('Schließen eines geänderten Dokuments fragt nach', async ({ app }) => {
  await app.open('text.pdf');
  await app.runTool('rotate-right');
  await app.page.keyboard.press('Control+w');
  await expect(app.page.locator('.dialog')).toBeVisible();
  await expect(app.page.locator('.dialog')).toContainText(/speichern/i);
});

test('App-Symbol führt zurück zur Startseite', async ({ app }) => {
  await app.open('text.pdf');
  // Im Browser gibt es keine Dateipfade – „Zuletzt geöffnet“ gibt es nur in der Desktop-App.
  await app.page.locator('.brand').click();
  await expect(app.page.getByRole('heading', { name: 'Zuletzt geöffnet' })).toBeVisible();
});

test('Öffnen über den Systemdialog von der Startseite', async ({ app }) => {
  const chooser = app.page.waitForEvent('filechooser');
  await app.page.getByText('Datei öffnen', { exact: true }).click();
  await (await chooser).setFiles(['tests/fixtures/text.pdf', 'tests/fixtures/brief.docx']);
  await app.idle();
  await expect(app.page.locator('.tab, [role=tab]').filter({ hasText: 'brief' }).first()).toBeVisible();
  expect((await app.docInfo())!.docs).toBe(2);
});

test('Registerkarten per Rechtsklick ausblenden und in den Einstellungen zurückholen', async ({ app }) => {
  await app.open('text.pdf');
  await app.page.getByRole('tab', { name: 'Formulare', exact: true }).click({ button: 'right' });
  await app.page.getByText('„Formulare“ ausblenden').click();
  await expect(app.page.getByRole('tab', { name: 'Formulare', exact: true })).toHaveCount(0);
  // Werkzeuge bleiben über die Befehlssuche erreichbar
  await app.page.keyboard.press('Control+k');
  await app.page.keyboard.type('textfeld');
  await expect(app.page.locator('.pal').getByText('Textfeld').first()).toBeVisible();
  await app.page.keyboard.press('Escape');
  await app.page.getByRole('tab', { name: 'Start', exact: true }).click({ button: 'right' });
  await app.page.getByText('Alle Registerkarten zeigen').click();
  await expect(app.page.getByRole('tab', { name: 'Formulare', exact: true })).toBeVisible();
});
