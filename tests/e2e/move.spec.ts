// „Elemente verschieben“: eigene Elemente und Inhalte des PDFs (Textblöcke, Bilder) anfassen und verschieben.
import { test, expect } from './app';

async function enterMove(app: any) {
  await app.runTool('zoom-page'); await app.page.waitForTimeout(600);
  await app.tab('Bearbeiten');
  await app.page.locator('.ribbon button[aria-label="Elemente verschieben"]').first().click();
  // Inhalte der Seite sind erkannt, sobald ihre Rahmen bereitstehen
  await expect(app.page.locator('.page[data-page-number="1"] .obj').first()).toBeAttached({ timeout: 60_000 });
}
const pageBox = async (app: any) => (await app.page.locator('.page[data-page-number="1"]').boundingBox())!;

/** Bilder und Textzeilen der ersten Seite (in pt), gelesen mit PyMuPDF */
async function content(app: any) {
  return app.page.evaluate(async () => {
    const W = (window as any).__wb;
    const r = await W.pyRun(`
import json
doc = open_in(); p = doc[0]
imgs = [[round(v) for v in i['bbox']] + [i['xref']] for i in p.get_image_info(xrefs=True)]
lines = []
for b in p.get_text('dict')['blocks']:
    for l in b.get('lines', []):
        t = ''.join(s['text'] for s in l['spans']).strip()
        if t: lines.append([t, round(l['bbox'][0]), round(l['bbox'][1])])
streams = sum(1 for x in range(1, doc.xref_length()) if doc.xref_get_key(x, 'Subtype')[1] == '/Image')
json.dumps({'imgs': imgs, 'lines': lines, 'imageObjects': streams})
`, { files: { 'in.pdf': await W.active().baked() } });
    return JSON.parse(r.result);
  });
}
async function apply(app: any) {
  // Jede Änderung ist sofort ein Stand; Esc beendet nur den Modus
  await app.page.keyboard.press('Escape');
  await expect.poll(async () => app.page.evaluate(() => { const d = (window as any).__wb.active(); return d.pos; }), { timeout: 60_000 }).toBeGreaterThan(0);
}
async function drag(page: any, x: number, y: number, dx: number, dy: number) {
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 6 }); await page.mouse.move(x + dx, y + dy, { steps: 6 });
  await page.mouse.up();
}

test('Bild im PDF verschieben: gleiche Bilddaten, neue Position, Text bleibt', async ({ app }) => {
  await app.open('bild.pdf');
  const before = await content(app);
  await enterMove(app);
  const b = await pageBox(app); const k = b.width / 595;
  // Bildmitte (440, 260 pt) um 100 pt nach links und 300 pt nach unten ziehen
  await drag(app.page, b.x + 440 * k, b.y + 260 * k, -100 * k, 300 * k);
  await expect.poll(() => app.page.evaluate(() => { const d = (window as any).__wb.active(); return d.history.slice(0, d.pos + 1).map((h: any) => h.label); })).toEqual(['Geöffnet', 'Element verschoben']);
  await apply(app);
  const after = await content(app);
  expect(after.imgs).toHaveLength(1);
  const [x0, y0, x1, y1] = after.imgs[0];
  expect(Math.abs(x0 - (398 - 100))).toBeLessThanOrEqual(3);
  expect(Math.abs(y0 - (200 + 300))).toBeLessThanOrEqual(3);
  expect(x1 - x0).toBeCloseTo(85, -1); expect(y1 - y0).toBeCloseTo(120, -1);
  expect(after.imageObjects).toBe(1); // keine Kopie der Bilddaten
  expect(after.lines).toEqual(before.lines);
});

test('Bild im PDF vergrößern über den Eckpunkt (Seitenverhältnis bleibt)', async ({ app }) => {
  await app.open('bild.pdf');
  await enterMove(app);
  const b = await pageBox(app); const k = b.width / 595;
  await app.page.mouse.click(b.x + 440 * k, b.y + 260 * k);
  const rs = app.page.locator('.item.move.sel .rs');
  await expect(rs).toBeVisible();
  const r = (await rs.boundingBox())!;
  await drag(app.page, r.x + r.width / 2, r.y + r.height / 2, 85 * k, 0);
  await apply(app);
  const [x0, y0, x1, y1] = (await content(app)).imgs[0];
  expect(Math.abs(x0 - 398)).toBeLessThanOrEqual(3); expect(Math.abs(y0 - 200)).toBeLessThanOrEqual(3);
  expect(Math.abs((x1 - x0) - 170)).toBeLessThanOrEqual(4);
  expect(Math.abs((y1 - y0) - 240)).toBeLessThanOrEqual(6);
});

