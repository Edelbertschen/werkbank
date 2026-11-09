// Nichts wird abgeschnitten oder ragt unter Nachbarbereiche: Startseite, Leisten, Seitenleisten,
// Aufgabenbereiche und Dialoge bei kleinem Fenster und schmalster Breite, auf Deutsch und Englisch.
import { test, expect } from './app';

const finder = () => {
  (window as any).__clip = (sel: string) => {
    const roots = [...document.querySelectorAll(sel)] as HTMLElement[];
    const out: string[] = [];
    const desc = (e: Element) => {
      const t = (e.getAttribute('aria-label') || (e as HTMLElement).innerText || (e as HTMLInputElement).placeholder || '').trim().replace(/\s+/g, ' ').slice(0, 40);
      return `${e.tagName.toLowerCase()}.${[...e.classList].join('.')} "${t}"`;
    };
    for (const root of roots) {
      const els = root.querySelectorAll('button, input, select, textarea, label, a, [role=tab], h2, h3, p, span, b, small, img, canvas, .btn');
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none') continue;
        // abgeschnittener Text mit … ist gewollt; nur melden, wenn es ein Knopf ist
        if (cs.textOverflow === 'ellipsis' && (el as HTMLElement).scrollWidth > (el as HTMLElement).clientWidth + 1 && el.matches('button, .btn, [role=tab]')) out.push(`… ${desc(el)}`);
        let scrolledY = false, hit = false;
        for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
          const as = getComputedStyle(a);
          const ox = as.overflowX, oy = as.overflowY;
          if (ox === 'visible' && oy === 'visible') continue;
          const ar = a.getBoundingClientRect();
          const bl = parseFloat(as.borderLeftWidth), bt = parseFloat(as.borderTopWidth);
          const L = ar.left + bl, T = ar.top + bt, R = L + a.clientWidth, B = T + a.clientHeight;
          const overX = r.left < L - 1 || r.right > R + 1;
          const overY = r.top < T - 1 || r.bottom > B + 1;
          const scrollY = oy === 'auto' || oy === 'scroll';
          if (overX && (ox === 'hidden' || ox === 'clip')) { out.push(`→ ${desc(el)} in ${a.className}`); hit = true; break; }
          if (overX && (ox === 'auto' || ox === 'scroll') && a.scrollWidth > a.clientWidth + 1) { out.push(`⇆ ${desc(el)} in ${a.className}`); hit = true; break; }
          // in scrollbaren Bereichen ist senkrechtes Herausragen normal (man scrollt hin)
          if (scrollY) { scrolledY = true; }
          else if (overY && !scrolledY && (oy === 'hidden' || oy === 'clip') && r.bottom > T && r.top < B) { out.push(`↓ ${desc(el)} in ${a.className}`); hit = true; break; }
        }
        // ragt seitlich aus dem Bereich heraus – wird dann vom Nachbarn verdeckt
        const rr = root.getBoundingClientRect();
        if (!hit && (r.left < rr.left - 1 || r.right > rr.right + 1)) { out.push(`⊐ ${desc(el)} ragt aus ${root.className}`); hit = true; }
        if (!hit && (r.right > innerWidth + 1 || (!scrolledY && r.bottom > innerHeight + 1))) out.push(`▢ ${desc(el)} außerhalb des Fensters`);
      }
    }
    return [...new Set(out)];
  };
};

