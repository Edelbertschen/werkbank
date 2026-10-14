#!/usr/bin/env node
// Härtetest: jede PDF eines Ordners durch die echte App schicken.
//   öffnen → Rechteck hinzufügen → speichern (anhängen) → Seite drehen → speichern (neu schreiben)
// Jede Ausgabe wird mit qpdf --check geprüft und erneut geöffnet (gleiche Seitenzahl).
//
//   npm run build:test && npx vite preview --port 4173 &
//   node scripts/corpus-sweep.mjs <ordner> [bericht.json] [--from N] [--jobs 3]
import { chromium } from 'playwright';
import { readdirSync, readFileSync, writeFileSync, mkdtempSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const dir = args[0];
if (!dir) { console.error('Aufruf: node scripts/corpus-sweep.mjs <ordner> [bericht.json] [--from N] [--jobs N]'); process.exit(1); }
const report = args[1] && !args[1].startsWith('--') ? args[1] : 'corpus-report.json';
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? Number(args[i + 1]) : d; };
const from = opt('--from', 0), jobs = opt('--jobs', 3), limitMb = opt('--max-mb', 25);
const URL = process.env.WB_URL || 'http://127.0.0.1:4173/';
const tmp = mkdtempSync(join(tmpdir(), 'wb-sweep-'));

const files = readdirSync(dir).filter(f => /\.pdf$/i.test(f)).sort().slice(from)
  .filter(f => statSync(join(dir, f)).size <= limitMb * 1048576);

function qpdfCheck(bytes, tag) {
  const p = join(tmp, tag.replace(/[^\w.-]/g, '_') + '.pdf');
  writeFileSync(p, bytes);
  const r = spawnSync('qpdf', ['--check', p], { encoding: 'utf8', timeout: 60_000 });
  // 0 = in Ordnung, 3 = nur Warnungen, 2 = Fehler
  return { code: r.status, msg: r.status === 2 ? (r.stdout + r.stderr).split('\n').filter(l => /error|damaged|invalid/i.test(l)).slice(0, 3).join(' | ') : '' };
}

async function newPage(browser) {
  const ctx = await browser.newContext({ locale: 'de-DE', acceptDownloads: false });
  await ctx.addInitScript(() => { try { localStorage.setItem('werkbank.prefs', JSON.stringify({ introSeen: true, preloadEngines: true })); } catch { /* egal */ } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 300)));
  page.on('dialog', d => d.dismiss().catch(() => {}));
  await page.goto(URL);
  await page.waitForFunction(() => window.__wb, null, { timeout: 60_000 });
  return { ctx, page, errors };
}

const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('Zeitüberschreitung: ' + what)), ms))]);

