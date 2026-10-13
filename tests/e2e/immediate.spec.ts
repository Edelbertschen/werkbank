// Ein Bearbeitungsmodell: Jede Änderung ist sofort ein Stand im Verlauf, ohne „Übernehmen“.
// Rückgängig/Wiederholen gilt je Änderung; Speichern und Werkzeuge schreiben die Elemente ins PDF.
import { test, expect } from './app';

const W = (page: any, fn: string) => page.evaluate(`(async () => { const W = window.__wb; const d = W.active(); ${fn} })()`);
const history = (page: any) => W(page, 'return d.history.slice(0, d.pos + 1).map(h => h.label)');
const objects = (page: any) => W(page, 'return JSON.parse(JSON.stringify(W.overlay.itemsOf(d))).map(o => o.kind)');

/** Anmerkungen und Text der ersten Seite im PDF, wie es gespeichert würde */
async function baked(page: any) {
  return W(page, `
    const bytes = await d.baked();
    const r = await W.pyRun(\`
import json
p = open_in()[0]
json.dumps({'annots': sorted(a.type[1] for a in p.annots()), 'text': p.get_text()})
\`, { files: { 'in.pdf': bytes } });
    return JSON.parse(r.result);`);
}
async function pageBox(app: any) {
  await app.runTool('zoom-page'); await app.page.waitForTimeout(500);
  const b = (await app.page.locator('.page[data-page-number="1"]').boundingBox())!;
  return { X: (f: number) => b.x + b.width * f, Y: (f: number) => b.y + b.height * f };
}
async function tool(app: any, tab: string, label: string) {
  await app.tab(tab); await app.page.locator(`.ribbon button[aria-label="${label}"]`).first().click(); await app.page.waitForTimeout(200);
}
async function drawRect(app: any, X: any, Y: any) {
  await tool(app, 'Kommentieren', 'Rechteck');
  await app.page.mouse.move(X(0.5), Y(0.6)); await app.page.mouse.down(); await app.page.mouse.move(X(0.8), Y(0.7), { steps: 6 }); await app.page.mouse.up();
}

test('Rechteck ist sofort ein Stand: kein Übernehmen, Rückgängig und Wiederholen je Änderung', async ({ app }) => {
  await app.open('text.pdf');
  const { X, Y } = await pageBox(app);
  await drawRect(app, X, Y);
  await expect(app.page.locator('.cbar')).toHaveCount(0);
  expect(await history(app.page)).toEqual(['Geöffnet', 'Rechteck eingefügt']);
  expect((await baked(app.page)).annots).toEqual(['Square']);

  await app.page.keyboard.press('Escape'); await app.page.keyboard.press('Escape');
  await app.page.keyboard.press('Control+z');
  await expect.poll(() => objects(app.page)).toEqual([]);
  expect((await baked(app.page)).annots).toEqual([]);
  await app.page.keyboard.press('Control+Shift+z');
  await expect.poll(() => objects(app.page)).toEqual(['rect']);
});

test('Text schreiben und verschieben: zwei Stände, Rückgängig setzt die Position zurück', async ({ app }) => {
  await app.open('text.pdf');
  const { X, Y } = await pageBox(app);
  await tool(app, 'Bearbeiten', 'Text hinzufügen');
  await app.page.mouse.click(X(0.2), Y(0.8));
  await app.page.keyboard.type('Sofort im Dokument');
  await app.page.keyboard.press('Escape');
  await expect.poll(() => history(app.page)).toEqual(['Geöffnet', 'Text eingefügt']);
  expect((await baked(app.page)).text).toContain('Sofort im Dokument');

  await tool(app, 'Bearbeiten', 'Elemente verschieben');
  const tx = (await app.page.locator('.item.text').first().boundingBox())!;
  await app.page.mouse.move(tx.x + tx.width / 2, tx.y + tx.height / 2); await app.page.mouse.down();
  await app.page.mouse.move(tx.x + tx.width / 2, tx.y - 120, { steps: 8 }); await app.page.mouse.up();
  await expect.poll(() => history(app.page)).toEqual(['Geöffnet', 'Text eingefügt', 'Element verschoben']);
  const y1 = await W(app.page, 'return W.overlay.itemsOf(d)[0].y');
  await app.page.keyboard.press('Control+z');
  await expect.poll(() => W(app.page, 'return W.overlay.itemsOf(d)[0].y')).toBeGreaterThan(y1 + 0.05);
});

