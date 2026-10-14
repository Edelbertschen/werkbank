// Zusammenführen, Einfügen, Extrahieren und Aufteilen: nichts geht still verloren.
// reich.pdf hat interne Links, ein benanntes Ziel, eine Webadresse, Formularfelder, eine Ebene, einen Anhang und Lesezeichen.
import { test, expect, FX } from './app';
import { readFileSync } from 'node:fs';

const b64 = (n: string) => readFileSync(FX(n)).toString('base64');

/** Was im PDF steckt: Links je Seite (Art, Zielseite, Adresse), Felder, Ebenen, Anhänge, Lesezeichen */
async function inspect(page: any, expr: string) {
  return page.evaluate(`(async () => {
    const W = window.__wb; const bytes = ${expr};
    const r = await W.pyRun(\`
import json
d = open_in()
links = {}
for i, p in enumerate(d):
    ls = [[l['kind'], l.get('page', -1), l.get('uri', '')] for l in p.get_links()]
    if ls: links[str(i)] = ls
fields = {w.field_name: str(w.field_value) for p in d for w in p.widgets()}
layered = [i for i, p in enumerate(d) if 'Nur in der Ebene' in p.get_text()]
json.dumps({'pages': d.page_count, 'links': links, 'fields': fields, 'ocgs': [v['name'] for v in d.get_ocgs().values()], 'layered': layered, 'files': d.embfile_names(), 'toc': d.get_toc()})
\`, { files: { 'in.pdf': bytes } });
    return JSON.parse(r.result); })()`);
}
async function load(app: any) {
  await app.page.evaluate(([r, t]: string[]) => {
    const B = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
    (window as any).__F = { reich: B(r), text: B(t) };
  }, [b64('reich.pdf'), b64('text.pdf')]);
}
const run = (app: any, id: string, js: string) => app.page.evaluate(async ([id, js]: string[]) => {
  const W = (window as any).__wb, F = (window as any).__F; W.app.toasts.splice(0);
  const ok = await W.actions.runTool(W.tool(id), eval('(' + js + ')'));
  return { ok, toasts: W.app.toasts.map((x: any) => x.text) };
}, [id, js]);
const GOTO = 1, URI = 2;

test('Zusammenführen: Links zeigen auf die richtigen Seiten, Felder, Ebene, Anhang und Lesezeichen bleiben', async ({ app }) => {
  await app.open('text.pdf'); await load(app);
  const r = await run(app, 'merge', `{ docs: [{ id: 't', name: 'text.pdf', bytes: F.text }, { id: 'r', name: 'reich.pdf', bytes: F.reich }], name: 'Gesamt', bookmarks: true }`);
  expect(r.ok, r.toasts.join()).toBe(true);
  const i = await inspect(app.page, 'W.active().bytes');
  expect(i.pages).toBe(10);
  // reich beginnt auf Seite 7 (Index 6): Link „Zu Seite 3“ → Index 8, benanntes Ziel → Index 9
  const kinds = i.links['6'].map((l: any[]) => [l[0], l[1]]);
  expect(kinds).toContainEqual([GOTO, 8]);
  expect(kinds).toContainEqual([GOTO, 9]);
  expect(i.links['6'].some((l: any[]) => l[0] === URI && l[2] === 'https://example.com/werkbank')).toBe(true);
  expect(i.fields).toEqual({ Name: 'Erika', Zustimmung: 'Yes' });
  expect(i.ocgs).toEqual(['Ebene Massstab']);
  expect(i.layered).toEqual([8]);
  expect(i.files).toEqual(['daten.csv']);
  expect(i.toc).toEqual([[1, 'text', 1], [1, 'reich', 7], [2, 'Links', 7], [2, 'Formular', 8], [2, 'Ebene', 9], [2, 'Ziel', 10]]);
});

test('Seiten aus Datei einfügen: eingefügte Links folgen, eigene Lesezeichen verschieben sich mit', async ({ app }) => {
  await app.open('outline.pdf'); await load(app);
  const r = await run(app, 'insert-file', `{ src: [{ id: 'r', name: 'reich.pdf', bytes: F.reich }], where: 'start' }`);
  expect(r.ok, r.toasts.join()).toBe(true);
  const i = await inspect(app.page, 'W.active().bytes');
  expect(i.pages).toBe(9);
  expect(i.links['0'].map((l: any[]) => [l[0], l[1]])).toContainEqual([GOTO, 2]);
  expect(i.fields).toEqual({ Name: 'Erika', Zustimmung: 'Yes' });
  expect(i.files).toEqual(['daten.csv']);
  expect(i.toc.map((e: any[]) => [e[1], e[2]])).toEqual([['Links', 1], ['Formular', 2], ['Ebene', 3], ['Ziel', 4], ['Einleitung', 5], ['Methoden', 6], ['Inventur', 7], ['Ergebnisse', 8], ['Anhang', 9]]);
});

