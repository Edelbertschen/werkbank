// Schneller Start der PDF-Engine: zuerst nur der Kern (PyMuPDF), alles Weitere erst, wenn ein Werkzeug es braucht.
import { test, expect } from './app';

test('Kern lädt ohne OpenCV/NumPy; Word-Export holt den Rest nach und funktioniert', async ({ app }) => {
  const wheels: string[] = [];
  app.page.context().on('request', r => { const m = r.url().match(/\/engines\/pymupdf\/([^/?]+\.whl)/); if (m) wheels.push(m[1]); });
  await app.open('text.pdf');
  const r = await app.page.evaluate(async () => (await (window as any).__wb.pyRun(`json.dumps(len(open_in()))`, { files: { 'in.pdf': (window as any).__wb.active().bytes } })).result);
  expect(r).toBe('6');
  expect(wheels.some(w => w.startsWith('pymupdf-'))).toBe(true);
  expect(wheels.filter(w => /opencv|numpy|pdf2docx|lxml/.test(w))).toEqual([]);

  // Wrapper-Aufruf: lädt die übrigen Pakete in denselben Interpreter
  const out = await app.page.evaluate(async () => {
    const W = (window as any).__wb;
    const md: string = await W.py('pdfToMarkdown', W.active().bytes);
    return md.slice(0, 200);
  });
  expect(out).toContain('Kapitel 1');
  expect(wheels.some(w => w.startsWith('numpy-'))).toBe(true);
  // Kernskripte laufen danach weiter
  const again = await app.page.evaluate(async () => (await (window as any).__wb.pyRun(`json.dumps(open_in()[0].get_text()[:9])`, { files: { 'in.pdf': (window as any).__wb.active().bytes } })).result);
  expect(JSON.parse(again)).toContain('Kapitel');
});

test('PDF-Engine lädt gleich nach dem Start still im Hintergrund; sichtbar nur, wenn etwas darauf wartet', async ({ app }) => {
  const W = (fn: string) => app.page.evaluate(`(async () => { const W = window.__wb; ${fn} })()`);
  // still vorladen: Zustand „preloading“, keine Ladeanzeige in der Statusleiste
  await expect.poll(() => W('return W.engineState.get("pymupdf")'), { timeout: 5_000 }).toMatch(/preloading|ready/);
  await expect(app.page.locator('.status .eng')).toHaveCount(0);
  // jetzt wartet eine Aktion darauf → Anzeige erscheint (falls noch nicht fertig) und verschwindet danach
  const state = await W('const p = W.pyRun("json.dumps(1)"); const s = W.engineState.get("pymupdf"); await p; return s;');
  expect(['loading', 'ready']).toContain(state);
  await expect(app.page.locator('.status .eng')).toHaveCount(0);
  expect(await W('return W.engineState.get("pymupdf")')).toBe('ready');
});