test('Werkzeug auf der Seite schreibt die Elemente ein; Rückgängig holt sie als Elemente zurück', async ({ app }) => {
  await app.open('text.pdf');
  const { X, Y } = await pageBox(app);
  await drawRect(app, X, Y);
  await app.page.keyboard.press('Escape'); await app.page.keyboard.press('Escape');
  await app.runTool('rotate-right');
  expect(await history(app.page)).toEqual(['Geöffnet', 'Rechteck eingefügt', 'Seite 1 gedreht']);
  expect(await objects(app.page)).toEqual([]);
  expect((await baked(app.page)).annots).toEqual(['Square']);
  await app.page.keyboard.press('Control+z');
  await expect.poll(() => objects(app.page)).toEqual(['rect']);
});

test('Textmarker aus der Textauswahl ist ein eigenes Element und wird zur Markierung im PDF', async ({ app }) => {
  await app.open('text.pdf');
  await pageBox(app);
  await tool(app, 'Kommentieren', 'Textmarker');
  const sp = (await app.page.locator('.page[data-page-number="1"] .textLayer span').nth(1).boundingBox())!;
  await app.page.mouse.move(sp.x + 2, sp.y + sp.height / 2); await app.page.mouse.down();
  await app.page.mouse.move(sp.x + sp.width * 0.6, sp.y + sp.height / 2, { steps: 10 }); await app.page.mouse.up();
  await expect.poll(() => objects(app.page)).toEqual(['highlight']);
  expect(await history(app.page)).toEqual(['Geöffnet', 'Markierung eingefügt']);
  expect((await baked(app.page)).annots).toEqual(['Highlight']);
});

test('Freihand zeichnen ist ein eigenes Element und wird zur Freihand-Anmerkung', async ({ app }) => {
  await app.open('text.pdf');
  const { X, Y } = await pageBox(app);
  await tool(app, 'Kommentieren', 'Freihand');
  await app.page.mouse.move(X(0.2), Y(0.7)); await app.page.mouse.down();
  for (let i = 0; i < 20; i++) await app.page.mouse.move(X(0.2 + i * 0.02), Y(0.7 + ((i % 4) - 2) * 0.01));
  await app.page.mouse.up();
  await expect.poll(() => objects(app.page)).toEqual(['ink']);
  expect(await history(app.page)).toEqual(['Geöffnet', 'Freihand eingefügt']);
  expect((await baked(app.page)).annots).toEqual(['Ink']);
});

test('Textkommentar schreibt eine Textanmerkung (FreeText)', async ({ app }) => {
  await app.open('text.pdf');
  const { X, Y } = await pageBox(app);
  await tool(app, 'Kommentieren', 'Textkommentar');
  await app.page.mouse.click(X(0.55), Y(0.85));
  await app.page.keyboard.type('Bitte prüfen');
  await app.page.keyboard.press('Escape');
  await expect.poll(() => history(app.page)).toEqual(['Geöffnet', 'Textkommentar eingefügt']);
  const b = await baked(app.page);
  expect(b.annots).toEqual(['FreeText']);
});

test('Miniatur in der Seitenleiste zeigt neue Elemente nach kurzer Zeit', async ({ app }) => {
  await app.open('text.pdf');
  const { X, Y } = await pageBox(app);
  const img = app.page.locator('.thumbs .item').first().locator('img');
  await expect(img).toHaveAttribute('src', /^data:/);
  const before = await img.getAttribute('src');
  await drawRect(app, X, Y);
  await expect.poll(() => img.getAttribute('src'), { timeout: 20_000 }).not.toBe(before);
  // Rückgängig: wieder wie vorher
  await app.page.keyboard.press('Escape'); await app.page.keyboard.press('Escape');
  await app.page.keyboard.press('Control+z');
  await expect.poll(() => img.getAttribute('src'), { timeout: 20_000 }).toBe(before);
});