test('Extrahieren: Links auf mitgenommene Seiten zeigen dorthin; Ebene, Anhang, Lesezeichen bleiben', async ({ app }) => {
  await app.page.evaluate(async (d: string) => { await (window as any).__wb.actions.openBytes('reich.pdf', Uint8Array.from(atob(d), c => c.charCodeAt(0)), null); }, b64('reich.pdf'));
  await app.idle();
  const r = await run(app, 'extract', `{ pages: { mode: 'range', range: '1,3-4' }, each: false, remove: false }`);
  expect(r.ok, r.toasts.join()).toBe(true);
  const i = await inspect(app.page, 'W.active().bytes');
  expect(i.pages).toBe(3);
  const kinds = i.links['0'].map((l: any[]) => [l[0], l[1]]);
  expect(kinds).toContainEqual([GOTO, 1]);
  expect(kinds.some((k: number[]) => k[1] === 2)).toBe(true); // benanntes Ziel → Seite 3 des Auszugs
  expect(i.ocgs).toEqual(['Ebene Massstab']);
  expect(i.layered).toEqual([1]);
  expect(i.files).toEqual(['daten.csv']);
  expect(i.toc.map((e: any[]) => e[1])).toEqual(['Links', 'Ebene', 'Ziel']);
});

test('Aufteilen in Einzelseiten: Formular bleibt ausfüllbar, keine Links ins Leere', async ({ app }) => {
  await app.page.evaluate(async (d: string) => { await (window as any).__wb.actions.openBytes('reich.pdf', Uint8Array.from(atob(d), c => c.charCodeAt(0)), null); }, b64('reich.pdf'));
  await app.idle();
  const r = await run(app, 'split', `{ mode: 'each', out: 'tabs' }`);
  expect(r.ok, r.toasts.join()).toBe(true);
  const parts = await app.page.evaluate(() => (window as any).__wb.app.docs.length);
  expect(parts).toBe(5);
  const p1 = await inspect(app.page, 'W.app.docs[1].bytes');
  for (const l of p1.links['0'] || []) if (l[0] === GOTO) expect(l[1]).toBeLessThan(p1.pages);
  const p2 = await inspect(app.page, 'W.app.docs[2].bytes');
  expect(p2.fields).toEqual({ Name: 'Erika', Zustimmung: 'Yes' });
  expect(p2.files).toEqual(['daten.csv']);
});

test('Leere Seiten bleiben eigenständige Seiten, auch nachdem Elemente eingeschrieben wurden', async ({ app }) => {
  await app.page.evaluate(async () => { await (window as any).__wb.actions.newBlankDoc(); });
  await app.idle();
  await run(app, 'insert-blank', `{ where: 'end', count: 2, size: 'same' }`);
  const r = await app.page.evaluate(async () => {
    const W = (window as any).__wb; const d = W.active();
    W.overlay.addItem(d, { kind: 'rect', page: 0, x: 0.1, y: 0.1, w: 0.2, h: 0.1, stroke: '#E5484D', fill: 'transparent', width: 2, opacity: 1 });
    const baked = await d.baked();
    const p = await W.openPdf(baked);
    const refs = [];
    for (let i = 1; i <= p.numPages; i++) refs.push((await p.getPage(i)).ref.num);
    return { pages: p.numPages, unique: new Set(refs).size };
  });
  expect(r).toEqual({ pages: 3, unique: 3 });
});

test('Grundfälle: Seiten 2 und 4 extrahieren, nach Bereichen und in Einzelseiten aufteilen', async ({ app }) => {
  await app.open('long.pdf');
  const pages = await app.page.evaluate(() => (window as any).__wb.active().numPages);
  const label = async (expr: string) => app.page.evaluate(`(async () => { const W = window.__wb; const p = await W.openPdf(${expr}); const out = []; for (let i = 1; i <= p.numPages; i++) out.push((await (await p.getPage(i)).getTextContent()).items.map(x => x.str).join(' ').match(/\\b(Seite|Kapitel) \\d+/)?.[0] || ''); return out; })()`);
  const orig = await label('W.active().bytes');
  let r = await run(app, 'extract', `{ pages: { mode: 'range', range: '2,4' }, each: false, remove: false }`);
  expect(r.ok, r.toasts.join()).toBe(true);
  expect(await label('W.active().bytes')).toEqual([orig[1], orig[3]]);
  await app.page.evaluate(() => { const W = (window as any).__wb; W.actions.activate(W.app.docs[0]); });
  r = await run(app, 'split', `{ mode: 'ranges', ranges: '1-2; 3-${pages}', out: 'tabs' }`);
  expect(r.ok, r.toasts.join()).toBe(true);
  const n = await app.page.evaluate(() => (window as any).__wb.app.docs.length);
  expect(await label(`W.app.docs[${n - 2}].bytes`)).toEqual(orig.slice(0, 2));
  expect(await label(`W.app.docs[${n - 1}].bytes`)).toEqual(orig.slice(2));
});
