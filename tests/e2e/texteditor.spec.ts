// Texteditor: Schrift sehen und wählen, Ersatzschrift kenntlich, Formatierung einzelner Wörter und ganzer Blöcke.
import { test, expect } from './app';
import { readFileSync } from 'node:fs';

const font = (f: string) => readFileSync(`node_modules/pdfjs-dist/standard_fonts/${f}`).toString('base64');

/** Textstücke der ersten Seite, wie gespeichert: [Text, Schrift, Größe, Farbe, x0, x1] */
async function spans(app: any): Promise<[string, string, number, string, number, number][]> {
  return app.page.evaluate(async () => {
    const W = (window as any).__wb; const d = W.active();
    const r = await W.pyRun(`
import json
out = []
for b in open_in()[0].get_text('dict')['blocks']:
    for l in b.get('lines', []):
        for s in l['spans']:
            t = s['text'].replace('\\xa0', ' ').strip()
            if t:
                out.append([t, s['font'], round(s['size'], 1), '#%06x' % s['color'], round(s['bbox'][0]), round(s['bbox'][2])])
json.dumps(out)
`, { files: { 'in.pdf': await d.baked() } });
    return JSON.parse(r.result);
  });
}
const pos = (app: any) => app.page.evaluate(() => (window as any).__wb.active().pos);

async function setup(app: any, file: string) {
  await app.open(file);
  await app.runTool('zoom-page'); await app.page.waitForTimeout(500);
  const b = (await app.page.locator('.page[data-page-number="1"]').boundingBox())!;
  const k = b.width / 595;
  return { at: (x: number, y: number) => [b.x + x * k, b.y + y * k] as [number, number], k };
}
async function tool(app: any, tab: string, label: string) {
  await app.tab(tab); await app.page.locator(`.ribbon button[aria-label="${label}"]`).first().click();
}
const bar = (app: any) => app.page.locator('.ttb');

test('Schrift des Absatzes wird angezeigt; Ersatzschrift ist kenntlich gemacht', async ({ app }) => {
  const { at } = await setup(app, 'formular.pdf');
  await tool(app, 'Bearbeiten', 'Text bearbeiten');
  await app.page.mouse.click(...at(120, 182));
  await expect(bar(app)).toBeVisible();
  await expect(bar(app).locator('select[aria-label="Schriftart"] option:checked')).toContainText('LiberationSerif');
  const state = bar(app).locator('.fstate');
  await expect(state).toHaveAttribute('data-state', 'substitute');
  await expect(state).toContainText('Ersatz');
  await expect(app.page.locator('.item.textedit .subst')).toBeVisible();
});

test('installierte Schrift gleichen Namens: Status „installiert“, kein Ersatz-Hinweis', async ({ app }) => {
  await app.page.addInitScript(f => { (window as any).__wbSystemFonts = f; }, { LiberationSans: font('LiberationSans-Regular.ttf') });
  await app.page.reload(); await app.page.waitForFunction(() => (window as any).__wb);
  const { at } = await setup(app, 'formular.pdf');
  await tool(app, 'Bearbeiten', 'Text bearbeiten');
  await app.page.mouse.click(...at(120, 112));
  await expect(bar(app).locator('.fstate')).toHaveAttribute('data-state', 'installed', { timeout: 20_000 });
  await expect(app.page.locator('.item.textedit .subst')).toHaveCount(0);
});

test('andere Schrift für einen Absatz wählen', async ({ app }) => {
  const { at } = await setup(app, 'formular.pdf');
  await tool(app, 'Bearbeiten', 'Text bearbeiten');
  await app.page.mouse.click(...at(120, 182));
  await bar(app).locator('select[aria-label="Schriftart"]').selectOption({ label: 'Courier' });
  await app.page.keyboard.press('Escape');
  await expect.poll(() => pos(app), { timeout: 30_000 }).toBe(1);
  const s = (await spans(app)).filter(x => /Bitte geben|möglich/.test(x[0]));
  expect(s.length).toBeGreaterThan(0);
  for (const x of s) expect(x[1]).toMatch(/Courier|Mono/i);
});