async function sweepOne(w, name) {
  const bytes = readFileSync(join(dir, name));
  const res = { file: name, size: bytes.length };
  w.errors.length = 0;
  try {
    const r = await withTimeout(w.page.evaluate(async b64 => {
      const W = window.__wb;
      const b = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      // Dialoge (Passwort, Fragen) sofort abbrechen
      const timer = setInterval(() => { const c = document.querySelector('.dialog .buttons .btn:not(.primary)'); if (c) c.click(); }, 200);
      try {
        for (const d of [...W.app.docs]) { d.savedPos = d.pos; await W.actions.closeDoc(d); }
        let doc;
        try { doc = await W.actions.openBytes('t.pdf', b, null); }
        catch (e) { return { status: 'rejected', why: String(e?.message || e).slice(0, 200) }; }
        if (!doc) return { status: 'skipped', why: 'nicht geöffnet (Passwort oder abgelehnt)' };
        const pages = doc.numPages;
        const out = { status: 'ok', pages };
        // 1) Rechteck auf Seite 1 → anhängen
        W.overlay.addItem(doc, { id: 'sweep1', kind: 'rect', page: 0, x: 0.1, y: 0.1, w: 0.2, h: 0.1, stroke: '#E5484D', fill: 'transparent', width: 2, opacity: 1 });
        const a = await W.actions.outputBytes(doc);
        const enc = u => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
        out.append = { data: enc(a), prefix: doc.canAppend };
        // 2) Seite drehen → neu schreiben
        W.app.toasts.splice(0);
        const ok = await W.actions.runTool(W.tool('rotate-right'));
        if (!ok) out.rotateFailed = W.app.toasts.map(t => t.text).join(' | ').slice(0, 300);
        const f = await W.actions.outputBytes(doc);
        out.full = { data: enc(f) };
        // erneut öffnen: gleiche Seitenzahl?
        for (const [k, o] of [['append', a], ['full', f]]) {
          try { const p = await W.openPdf(o); out[k].pages = p.numPages; } catch (e) { out[k].reopen = String(e).slice(0, 200); }
        }
        return out;
      } finally { clearInterval(timer); }
    }, bytes.toString('base64')), 120_000, name);
    Object.assign(res, r);
    const orig = qpdfCheck(bytes, `${name}.orig`);
    res.origQpdf = orig.code;
    for (const k of ['append', 'full']) {
      if (!res[k]) continue;
      const out = Buffer.from(res[k].data, 'base64'); delete res[k].data;
      res[k].size = out.length;
      res[k].qpdf = qpdfCheck(out, `${name}.${k}`);
      if (res[k].qpdf.code === 2 && orig.code === 2) res[k].qpdf.inherited = true;
      if (res[k].pages != null && res[k].pages !== res.pages) res[k].pageMismatch = true;
    }
  } catch (e) {
    res.status = /Zeitüberschreitung/.test(String(e)) ? 'timeout' : 'error';
    res.error = String(e).slice(0, 300);
  }
  if (w.errors.length) res.pageErrors = [...w.errors];
  return res;
}

const browser = await chromium.launch();
const results = [];
let next = 0;
const t0 = Date.now();
async function worker(k) {
  let w = await newPage(browser), done = 0;
  while (next < files.length) {
    const name = files[next++];
    const r = await sweepOne(w, name);
    results.push(r);
    const flag = r.status !== 'ok' ? r.status : r.rotateFailed ? 'drehen' : ((r.append?.qpdf.code === 2 && !r.append.qpdf.inherited) || (r.full?.qpdf.code === 2 && !r.full.qpdf.inherited)) ? 'qpdf' : (r.append?.pageMismatch || r.full?.pageMismatch) ? 'seiten' : 'ok';
    process.stdout.write(`[${results.length}/${files.length}] ${flag.padEnd(7)} ${name}\n`);
    // nach Zeitüberschreitung, Fehlern oder alle 40 Dateien frisch anfangen (Speicher)
    if (r.status === 'timeout' || r.status === 'error' || ++done % 40 === 0) { await w.ctx.close().catch(() => {}); w = await newPage(browser); }
    if (results.length % 25 === 0) writeFileSync(report, JSON.stringify(results, null, 1));
  }
  await w.ctx.close().catch(() => {});
}
await Promise.all([...Array(jobs).keys()].map(worker));
await browser.close();
writeFileSync(report, JSON.stringify(results, null, 1));

const count = f => results.filter(f).length;
const summary = {
  dateien: results.length,
  ok: count(r => r.status === 'ok'),
  übersprungen: count(r => r.status === 'skipped'),
  nichtLesbar: count(r => r.status === 'rejected'),
  fehler: count(r => r.status === 'error'),
  zeitüberschreitung: count(r => r.status === 'timeout'),
  oberflächenfehler: count(r => r.pageErrors?.length),
  qpdfFehlerAnhängen: count(r => r.append?.qpdf.code === 2 && !r.append.qpdf.inherited),
  qpdfFehlerNeu: count(r => r.full?.qpdf.code === 2 && !r.full.qpdf.inherited),
  qpdfFehlerSchonImOriginal: count(r => r.origQpdf === 2),
  seitenzahlAbweichend: count(r => r.append?.pageMismatch || r.full?.pageMismatch),
  angehängt: count(r => r.append?.prefix),
  drehenFehlgeschlagen: count(r => r.rotateFailed),
  dauerMin: Math.round((Date.now() - t0) / 60000),
};
console.log(JSON.stringify(summary, null, 1));
writeFileSync(report.replace(/\.json$/, '') + '-summary.json', JSON.stringify(summary, null, 1));