test('Textblock im PDF verschieben: Text unverändert, an neuer Stelle', async ({ app }) => {
  await app.open('bild.pdf');
  const before = await content(app);
  await enterMove(app);
  const b = await pageBox(app); const k = b.width / 595;
  await drag(app.page, b.x + 120 * k, b.y + 697 * k, 50 * k, -400 * k);
  await apply(app);
  const after = await content(app);
  const foot = after.lines.find((l: any) => l[0].startsWith('Fußnote'));
  expect(foot[0]).toBe('Fußnote: verschiebbarer Text');
  const old = before.lines.find((l: any) => l[0].startsWith('Fußnote'));
  expect(Math.abs(foot[1] - (old[1] + 50))).toBeLessThanOrEqual(2);
  expect(Math.abs(foot[2] - (old[2] - 400))).toBeLessThanOrEqual(2);
  // alles andere bleibt
  expect(after.lines.filter((l: any) => !l[0].startsWith('Fußnote'))).toEqual(before.lines.filter((l: any) => !l[0].startsWith('Fußnote')));
  expect(after.imgs.map((i: number[]) => i.slice(0, 4))).toEqual(before.imgs.map((i: number[]) => i.slice(0, 4)));
});

test('Element im PDF auswählen und mit Entf löschen', async ({ app }) => {
  await app.open('bild.pdf');
  await enterMove(app);
  const b = await pageBox(app); const k = b.width / 595;
  await app.page.mouse.click(b.x + 440 * k, b.y + 260 * k);
  await app.page.keyboard.press('Delete');
  await apply(app);
  const after = await content(app);
  expect(after.imgs).toHaveLength(0);
  expect(after.lines.map((l: any) => l[0])).toContain('Dieser Absatz bleibt an seinem Platz.');
});

test('eigenen Text überall anfassen und verschieben, Pfeiltasten schieben fein', async ({ app }) => {
  await app.open('bild.pdf');
  await app.runTool('zoom-page'); await app.page.waitForTimeout(600);
  const b = await pageBox(app); const k = b.width / 595;
  await app.tab('Bearbeiten'); await app.page.locator('.ribbon button[aria-label="Text hinzufügen"]').first().click();
  await app.page.mouse.click(b.x + 100 * k, b.y + 400 * k);
  await app.page.keyboard.type('Eigener Hinweis');
  await app.page.keyboard.press('Escape');
  const item = () => app.page.evaluate(() => { const W = (window as any).__wb; return JSON.parse(JSON.stringify(W.overlay.itemsOf(W.active())[0])); });
  const start = await item();
  await app.page.locator('.ribbon button[aria-label="Elemente verschieben"]').first().click();
  // mitten in den Text greifen
  const tx = (await app.page.locator('.item.text').first().boundingBox())!;
  await drag(app.page, tx.x + tx.width / 2, tx.y + tx.height / 2, 0, 100 * k);
  let it = await item();
  expect(it.text).toBe('Eigener Hinweis');
  expect((it.y - start.y) * 842).toBeCloseTo(100, -1);
  await app.page.keyboard.press('ArrowRight'); await app.page.keyboard.press('ArrowRight');
  await app.page.keyboard.press('Shift+ArrowUp');
  it = await item();
  expect((it.x - start.x) * 595).toBeCloseTo(2, 0);
  expect((it.y - start.y) * 842).toBeCloseTo(90, 0);
  // Doppelklick bearbeitet den Text
  const tx2 = (await app.page.locator('.item.text').first().boundingBox())!;
  await app.page.mouse.dblclick(tx2.x + tx2.width - 4, tx2.y + tx2.height / 2);
  await app.page.keyboard.press('End');
  await app.page.keyboard.type('!');
  expect((await item()).text).toBe('Eigener Hinweis!');
});