for (const locale of ['de-DE', 'en-US']) test.describe(locale, () => {
 test.use({ locale });
 test('nichts ist abgeschnitten', async ({ app }) => {
  test.setTimeout(900_000);
  const report: string[] = [];
  const P = app.page;
  const en = locale === 'en-US';
  await P.addInitScript(finder);
  await P.evaluate(finder);
  const clip = async (where: string, sel: string) => {
    await P.waitForTimeout(250);
    if (!(await P.locator(sel).count())) { report.push(`[${where}] NICHT GEÖFFNET`); return; }
    const r: string[] = await P.evaluate(s => (window as any).__clip(s), sel);
    for (const x of r) report.push(`[${where}] ${x}`);
  };

  for (const [w, h] of [[800, 560]]) {
    await P.setViewportSize({ width: w, height: h });
    await clip(`Start ${w}`, '.start');
    await P.evaluate(() => { const W = (window as any).__wb; W.app.prefs.introSeen = false; });
    await clip(`Einführung ${w}`, '.welcome');
    await P.evaluate(() => { const W = (window as any).__wb; W.app.prefs.introSeen = true; });
  }

  await app.open('outline.pdf');
  for (const [w, h] of [[960, 640]]) {
    await P.setViewportSize({ width: w, height: h });
    for (const sel of ['.titlebar', '.ribbon', '.status', '.rail']) await clip(`${sel} @${w}`, sel);
    await P.evaluate(() => { (window as any).__wb.app.palette = true; });
    await P.keyboard.type(en ? 'page' : 'Seite');
    await clip(`Befehlssuche @${w}`, '.pal');
    await P.keyboard.press('Escape');
    await P.evaluate(() => { const W = (window as any).__wb; W.app.palette = false; W.app.organize = true; });
    await clip(`Organisieren @${w}`, '.org');
    await P.evaluate(() => { (window as any).__wb.app.organize = false; });

    for (const sw of [170, 232]) {
      for (const s of ['pages', 'outline', 'search', 'comments', 'attachments', 'layers', 'history']) {
        await P.evaluate(([s, sw]) => { const W = (window as any).__wb; W.app.prefs.sidebarWidth = sw; W.app.sidebar = s; }, [s, sw] as const);
        await clip(`Seitenleiste ${s} ${sw}px @${w}`, 'aside.sidebar');
      }
    }
    await P.evaluate(() => { const W = (window as any).__wb; W.app.prefs.sidebarWidth = 170; W.app.sidebar = 'outline'; });
    await P.waitForTimeout(200);
    await P.locator('aside.sidebar .bar .btn').first().click(); await P.keyboard.press('Enter');
    await clip(`Lesezeichen geändert 170px @${w}`, 'aside.sidebar');
    await P.evaluate(() => { (window as any).__wb.app.prefs.sidebarWidth = 232; });

    const ids: string[] = await P.evaluate(() => (window as any).__wb.TOOLS.filter((t: any) => !t.mode && !t.direct && (t.fields?.length || t.panel)).map((t: any) => t.id));
    for (const id of ids) {
      await P.evaluate(([id]) => { const W = (window as any).__wb; W.app.prefs.paneWidth = 280; W.app.pane = { tool: id, nonce: Date.now() }; }, [id] as const);
      await P.waitForTimeout(150);
      await clip(`Bereich ${id} 280px @${w}`, 'aside.pane');
    }
    await P.evaluate(() => { const W = (window as any).__wb; W.app.pane = null; W.app.prefs.paneWidth = 320; });
  }

  await P.setViewportSize({ width: 960, height: 640 });
  // zwei gespeicherte Unterschriften: eine hohe, eine sehr breite
  await P.evaluate(() => { const mk = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d')!; x.lineWidth = 8; x.strokeRect(4, 4, w - 8, h - 8); return c.toDataURL(); }; (window as any).__wb.app.prefs.signatures = [mk(500, 420), mk(900, 160)]; });
  for (const name of en ? ['Sign', 'Stamp'] : ['Unterschreiben', 'Stempel']) {
    await P.evaluate(() => { (window as any).__wb.app.palette = true; });
    await P.keyboard.type(name);
    await P.waitForTimeout(300);
    await P.keyboard.press('Enter');
    await P.waitForTimeout(700);
    await clip(`Dialog ${name}`, '.dialog');
    for (const tab of await P.locator('.dialog [role=tab]').all()) { await tab.click(); await clip(`Dialog ${name} / ${await tab.innerText()}`, '.dialog'); }
    await P.keyboard.press('Escape');
    await P.waitForTimeout(300);
  }

  expect(report, 'abgeschnittene oder verdeckte Elemente').toEqual([]);
 });
});
