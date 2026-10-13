// Gemeinsame Hilfen für die Oberflächentests
import { test as base, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

export const FX = (n: string) => `tests/fixtures/${n}`;

/** Seite mit Fehlerprotokoll: jeder unbehandelte Fehler lässt den Test scheitern */
export const test = base.extend<{ app: App }>({
  app: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(String(e) + (process.env.WB_STACK ? '\n' + (e.stack || '') : '')));
    page.on('console', m => { if (m.type() === 'error' && !/warn:|LOK|Failed to load resource|\[LOK/.test(m.text())) errors.push(m.text()); });
    await page.goto('/');
    await page.waitForFunction(() => (window as any).__wb, null, { timeout: 30_000 });
    const app = new App(page, errors);
    await use(app);
    expect(errors, 'Fehler in der Oberfläche').toEqual([]);
  },
});
export { expect };

export class App {
  constructor(public page: Page, public errors: string[]) {}

  /** Dateien öffnen wie per Dialog (der Dialog selbst wird in ui.spec.ts geprüft) */
  async open(...files: string[]) {
    for (const f of files) await this.openBytes(f);
  }
  /** Datei direkt als Dokument öffnen (ohne Dialog), z. B. für Passwortfälle */
  async openBytes(name: string, password?: string) {
    const b64 = readFileSync(FX(name)).toString('base64');
    if (password) this.answerPassword(password);
    await this.page.evaluate(async ([n, d]) => {
      const bytes = Uint8Array.from(atob(d), c => c.charCodeAt(0));
      await (window as any).__wb.actions.openBytes(n, bytes, null);
    }, [name, b64] as const);
    await this.idle();
  }
  private answerPassword(pw: string) {
    const loop = async () => {
      for (let i = 0; i < 40; i++) {
        const input = this.page.locator('.dialog input[type=password], [role=dialog] input[type=password]');
        if (await input.count()) { await input.first().fill(pw); await this.page.locator('.buttons .btn.primary').last().click(); return; }
        await this.page.waitForTimeout(250);
      }
    };
    void loop();
  }
  async idle(timeout = 240_000) {
    await this.page.waitForTimeout(250);
    await this.page.waitForFunction(() => !document.querySelector('.veil[aria-busy]'), null, { timeout });
    await this.page.waitForTimeout(250);
  }
  /** Werkzeug mit Werten ausführen; liefert true/false und die Meldungen */
  async runTool(id: string, values?: Record<string, any>) {
    return this.page.evaluate(async ([id, values]) => {
      const W = (window as any).__wb;
      W.app.toasts.splice(0);
      const t = W.tool(id);
      const ok = await W.actions.runTool(t, values ? { ...Object.fromEntries((t.fields || []).filter((f: any) => f.def !== undefined).map((f: any) => [f.key, f.def])), ...values } : undefined);
      return { ok, toasts: W.app.toasts.map((x: any) => `${x.kind}:${x.text}`) as string[] };
    }, [id, values ?? null] as const);
  }
  async docInfo() {
    return this.page.evaluate(async () => {
      const W = (window as any).__wb; const d = W.active();
      if (!d) return null;
      // Inhalt wie gespeichert: Elemente eingeschrieben
      const bytes = await d.baked();
      const pdf = bytes === d.bytes ? d.pdf : await W.openPdf(bytes);
      const texts: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) texts.push((await (await pdf.getPage(i)).getTextContent()).items.map((x: any) => x.str).join(' '));
      return { name: d.name, pages: d.numPages, history: d.history.slice(0, d.pos + 1).map((h: any) => h.label), texts, dirty: d.dirty, protected: !!d.protection, docs: W.app.docs.length };
    });
  }
  tab(name: string) { return this.page.getByRole('tab', { name, exact: true }).click(); }
  async ribbon(label: string) {
    const b = this.page.locator(`.ribbon button[aria-label="${label}"]`).first();
    if (await b.isVisible()) { await b.click(); return; }
    await this.page.keyboard.press('Control+k');
    await this.page.keyboard.type(label);
    await this.page.keyboard.press('Enter');
  }
  dismissDialogs() {
    const page = this.page;
    let on = true;
    (async () => {
      while (on && !page.isClosed()) {
        try { const b = page.locator('.buttons .btn.primary'); if (await b.count()) await b.last().click({ timeout: 500 }); await page.waitForTimeout(400); }
        catch { if (page.isClosed()) return; }
      }
    })().catch(() => {});
    return () => { on = false; };
  }
}
