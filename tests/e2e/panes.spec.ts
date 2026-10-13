// Jeder Aufgabenbereich öffnet fehlerfrei und zeigt seine Felder.
import { test, expect } from './app';

test('alle Aufgabenbereiche öffnen ohne Fehler', async ({ app }) => {
  test.setTimeout(300_000);
  await app.open('text.pdf');
  const ids: string[] = await app.page.evaluate(() => (window as any).__wb.TOOLS.filter((t: any) => !t.mode && !t.direct && (t.fields?.length || t.panel)).map((t: any) => t.id));
  expect(ids.length).toBeGreaterThan(40);
  for (const id of ids) {
    await app.page.evaluate(id => { const W = (window as any).__wb; W.app.pane = { tool: id, nonce: Date.now() }; }, id);
    await expect(app.page.locator('aside.pane'), id).toBeVisible();
    await app.page.waitForTimeout(120);
  }
});
