// Bearbeiten direkt auf der Seite – mit Maus und Tastatur wie ein Mensch.
import { test, expect } from './app';

async function pageBox(app: any, n = 1) {
  await app.runTool('zoom-page');
  await app.page.waitForTimeout(600);
  const box = (await app.page.locator(`.page[data-page-number="${n}"]`).boundingBox())!;
  return { X: (f: number) => box.x + box.width * f, Y: (f: number) => box.y + box.height * f };
}
async function mode(app: any, tab: string, label: string) { await app.tab(tab); await app.page.locator(`.ribbon button[aria-label="${label}"]`).first().click(); await app.page.waitForTimeout(300); }

test('Text ändern, schwärzen, Text und Rechteck einfügen, übernehmen', async ({ app }) => {
  await app.open('text.pdf');
  const { X, Y } = await pageBox(app);
  const page = app.page;

  await mode(app, 'Bearbeiten', 'Text bearbeiten');
  const span = page.locator('.page[data-page-number="1"] .textLayer span', { hasText: 'Kapitel 1' }).first();
  const sb = (await span.boundingBox())!;
  await page.mouse.click(sb.x + 10, sb.y + sb.height / 2);
  await page.keyboard.press('Control+a');
  await page.keyboard.type('Kapitel Eins: Geändert');
  await page.keyboard.press('Escape');

  await mode(app, 'Bearbeiten', 'Schwärzen');
  await page.mouse.move(X(0.15), Y(0.165)); await page.mouse.down(); await page.mouse.move(X(0.6), Y(0.19), { steps: 8 }); await page.mouse.up();

  await mode(app, 'Kommentieren', 'Rechteck');
  await page.mouse.move(X(0.55), Y(0.75)); await page.mouse.down(); await page.mouse.move(X(0.85), Y(0.85), { steps: 8 }); await page.mouse.up();

  await mode(app, 'Bearbeiten', 'Text hinzufügen');
  await page.mouse.click(X(0.15), Y(0.8));
  await page.keyboard.type('Neuer Text von Werkbank');
  await page.keyboard.press('Escape');

  await expect(page.locator('.cbar')).toContainText('4 Änderungen');
  await page.locator('.cbar button', { hasText: 'Übernehmen' }).click();
  await page.locator('.dialog .buttons .btn.primary').click();
  await app.idle();
  await expect.poll(async () => (await app.docInfo())!.history.length, { timeout: 60_000 }).toBe(2);

  const info = (await app.docInfo())!;
  expect(info.history).toEqual(['Geöffnet', '4 Änderungen übernommen, davon 1 geschwärzt']);
  expect(info.texts[0]).toContain('Kapitel Eins: Geändert');
  expect(info.texts[0]).toContain('Neuer Text von Werkbank');
  expect(info.texts[0]).not.toContain('Kapitel 1: Testdokument');
  expect(info.texts[0].match(/mustermann/g)?.length).toBe(2); // die erste von drei Adressen ist geschwärzt
});

test('Freihand und Textmarker werden beim Speichern übernommen', async ({ app }) => {
  await app.open('text.pdf');
  const { X, Y } = await pageBox(app);
  const page = app.page;
  await mode(app, 'Kommentieren', 'Freihand');
  await page.mouse.move(X(0.2), Y(0.7)); await page.mouse.down();
  for (let i = 0; i < 20; i++) await page.mouse.move(X(0.2 + i * 0.02), Y(0.7 + ((i % 4) - 2) * 0.01));
  await page.mouse.up();
  await mode(app, 'Kommentieren', 'Textmarker');
  const sp = (await page.locator('.page[data-page-number="1"] .textLayer span').nth(1).boundingBox())!;
  await page.mouse.move(sp.x + 2, sp.y + sp.height / 2); await page.mouse.down(); await page.mouse.move(sp.x + sp.width * 0.6, sp.y + sp.height / 2, { steps: 10 }); await page.mouse.up();
  await page.keyboard.press('Escape');
  const dl = page.waitForEvent('download');
  await page.keyboard.press('Control+s');
  const file = (await (await dl).path())!;
  const raw = (await import('node:fs')).readFileSync(file).toString('latin1');
  expect(raw).toMatch(/\/Subtype\s*\/Ink/);
  expect(raw).toMatch(/\/Subtype\s*\/Highlight/);
});