test('einzelnes Wort fett und rot, der Rest bleibt normal', async ({ app }) => {
  const { at } = await setup(app, 'bild.pdf');
  await tool(app, 'Bearbeiten', 'Text hinzufügen');
  await app.page.mouse.click(...at(80, 420));
  await app.page.keyboard.type('Hallo schöne Welt');
  // „Welt“ markieren: Doppelklick auf das Wort
  // Lage des Wortes im Textfeld bestimmen und darauf doppelklicken
  const w = await app.page.locator('.item.text .tx').first().evaluate((el: HTMLElement) => {
    const node = el.firstChild!; const r = document.createRange(); const i = node.textContent!.indexOf('Welt');
    r.setStart(node, i); r.setEnd(node, i + 4); const b = r.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  });
  await app.page.mouse.dblclick(w.x, w.y);
  expect(await app.page.evaluate(() => getSelection()!.toString().trim())).toBe('Welt');
  await bar(app).locator('button[aria-label="Fett"]').click();
  await bar(app).locator('input[aria-label="Textfarbe"]').evaluate((el: HTMLInputElement) => { el.value = '#cc0000'; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
  await app.page.keyboard.press('Escape');
  await expect.poll(() => pos(app), { timeout: 30_000 }).toBeGreaterThan(0);
  const s = await spans(app);
  const welt = s.find(x => x[0] === 'Welt')!, hallo = s.find(x => x[0].startsWith('Hallo'))!;
  expect(welt[1]).toMatch(/Bold/);
  expect(welt[3]).toBe('#cc0000');
  expect(hallo[1]).not.toMatch(/Bold/);
  expect(hallo[3]).not.toBe('#cc0000');
});

test('Größe und Ausrichtung gelten ohne Auswahl für den ganzen Textblock', async ({ app }) => {
  const { at } = await setup(app, 'bild.pdf');
  await tool(app, 'Bearbeiten', 'Text hinzufügen');
  await app.page.mouse.click(...at(80, 420));
  await app.page.keyboard.type('Mitte');
  await app.page.keyboard.press('Escape');
  await expect(bar(app)).toBeVisible();
  const size = bar(app).locator('input[aria-label="Schriftgröße"]');
  await size.fill('20'); await size.press('Enter');
  await bar(app).locator('button[aria-label="Zentriert"]').click();
  await expect.poll(() => pos(app), { timeout: 30_000 }).toBeGreaterThan(1);
  const it = await app.page.evaluate(() => { const W = (window as any).__wb; return JSON.parse(JSON.stringify(W.overlay.itemsOf(W.active())[0])); });
  const s = (await spans(app)).find(x => x[0] === 'Mitte')!;
  expect(s[2]).toBe(20);
  const boxMid = (it.x + it.w / 2) * 595, textMid = (s[4] + s[5]) / 2;
  expect(Math.abs(boxMid - textMid)).toBeLessThan(6);
});

test('Kursiv per Strg+I; Einfügen bringt nur den reinen Text mit', async ({ app }) => {
  const { at } = await setup(app, 'bild.pdf');
  await tool(app, 'Bearbeiten', 'Text hinzufügen');
  await app.page.mouse.click(...at(80, 420));
  await app.page.keyboard.type('Schräg');
  await app.page.keyboard.press('Control+a');
  await app.page.keyboard.press('Control+i');
  await app.page.keyboard.press('End');
  await app.page.locator('.item.text .tx').first().evaluate((el: HTMLElement) => {
    const dt = new DataTransfer();
    dt.setData('text/html', '<b style="color:#00ff00;font-size:40px">Eingefügt</b>');
    dt.setData('text/plain', ' Eingefügt');
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await app.page.keyboard.press('Escape');
  await expect.poll(() => pos(app), { timeout: 30_000 }).toBeGreaterThan(0);
  const s = await spans(app);
  const schraeg = s.find(x => x[0].startsWith('Schräg'))!;
  expect(schraeg[1]).toMatch(/Italic|Oblique/);
  const ein = s.find(x => x[0].includes('Eingefügt'))!;
  expect(ein[3]).not.toBe('#00ff00');
  expect(ein[2]).toBeLessThan(20);
});
