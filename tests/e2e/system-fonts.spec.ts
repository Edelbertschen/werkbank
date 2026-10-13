// Installierte Schrift gleichen Namens beim Text bearbeiten: Vorschau und Ergebnis in genau dieser Schrift.
// Die Desktop-App fragt das Betriebssystem; im Testbuild gibt window.__wbSystemFonts die „installierten“ Schriften vor.
import { test, expect } from './app';
import { readFileSync } from 'node:fs';

const font = (f: string) => readFileSync(`node_modules/pdfjs-dist/standard_fonts/${f}`).toString('base64');

async function linesOf(app: any): Promise<[string, string][]> {
  return app.page.evaluate(async () => {
    const W = (window as any).__wb;
    const r = await W.pyRun(`
import json
out = []
for b in open_in()[0].get_text('dict')['blocks']:
    for l in b.get('lines', []):
        t = ''.join(s['text'] for s in l['spans']).replace('\\xa0', ' ').strip()
        if t:
            out.append([t, max(l['spans'], key=lambda s: len(s['text']))['font']])
json.dumps(out)
`, { files: { 'in.pdf': W.active().bytes } });
    return JSON.parse(r.result);
  });
}

async function editHiermit(app: any, typed: string) {
  const page = app.page;
  await app.open('formular.pdf');
  await app.runTool('zoom-page'); await page.waitForTimeout(600);
  const box = (await page.locator('.page[data-page-number="1"]').boundingBox())!;
  await app.tab('Bearbeiten'); await page.locator('.ribbon button[aria-label="Text bearbeiten"]').first().click();
  await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 112 / 842);
  await page.keyboard.press('Control+a');
  await page.keyboard.type(typed);
}
async function apply(app: any) {
  await app.page.keyboard.press('Escape');
  await app.page.locator('.cbar button', { hasText: 'Übernehmen' }).click();
  await app.idle();
  await expect.poll(async () => (await app.page.evaluate(() => (window as any).__wb.active().history.length)), { timeout: 60_000 }).toBe(2);
}
const NEW = 'Hiermit erkläre ich mich einverstanden, dass mein Kind an der Klassenfahrt nach Rust teilnimmt. Die Kosten betragen 275 Euro.';

test('installierte Schrift gleichen Namens wird für Vorschau und Ergebnis verwendet', async ({ app }) => {
  await app.page.addInitScript(f => { (window as any).__wbSystemFonts = f; }, { LiberationSans: font('LiberationSans-Regular.ttf') });
  await app.page.reload(); await app.page.waitForFunction(() => (window as any).__wb);
  await editHiermit(app, NEW);
  const tx = app.page.locator('.item.textedit .tx').first();
  await expect.poll(() => tx.evaluate((e: HTMLElement) => getComputedStyle(e).fontFamily)).toMatch(/wb-sys-/);
  await apply(app);
  const after = await linesOf(app);
  const edited = after.filter(([t]) => /275 Euro|Klassenfahrt/.test(t));
  expect(edited.length).toBeGreaterThan(0);
  for (const [, f] of edited) expect(f).toMatch(/Liberation/);
});

test('ohne installierte Schrift: passende Ersatzschrift', async ({ app }) => {
  await editHiermit(app, NEW);
  await apply(app);
  const edited = (await linesOf(app)).filter(([t]) => /275 Euro|Klassenfahrt/.test(t));
  expect(edited.length).toBeGreaterThan(0);
  for (const [, f] of edited) expect(f).toMatch(/Nimbus.*Sans|Helvetica/);
});