test('Unterstreichen aus einer Textauswahl', async ({ app }) => {
  await app.open('text.pdf');
  await pageBox(app);
  const page = app.page;
  await mode(app, 'Kommentieren', 'Unterstreichen');
  const sp = (await page.locator('.page[data-page-number="1"] .textLayer span').nth(1).boundingBox())!;
  await page.mouse.move(sp.x + 2, sp.y + sp.height / 2); await page.mouse.down(); await page.mouse.move(sp.x + sp.width * 0.5, sp.y + sp.height / 2, { steps: 10 }); await page.mouse.up();
  await expect(page.locator('.cbar')).toContainText('1 Änderung');
});

test('Text im Dokument lässt sich markieren (Kopieren)', async ({ app }) => {
  await app.open('text.pdf');
  await pageBox(app);
  const page = app.page;
  const sp = (await page.locator('.page[data-page-number="1"] .textLayer span').nth(1).boundingBox())!;
  await page.mouse.move(sp.x + 2, sp.y + sp.height / 2); await page.mouse.down(); await page.mouse.move(sp.x + sp.width * 0.5, sp.y + sp.height / 2, { steps: 8 }); await page.mouse.up();
  expect(await page.evaluate(() => getSelection()!.toString().length)).toBeGreaterThan(5);
});

test('Rückgängig und Wiederholen per Tastatur', async ({ app }) => {
  await app.open('text.pdf');
  await app.runTool('rotate-right');
  await app.page.locator('.vc').click({ position: { x: 5, y: 5 } });
  await app.page.keyboard.press('Control+z'); await app.idle();
  expect((await app.docInfo())!.dirty).toBe(false);
  await app.page.keyboard.press('Control+Shift+z'); await app.idle();
  expect((await app.docInfo())!.history.length).toBe(2);
});

test('Absatz bearbeiten: neuer Text bricht innerhalb der Spalte um', async ({ app }) => {
  await app.open('text.pdf');
  await pageBox(app);
  const page = app.page;
  await mode(app, 'Bearbeiten', 'Text bearbeiten');
  // Eine Zeile mitten im Absatz anklicken
  const line = page.locator('.page[data-page-number="1"] .textLayer span', { hasText: 'Markierung' }).first();
  const lb = (await line.boundingBox())!;
  await page.mouse.click(lb.x + 15, lb.y + lb.height / 2);
  const editor = page.locator('.item.textedit .tx.multi');
  await expect(editor).toBeVisible();
  await expect(editor).toContainText('Werkbank ist eine PDF-Anwendung');
  await page.keyboard.press('Control+a');
  const neu = 'Der Forstbetrieb plant im kommenden Jahr eine vollständige Inventur aller Bestände, einschließlich der neu erworbenen Flächen im Nordschwarzwald und der Versuchsflächen am Kaiserstuhl.';
  await page.keyboard.type(neu);
  await page.keyboard.press('Escape');
  await page.locator('.cbar button', { hasText: 'Übernehmen' }).click();
  await app.idle();
  const r = await page.evaluate(async () => {
    const d = (window as any).__wb.active(); const p = await d.pdf.getPage(1); const vp = p.getViewport({ scale: 1 });
    const items = (await p.getTextContent()).items.filter((x: any) => x.str.trim());
    const mine = items.filter((x: any) => /Forstbetrieb|Inventur|Nordschwarzwald|Kaiserstuhl|Bestände|Flächen|Versuchsflächen/.test(x.str));
    return { all: items.map((x: any) => x.str).join(' '), lines: new Set(mine.map((x: any) => Math.round(x.transform[5]))).size, maxRight: Math.max(...mine.map((x: any) => (x.transform[4] + x.width) / vp.width)) };
  });
  expect(r.all.replace(/\s+/g, ' ')).toContain('vollständige Inventur aller Bestände');
  expect(r.all).not.toContain('max.mustermann@example.com, IBAN DE89 3704 0044 0532 0130 00. Werkbank ist eine PDF-Anwendung. Dieser Absatz dient als Testtext');
  expect(r.lines).toBeGreaterThan(1);
  expect(r.maxRight).toBeLessThan(0.9);
});
