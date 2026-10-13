// Text bearbeiten in einem echten Formular (aus LibreOffice, eingebettete Teilschriften):
// Nur der geänderte Absatz darf sich ändern, und er behält Schriftfamilie und Strichstärke.
import { test, expect } from './app';

const UNTOUCHED = ['Hiermit erkläre ich mich damit einverstanden', 'Die Kosten betragen voraussichtlich', 'Ziel der Fahrt', 'Europa-Park, Übernachtung in 3er-Zimmern', 'Aktenzeichen: KL-7b/2026'];

/** Zeilen der ersten Seite mit Schriftname, gelesen mit PyMuPDF */
async function lines(app: any, bytes?: string): Promise<[string, string][]> {
  return app.page.evaluate(async () => {
    const W = (window as any).__wb;
    const r = await W.pyRun(`
import json
doc = open_in()
out = []
for b in doc[0].get_text('dict')['blocks']:
    for l in b.get('lines', []):
        t = ''.join(s['text'] for s in l['spans']).replace('\\xa0', ' ').strip()
        if t:
            out.append([t, max(l['spans'], key=lambda s: len(s['text']))['font']])
json.dumps(out)
`, { files: { 'in.pdf': await W.active().baked() } });
    return JSON.parse(r.result);
  });
}

/** Anteil abweichender Bildpunkte außerhalb eines Streifens (y0..y1 in pt) zwischen Ausgangs- und aktuellem Stand */
async function changedOutside(app: any, y0: number, y1: number): Promise<number> {
  return app.page.evaluate(async ([y0, y1]: number[]) => {
    const W = (window as any).__wb; const d = W.active();
    const r = await W.pyRun(`
a = pymupdf.open('/w/a.pdf')[0]; b = pymupdf.open('/w/b.pdf')[0]
W, H = a.rect.width, a.rect.height
diff = tot = 0
for clip in (pymupdf.Rect(0, 0, W, ${y0}), pymupdf.Rect(0, ${y1}, W, H)):
    pa = a.get_pixmap(dpi=72, clip=clip).samples; pb = b.get_pixmap(dpi=72, clip=clip).samples
    tot += len(pa); diff += sum(1 for i in range(0, len(pa), 3) if pa[i] != pb[i]) * 3
diff / tot
`, { files: { 'a.pdf': d.history[0].bytes, 'b.pdf': await d.baked() } });
    return r.result;
  }, [y0, y1]);
}

async function editAt(app: any, fy: number, newText: string, preview?: { family: RegExp; weight: string }) {
  const page = app.page;
  await app.runTool('zoom-page'); await page.waitForTimeout(600);
  const box = (await page.locator('.page[data-page-number="1"]').boundingBox())!;
  await app.tab('Bearbeiten'); await page.locator('.ribbon button[aria-label="Text bearbeiten"]').first().click();
  await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * fy);
  if (preview) {
    // Schon beim Tippen in passender Schrift
    const tx = page.locator('.item.textedit .tx').first();
    await expect(tx).toBeVisible();
    const st = await tx.evaluate((e: HTMLElement) => ({ family: getComputedStyle(e).fontFamily, weight: getComputedStyle(e).fontWeight }));
    expect(st.family).toMatch(preview.family);
    expect(st.weight).toBe(preview.weight);
  }
  await page.keyboard.press('Control+a');
  await page.keyboard.type(newText);
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => (window as any).__wb.active().pos), { timeout: 60_000 }).toBe(1);
}

test('Serifen-Absatz ändern: Schrift bleibt Serif, Rest der Seite unverändert', async ({ app }) => {
  await app.open('formular.pdf');
  const before = await lines(app);
  await editAt(app, 182 / 842, 'Bitte geben Sie diese Erklärung bis spätestens Donnerstag beim Klassenlehrer ab. Ohne Unterschrift ist eine Teilnahme nicht möglich.', { family: /Times/, weight: '400' });
  const after = await lines(app);

  const edited = after.filter(([t]) => /Donnerstag|Teilnahme nicht/.test(t));
  expect(edited.length).toBeGreaterThan(0);
  for (const [, font] of edited) expect(font).toMatch(/Times|Serif|Roman/i);
  expect(after.some(([t]) => t.includes('Freitag'))).toBe(false);

  // Alle anderen Zeilen: gleicher Text, gleiche Schrift
  for (const start of UNTOUCHED) {
    const a = before.find(([t]) => t.startsWith(start)), b = after.find(([t]) => t.startsWith(start));
    expect(b, start).toEqual(a);
  }
  expect(after.filter(([t]) => t.startsWith('Schriftliche') || t.startsWith('Teilnahme an') || t === 'der Schule')).toEqual(before.filter(([t]) => t.startsWith('Schriftliche') || t.startsWith('Teilnahme an') || t === 'der Schule'));
  // Und sie sehen genauso aus wie vorher (keine Kästchen, keine fehlenden Zeichen)
  expect(await changedOutside(app, 168, 210)).toBeLessThan(0.001);
});

test('fette Überschrift ändern: bleibt fett und serifenlos', async ({ app }) => {
  await app.open('formular.pdf');
  await editAt(app, 45 / 842, 'Schriftliche Erklärung der Eltern zur Teilnahme an einer außerunterrichtlichen Veranstaltung der Schule', { family: /Helvetica|Arial/, weight: '700' });
  const after = await lines(app);
  const head = after.filter(([t]) => /Eltern|Veranstaltung/.test(t));
  expect(head.length).toBeGreaterThan(0);
  for (const [, font] of head) { expect(font).toMatch(/Bold/i); expect(font).not.toMatch(/Times|Serif|Courier/i); }
  for (const start of UNTOUCHED) expect(after.some(([t]) => t.startsWith(start)), start).toBe(true);
  expect(await changedOutside(app, 30, 98)).toBeLessThan(0.001);
});

test('sofort nach dem Klick tippen geht auch bei langsamem Rechner nicht verloren', async ({ app }) => {
  await app.open('formular.pdf');
  await app.runTool('zoom-page'); await app.page.waitForTimeout(600);
  const box = (await app.page.locator('.page[data-page-number="1"]').boundingBox())!;
  await app.tab('Bearbeiten'); await app.page.locator('.ribbon button[aria-label="Text bearbeiten"]').first().click();
  const cdp = await app.page.context().newCDPSession(app.page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  await app.page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 222 / 842);
  await app.page.keyboard.press('Control+a');
  await app.page.keyboard.type('Aktenzeichen: KL-8a/2027');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await expect(app.page.locator('.item.textedit .tx').first()).toHaveText('Aktenzeichen: KL-8a/2027');
  await app.page.keyboard.press('Escape');
  await expect.poll(() => app.page.evaluate(() => (window as any).__wb.active().pos), { timeout: 60_000 }).toBe(1);
  const after = await lines(app);
  const row = after.find(([t]) => t.startsWith('Aktenzeichen'))!;
  expect(row[0]).toBe('Aktenzeichen: KL-8a/2027');
  expect(row[1]).toMatch(/Courier|Mono/i);
});
