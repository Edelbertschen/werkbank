// Englische Oberfläche im echten Browser: keine deutschen Reste, Werkzeuge laufen.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { skipIntro } from './app';

test.use({ locale: 'en-US' });
test.beforeEach(async ({ page }) => { await page.addInitScript(skipIntro); });

const GERMAN_WORDS = /\b(und|oder|der|die|das|mit|für|nicht|Seite|Seiten|Datei|Dateien|Dokument|Öffnen|Speichern|Schließen|Einstellungen|Bearbeiten|Werkzeug)\b|[äöüÄÖÜß„]/;

async function visibleGerman(page: import('@playwright/test').Page) {
  const text = await page.evaluate(() => document.body.innerText);
  return text.split('\n').map(s => s.trim()).filter(s => s && /[äöüÄÖÜß„]|\b(und|oder|der|die|das|mit|für|nicht|Seite|Seiten|Datei|Dateien|Dokument)\b/.test(s));
}

test('startet auf Englisch, wenn das System Englisch spricht', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('/');
  await page.waitForFunction(() => (window as any).__wb, null, { timeout: 30_000 });
  // Startseite (ohne Dokument gibt es keine Bandleiste)
  await expect(page.getByRole('heading', { name: 'Recently opened' })).toBeVisible();
  await expect(page.getByText('Drag a file here')).toBeVisible();
  expect(await visibleGerman(page)).toEqual([]);

  // Dokument öffnen und durch alle Registerkarten blättern
  const b64 = readFileSync('tests/fixtures/text.pdf').toString('base64');
  await page.evaluate(async (d) => { await (window as any).__wb.actions.openBytes('text.pdf', Uint8Array.from(atob(d), c => c.charCodeAt(0)), null); }, b64);
  await page.waitForTimeout(1500);
  for (const tab of ['Home', 'Pages', 'Edit', 'Comment', 'Forms', 'Convert', 'Optimize', 'Protect', 'Analyze', 'View']) {
    await page.getByRole('tab', { name: tab, exact: true }).click();
    const ribbonText = await page.locator('.ribbon').innerText();
    expect(ribbonText.split('\n').filter(s => GERMAN_WORDS.test(s)), tab).toEqual([]);
  }
  // Ein Werkzeug mit Aufgabenbereich: Beschriftungen und Ergebnis englisch
  await page.getByRole('tab', { name: 'Pages', exact: true }).click();
  await page.evaluate(() => (window as any).__wb.actions.runTool((window as any).__wb.tool('page-numbers')));
  await expect(page.locator('.toast').filter({ hasText: 'Page numbers added' })).toBeVisible();
  const text = await page.evaluate(async () => { const d = (window as any).__wb.active(); const p = await d.pdf.getPage(1); return (await p.getTextContent()).items.map((i: any) => i.str).join(' '); });
  expect(text).toContain('1');
  // Befehlssuche auf Englisch
  await page.keyboard.press('Control+k');
  await page.keyboard.type('make smaller');
  await expect(page.locator('.palette, [role=dialog]').getByText('Compress').first()).toBeVisible();
  await page.screenshot({ path: 'test-results/english.png' });
  expect(errors).toEqual([]);
});

test('Sprache lässt sich in den Einstellungen festlegen', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => (window as any).__wb, null, { timeout: 30_000 });
  await page.evaluate(() => { (window as any).__wb.app.pane = { tool: 'settings', nonce: 1 }; });
  await page.getByRole('button', { name: 'Deutsch' }).click();
  await expect(page.getByText('The new language takes effect after restarting Werkbank.')).toBeVisible();
  await page.getByRole('button', { name: 'Restart now' }).click();
  await page.waitForFunction(() => (window as any).__wb, null, { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Zuletzt geöffnet' })).toBeVisible();
  await expect(page.getByText('Datei hierher ziehen')).toBeVisible();
});
