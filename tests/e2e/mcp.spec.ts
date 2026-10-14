// KI-Assistenten (MCP): Werkzeugaufrufe, wie sie über „werkbank mcp“ hereinkommen.
import { test, expect } from './app';

const call = (app: any, name: string, args: any = {}) => app.page.evaluate(([n, a]: any) => (window as any).__wb.mcp.callTool(n, a), [name, args]);
const json = (r: any) => JSON.parse(r.content[0].text);

test('Dokumente auflisten, Text lesen, finden, Seite als Bild', async ({ app }) => {
  await app.open('text.pdf');
  const docs = json(await call(app, 'list_documents'));
  expect(docs).toHaveLength(1);
  expect(docs[0]).toMatchObject({ name: 'text.pdf', pages: 6, active: true });
  const t = (await call(app, 'get_text', { pages: '2' })).content[0].text;
  expect(t).toContain('--- Page 2 ---');
  expect(t).toContain('Kapitel 2');
  const f = json(await call(app, 'find_text', { query: 'IBAN' }));
  expect(f.matches).toBe(18);
  expect(f.hits[0].page).toBe(1);
  const img = await call(app, 'render_page', { page: 1, scale: 0.5 });
  expect(img.content[0].type).toBe('image');
  expect(img.content[0].mimeType).toBe('image/png');
  expect(img.content[0].data.length).toBeGreaterThan(1000);
});

test('Markieren per Suchbegriff und Notiz: je ein Stand, als Anmerkungen im PDF', async ({ app }) => {
  await app.open('text.pdf');
  const r = json(await call(app, 'add_comment', { type: 'highlight', find: 'Kapitel 3' }));
  expect(r).toMatchObject({ added: 'highlight', matches: 1, pages: [3] });
  const n = json(await call(app, 'add_comment', { type: 'note', find: 'Tabelle 1', text: 'Bitte prüfen' }));
  expect(n.page).toBe(1);
  const hist = await app.page.evaluate(() => { const d = (window as any).__wb.active(); return d.history.slice(0, d.pos + 1).map((h: any) => h.label); });
  expect(hist).toEqual(['Geöffnet', 'Markierung eingefügt', 'Notiz eingefügt']);
  const annots = await app.page.evaluate(async () => {
    const W = (window as any).__wb; const p = await W.openPdf(await W.active().baked());
    const out: string[] = [];
    for (let i = 1; i <= p.numPages; i++) for (const a of await (await p.getPage(i)).getAnnotations()) out.push(`${i}:${a.subtype}`);
    return out;
  });
  expect(annots.filter(a => !a.endsWith('Popup')).sort()).toEqual(['1:Text', '3:Highlight']);
  const miss = await call(app, 'add_comment', { type: 'highlight', find: 'gibt es nicht' });
  expect(miss.isError).toBe(true);
  expect(miss.content[0].text).toContain('not found');
  // Rückgängig nimmt den letzten Schritt zurück
  await call(app, 'undo');
  expect(await app.page.evaluate(() => (window as any).__wb.active().objects.length)).toBe(1);
});

test('Formularfelder auflisten und ausfüllen', async ({ app }) => {
  await app.open('form.pdf');
  const fields = json(await call(app, 'list_form_fields'));
  expect(fields.length).toBeGreaterThan(0);
  const textField = fields.find((f: any) => f.type === 'Text');
  const r = json(await call(app, 'fill_form', { values: { [textField.name]: 'Erika Mustermann', Gibtsnicht: 'x' } }));
  expect(r.filled).toEqual([textField.name]);
  expect(r.unknown).toEqual(['Gibtsnicht']);
  const after = json(await call(app, 'list_form_fields'));
  expect(after.find((f: any) => f.name === textField.name).value).toBe('Erika Mustermann');
});

test('Werkzeuge: Liste ohne Fensterwerkzeuge, Seitenzahlen ausführen, unbekanntes meldet Fehler', async ({ app }) => {
  await app.open('text.pdf');
  const tools = json(await call(app, 'list_tools'));
  const ids = tools.map((t: any) => t.tool);
  expect(ids).toContain('page-numbers');
  expect(ids).toContain('rotate-right');
  expect(ids).not.toContain('merge');      // braucht Dateiauswahl
  expect(ids).not.toContain('settings');
  expect(ids).not.toContain('text-edit');  // Bearbeitungsmodus im Fenster
  const pn = tools.find((t: any) => t.tool === 'page-numbers');
  expect(pn.parameters.pos.enum).toContain('bc');
  const r = json(await call(app, 'run_tool', { tool: 'page-numbers', values: { fmt: '{n} / {N}', farbe: 'rot' } }));
  expect(r).toMatchObject({ tool: 'page-numbers', changed: true, pages: 6, ignored: ['farbe'] });
  const t4 = (await call(app, 'get_text', { pages: '4' })).content[0].text;
  expect(t4).toContain('4 / 6');
  const bad = await call(app, 'run_tool', { tool: 'zaubern' });
  expect(bad.isError).toBe(true);
  const win = await call(app, 'run_tool', { tool: 'settings' });
  expect(win.isError).toBe(true);
});

test('Infos über das Dokument; ohne offenes Dokument eine verständliche Meldung', async ({ app }) => {
  const none = await call(app, 'get_text');
  expect(none.isError).toBe(true);
  expect(none.content[0].text).toContain('open_document');
  await app.open('outline.pdf');
  const i = json(await call(app, 'get_info'));
  expect(i).toMatchObject({ name: 'outline.pdf', pages: 5, bookmarks: 5, signatures: 0 });
});

test('Einstellungen: KI-Steuerung ist aus und im Browser nicht einschaltbar', async ({ app }) => {
  await app.page.getByRole('button', { name: 'Einstellungen' }).click();
  const sw = app.page.locator('label.row', { hasText: 'Steuerung durch KI-Assistenten erlauben' }).locator('input');
  await expect(sw).not.toBeChecked();
  await expect(sw).toBeDisabled();
  await expect(app.page.getByText('Nur in der Desktop-App verfügbar.')).toBeVisible();
});
