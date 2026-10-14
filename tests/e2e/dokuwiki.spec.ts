// Export im DokuWiki-Markup: Struktur aus der Erkennung, Bilder als Mediendateien.
import { test, expect } from './app';

async function exportDw(app: any, values: Record<string, any>) {
  return app.page.evaluate(async (v: any) => {
    const W = (window as any).__wb; const d = W.active(); const t = W.tool('to-dokuwiki');
    const vals = { images: false, ns: '', breaks: false, pages: { mode: 'all', range: '' }, ...v };
    const r = await t.run(vals, { doc: d, bytes: await d.baked(), current: 0, selection: [], progress: () => {} });
    const files = await Promise.all((r.files || []).map(async (f: any) => ({ name: f.name, text: f.name.endsWith('.txt') ? await (f.data instanceof Blob ? f.data.text() : new TextDecoder().decode(f.data)) : null, size: f.data.size ?? f.data.length })));
    return { files, zip: r.zipName || null, message: r.message || null };
  }, values);
}

test('Text mit Überschriften wird zu einer DokuWiki-Seite', async ({ app }) => {
  await app.open('text.pdf');
  const r = await exportDw(app, { breaks: true });
  expect(r.files).toHaveLength(1);
  expect(r.files[0].name).toMatch(/\.txt$/);
  const t: string = r.files[0].text;
  expect(t).toMatch(/^=+ .*Kapitel 1.* =+$/m);   // Überschrift in DokuWiki-Form
  expect(t).not.toMatch(/^#{1,6} /m);             // keine Markdown-Reste
  expect(t).toContain('max.mustermann@example.com');
  expect(t).toMatch(/^----$/m);                   // Seitenumbrüche
});

test('mit Bildern: Seite plus Mediendateien, Verweise mit Namensraum', async ({ app }) => {
  await app.open('bild.pdf');
  const r = await exportDw(app, { images: true, ns: 'Projekte:Wald' });
  expect(r.zip).toMatch(/\.zip$/);
  const imgs = r.files.filter((f: any) => !f.name.endsWith('.txt'));
  expect(imgs.length).toBeGreaterThan(0);
  expect(imgs[0].name).toMatch(/^bild_bild1\.(png|jpg)$/);
  const page = r.files.find((f: any) => f.name.endsWith('.txt')).text;
  expect(page).toContain(`{{:projekte:wald:${imgs[0].name}`);
  expect(page).not.toContain('data:image');
});

test('DokuWiki steht unter „Analysieren“ und „Umwandeln“ in der Bandleiste', async ({ app }) => {
  await app.open('text.pdf');
  await app.tab('Analysieren');
  await expect(app.page.locator('.ribbon button[aria-label="Als DokuWiki exportieren"]')).toBeVisible();
  await app.tab('Umwandeln');
  await expect(app.page.locator('.ribbon button[aria-label="Als DokuWiki exportieren"]')).toBeVisible();
});
