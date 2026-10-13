// Jedes Werkzeug läuft mit seinen Vorgaben durch – mit echten Engines.
import { test, expect } from './app';

// Werkzeuge, die bewusst eine Eingabe verlangen, Dialoge öffnen oder die Sitzung beenden
const SKIP = new Set(['open', 'close', 'print', 'present', 'fullscreen', 'palette', 'settings', 'batch', 'compare', 'make-cert', 'sign-digital', 'verify']);
const NEEDS_INPUT: Record<string, RegExp> = {
  'find-redact': /Begriffe/, toc: /Lesezeichen/, protect: /Passwort/, 'save-protected-copy': /Passwort/,
};

test('alle Werkzeuge laufen mit ihren Vorgaben', async ({ app }) => {
  test.setTimeout(900_000);
  await app.open('text.pdf');
  const stop = app.dismissDialogs();
  const ids: { id: string; needs: string[] }[] = await app.page.evaluate(() => (window as any).__wb.TOOLS
    .filter((t: any) => t.run && !t.mode && !t.panel)
    .map((t: any) => ({ id: t.id, needs: (t.fields || []).filter((f: any) => ['files', 'doc', 'docs'].includes(f.type)).map((f: any) => f.key) })));
  const failures: string[] = [];
  for (const { id, needs } of ids) {
    if (SKIP.has(id) || needs.length) continue;
    await app.page.evaluate(async () => { const W = (window as any).__wb; const d = W.active(); if (d.pos !== 0) await d.goto(0); const docs = W.app.docs; while (docs.length > 1) docs.pop().destroy(); W.actions.activate(docs[0]); });
    const r = await app.runTool(id);
    const err = r.toasts.find(t => t.startsWith('error'));
    if (NEEDS_INPUT[id]) { if (!err || !NEEDS_INPUT[id].test(err)) failures.push(`${id}: erwartete Rückfrage fehlt (${err})`); continue; }
    if (r.ok !== true || err) failures.push(`${id}: ${err || r.ok}`);
  }
  stop();
  expect(failures).toEqual([]);
  // Erwartete Rückfragen landen auch im Fehlerprotokoll der Konsole – das ist gewollt
  app.errors.splice(0, app.errors.length, ...app.errors.filter(e => !Object.values(NEEDS_INPUT).some(r => r.test(e))));
});

test('Werkzeuge mit Dateien: zusammenführen, einfügen, Bilder und Office', async ({ app }) => {
  test.setTimeout(600_000);
  const bytes = async (n: string) => (await import('node:fs')).readFileSync(`tests/fixtures/${n}`).toString('base64');
  await app.open('text.pdf');
  await app.page.evaluate(async (f) => {
    const B = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
    (window as any).__F = { text: B(f.text), scan: B(f.scan), jpg: B(f.jpg), docx: B(f.docx), xlsx: B(f.xlsx) };
  }, { text: await bytes('text.pdf'), scan: await bytes('scan.pdf'), jpg: await bytes('foto.jpg'), docx: await bytes('brief.docx'), xlsx: await bytes('bestand.xlsx') });
  const run = (id: string, js: string) => app.page.evaluate(async ([id, js]) => {
    const W = (window as any).__wb, F = (window as any).__F; W.app.toasts.splice(0);
    const ok = await W.actions.runTool(W.tool(id), eval('(' + js + ')'));
    return { ok, toasts: W.app.toasts.map((x: any) => `${x.kind}:${x.text}`), pages: W.active().numPages, name: W.active().name };
  }, [id, js] as const);

  let r = await run('merge', `{ docs: [{ id: 'a', name: 'a.pdf', bytes: F.text }, { id: 'b', name: 'scan.pdf', bytes: F.scan }], name: 'Zusammen', bookmarks: true }`);
  expect(r.ok).toBe(true); expect(r.pages).toBe(8);
  r = await run('insert-file', `{ src: [{ id: 'b', name: 'scan.pdf', bytes: F.scan }], where: 'end' }`);
  expect(r.pages).toBe(10);
  r = await run('create-images', `{ files: [{ name: 'foto.jpg', bytes: F.jpg }], size: 'a4', orient: 'auto', margin: 10 }`);
  expect(r.ok).toBe(true); expect(r.name).toBe('foto.pdf');
  r = await run('create-office', `{ files: [{ name: 'brief.docx', bytes: F.docx }, { name: 'bestand.xlsx', bytes: F.xlsx }], merge: true, pdfa: '' }`);
  expect(r.ok, r.toasts.join()).toBe(true);
  const info = await app.docInfo();
  expect(info!.texts.join(' ')).toMatch(/Testbericht Werkbank/);
  expect(info!.texts.join(' ')).toMatch(/Fichte/);
});
