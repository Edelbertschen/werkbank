// Kleine Bedienhilfen: Tab-Menü, zuletzt geschlossenes Dokument, Lesezeichensuche, Seitenbeschriftungen, Lesemodus.
import { test, expect } from './app';

test('Rechtsklick auf einen Tab: andere schließen, zuletzt geschlossenes wieder öffnen (auch per Strg+Umschalt+T)', async ({ app }) => {
  await app.open('text.pdf', 'outline.pdf');
  const tab = (n: string) => app.page.locator('.titlebar .tab').filter({ hasText: n });
  await tab('text').click({ button: 'right' });
  const menu = app.page.locator('.ctxmenu');
  await expect(menu.getByText('Im Ordner zeigen')).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Zuletzt geschlossenes wieder öffnen' })).toBeDisabled();
  await menu.getByText('Andere schließen').click();
  await expect(app.page.locator('.titlebar .tab')).toHaveCount(1);
  await tab('text').click({ button: 'right' });
  await expect(app.page.locator('.ctxmenu').getByRole('menuitem', { name: 'Zuletzt geschlossenes wieder öffnen' })).toBeEnabled();
  await app.page.keyboard.press('Escape');
  await app.page.keyboard.press('Control+Shift+t');
  await expect(app.page.locator('.titlebar .tab')).toHaveCount(2);
  await expect(tab('outline')).toBeVisible();
});

test('Lesezeichen durchsuchen: Treffer behalten ihre Eltern, Leeren zeigt wieder alles', async ({ app }) => {
  await app.open('outline.pdf');
  await app.page.locator('.rail button[aria-label="Lesezeichen"]').click();
  const rows = app.page.locator('.sidebar .tree .row');
  await expect(rows).toHaveCount(5);
  const q = app.page.locator('.sidebar input[type=search]');
  await q.fill('invent');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('Methoden');
  await expect(rows.nth(1)).toContainText('Inventur');
  await q.fill('');
  await expect(rows).toHaveCount(5);
});

test('Seitenbeschriftungen des Dokuments (i, ii, 1 …) stehen an den Miniaturen und in der Statusleiste', async ({ app }) => {
  await app.open('text.pdf');
  await app.page.evaluate(async () => {
    const W = (window as any).__wb;
    const r = await W.pyRun(`doc = open_in()\ndoc.set_page_labels([{'startpage': 0, 'style': 'r'}, {'startpage': 2, 'style': 'D'}])\nsave_out(doc)`, { files: { 'in.pdf': W.active().bytes }, outputs: ['out.pdf'] });
    await W.actions.openBytes('labels.pdf', r.files['out.pdf'], null);
  });
  await app.idle();
  const caps = app.page.locator('.thumbs .item .cap');
  await expect(caps.nth(0).locator('.label')).toHaveText('i');
  await expect(caps.nth(1).locator('.label')).toHaveText('ii');
  await expect(caps.nth(2).locator('.label')).toHaveText('1'); // Seite 3 heißt im Dokument „1“
  await expect(app.page.locator('.status')).toContainText('i (1 von 6)');
});

test('Lesemodus blendet alles außer den Seiten aus; Esc beendet ihn', async ({ app }) => {
  await app.open('text.pdf');
  await app.runTool('read-mode');
  await expect(app.page.locator('.ribbon')).toHaveCount(0);
  await expect(app.page.locator('.rail')).toHaveCount(0);
  await expect(app.page.locator('.status')).toHaveCount(0);
  await expect(app.page.locator('.readchip')).toBeVisible();
  await expect(app.page.locator('.page[data-page-number="1"]')).toBeVisible();
  await app.page.keyboard.press('Escape');
  await expect(app.page.locator('.ribbon')).toBeVisible();
  await expect(app.page.locator('.status')).toBeVisible();
});
