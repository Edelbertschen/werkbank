// Anmerkungen aus gespeicherten PDFs (auch aus anderen Programmen) wieder anfassen:
// verschieben, umfärben, löschen – Autor, Kommentartext und übrige Eigenschaften bleiben erhalten.
import { test, expect } from './app';

const W = (page: any, fn: string) => page.evaluate(`(async () => { const W = window.__wb; const d = W.active(); ${fn} })()`);
const history = (page: any) => W(page, 'return d.history.slice(0, d.pos + 1).map(h => h.label)');

/** Anmerkungen im PDF, wie es gespeichert würde: Art, Lage (pt), Farbe, Autor, Inhalt */
async function annots(page: any) {
  return W(page, `
    const r = await W.pyRun(\`
import json
out = []
for a in open_in()[0].annots():
    c = (a.colors or {}).get('stroke') or []
    out.append({'type': a.type[1], 'x': round(a.rect.x0), 'y': round(a.rect.y0), 'w': round(a.rect.width), 'h': round(a.rect.height),
                'color': '#%02x%02x%02x' % tuple(round(v * 255) for v in c[:3]) if len(c) >= 3 else '', 'author': a.info.get('title', ''), 'content': a.info.get('content', '')})
json.dumps(sorted(out, key=lambda o: o['type']))
\`, { files: { 'in.pdf': await d.baked() } });
    return JSON.parse(r.result);`);
}
const of = (list: any[], type: string) => list.find((a: any) => a.type === type);

async function enterMove(app: any) {
  await app.runTool('zoom-page'); await app.page.waitForTimeout(500);
  await app.tab('Bearbeiten');
  await app.page.locator('.ribbon button[aria-label="Elemente verschieben"]').first().click();
  await expect(app.page.locator('.page[data-page-number="1"] .obj.annot').first()).toBeAttached({ timeout: 60_000 });
  const b = (await app.page.locator('.page[data-page-number="1"]').boundingBox())!;
  const k = b.width / 595;
  return { at: (x: number, y: number) => [b.x + x * k, b.y + y * k] as const, k };
}
async function drag(page: any, [x, y]: readonly [number, number], dx: number, dy: number) {
  await page.mouse.move(x, y); await page.mouse.down();
  await page.waitForTimeout(50);
  await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 6 }); await page.mouse.move(x + dx, y + dy, { steps: 6 });
  await page.mouse.up();
}

test('Rechteck aus dem PDF verschieben: Autor, Kommentar und Farbe bleiben', async ({ app }) => {
  await app.open('kommentare.pdf');
  const before = await annots(app.page);
  const { at, k } = await enterMove(app);
  await drag(app.page, at(81, 240), 150 * k, 300 * k); // auf den Rahmen greifen
  await expect.poll(() => history(app.page), { timeout: 30_000 }).toEqual(['Geöffnet', 'Element verschoben']);
  const after = await annots(app.page);
  expect(after.map((a: any) => a.type)).toEqual(before.map((a: any) => a.type));
  const sq = of(after, 'Square'), old = of(before, 'Square');
  expect(Math.abs(sq.x - (old.x + 150))).toBeLessThanOrEqual(3);
  expect(Math.abs(sq.y - (old.y + 300))).toBeLessThanOrEqual(3);
  expect(sq.w).toBe(old.w);
  expect([sq.author, sq.content, sq.color]).toEqual([old.author, old.content, old.color]);
  // alle anderen unverändert
  expect(after.filter((a: any) => a.type !== 'Square')).toEqual(before.filter((a: any) => a.type !== 'Square'));
});

test('Rückgängig nach dem Verschieben stellt die Anmerkung an alter Stelle wieder her', async ({ app }) => {
  await app.open('kommentare.pdf');
  const before = await annots(app.page);
  const { at, k } = await enterMove(app);
  await drag(app.page, at(350, 202), 0, 200 * k);
  await expect.poll(() => history(app.page), { timeout: 30_000 }).toEqual(['Geöffnet', 'Element verschoben']);
  await app.page.keyboard.press('Control+z');
  await expect.poll(() => history(app.page)).toEqual(['Geöffnet']);
  expect(await annots(app.page)).toEqual(before);
});

test('Markierung aus dem PDF umfärben', async ({ app }) => {
  await app.open('kommentare.pdf');
  const { at } = await enterMove(app);
  const hl = of(await annots(app.page), 'Highlight');
  await app.page.mouse.click(...at(hl.x + hl.w / 2, hl.y + hl.h / 2));
  const color = app.page.locator('.tools input[type=color]').first();
  await expect(color).toBeVisible({ timeout: 30_000 });
  await color.evaluate((el: HTMLInputElement) => { el.value = '#00c8ff'; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
  await expect.poll(() => history(app.page)).toEqual(['Geöffnet', 'Markierung geändert']);
  const after = of(await annots(app.page), 'Highlight');
  expect(after.color).toBe('#00c8ff');
  expect(after.author).toBe('Ben');
});

test('Freihand aus dem PDF löschen, Textkommentar verschieben behält Text', async ({ app }) => {
  await app.open('kommentare.pdf');
  const { at, k } = await enterMove(app);
  await app.page.mouse.click(...at(150, 497));
  await app.page.waitForTimeout(300);
  await app.page.keyboard.press('Delete');
  await expect.poll(() => history(app.page), { timeout: 30_000 }).toEqual(['Geöffnet', 'Freihand entfernt']);
  await drag(app.page, at(310, 350), -150 * k, 250 * k);
  await expect.poll(() => history(app.page), { timeout: 30_000 }).toEqual(['Geöffnet', 'Freihand entfernt', 'Element verschoben']);
  const after = await annots(app.page);
  expect(of(after, 'Ink')).toBeUndefined();
  const ft = of(after, 'FreeText');
  expect(ft.content).toBe('Termin mit Revierleitung');
  expect(Math.abs(ft.y - 580)).toBeLessThanOrEqual(4);
});

test('nur anklicken ändert nichts: kein Stand, beim Speichern bleibt alles erhalten', async ({ app }) => {
  await app.open('kommentare.pdf');
  const before = await annots(app.page);
  const { at } = await enterMove(app);
  await app.page.mouse.click(...at(527, 98)); // Notiz
  await app.page.waitForTimeout(800);
  expect(await history(app.page)).toEqual(['Geöffnet']);
  expect(await W(app.page, 'return d.dirty')).toBe(false);
  expect(await annots(app.page)).toEqual(before);
});
