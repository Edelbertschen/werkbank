// Seiten organisieren, Layout, Kennzeichnen
import * as I from '../icons';
import type { Tool, ToolCtx } from './types';
import { PAGES, pagesOf, outName, refBytes, POSITIONS, type DocRef } from './common';
import { plLoad, plSave, PDFDocument, PDFArray, degrees, rotOf, dispSize, geom, drawPageDisp, ensureContents, embedFont, stampText, color, reorderPages, paperSize, safeText, rgb } from '../ops';
import { MM, PAPER, rangeLabel, parseRange, baseName, dataUrlToBytes } from '../util';
import { renderPage } from '../pdf';
import { pyRun } from '../engines';
import { assemble, pick } from '../graft';
import { app } from '../app.svelte';

import { L, intlLocale } from '../i18n';
const quickScope = (ctx: ToolCtx) => (ctx.selection.length ? [...ctx.selection].sort((a, b) => a - b) : [ctx.current]);

async function rotate(ctx: ToolCtx, idx: number[], by: number) {
  const pl = await plLoad(ctx.bytes);
  for (const i of idx) { const p = pl.getPage(i); p.setRotation(degrees((rotOf(p) + by + 360) % 360)); }
  return { bytes: await plSave(pl), label: `${idx.length === 1 ? L("Seite ") + (idx[0] + 1) : idx.length + L(" Seiten")} gedreht`, selection: ctx.selection };
}

async function deletePages(ctx: ToolCtx, idx: number[]) {
  if (idx.length >= (ctx.doc?.numPages || 0)) throw new Error(L("Mindestens eine Seite muss bleiben"));
  const pl = await plLoad(ctx.bytes);
  for (const i of [...idx].sort((a, b) => b - a)) pl.removePage(i);
  return { bytes: await plSave(pl), label: L("{0} gelöscht", idx.length === 1 ? L("Seite ") + (idx[0] + 1) : idx.length + L(" Seiten")), selection: [], current: Math.min(idx[0] + 1, pl.getPageCount()) };
}

export async function movePages(ctx: ToolCtx, order: number[]) {
  const pl = await plLoad(ctx.bytes);
  reorderPages(pl, order);
  const sel = ctx.selection.map(i => order.indexOf(i));
  return { bytes: await plSave(pl), label: L("Seiten umsortiert"), selection: sel };
}

export async function insertDocs(ctx: ToolCtx, refs: DocRef[], at: number) {
  const before = ctx.doc?.numPages ?? (await plLoad(ctx.bytes)).getPageCount();
  const parts = [{ bytes: ctx.bytes }];
  for (const r of refs) parts.push({ bytes: await refBytes(r) });
  const bytes = await assemble(parts, 'insert', at);
  const n = (await plLoad(bytes)).getPageCount() - before;
  return { bytes, label: L("{0} Seite(n) eingefügt", n), current: at + 1, selection: [...Array(n).keys()].map(k => at + k) };
}

export const pageTools: Tool[] = [
  { id: 'rotate-left', label: L("Nach links drehen"), short: L("Links"), icon: I.RotateCcw, direct: true, keys: L("drehen gegen uhrzeigersinn"), shortcut: 'Mod+Shift+L', desc: L("Ausgewählte oder aktuelle Seite um 90° gegen den Uhrzeigersinn drehen"), run: async (_v, ctx) => rotate(ctx, quickScope(ctx), -90) },
  { id: 'rotate-right', label: L("Nach rechts drehen"), short: L("Rechts"), icon: I.RotateCw, direct: true, keys: L("drehen uhrzeigersinn"), shortcut: 'Mod+Shift+R', desc: L("Ausgewählte oder aktuelle Seite um 90° im Uhrzeigersinn drehen"), run: async (_v, ctx) => rotate(ctx, quickScope(ctx), 90) },
  {
    id: 'rotate', label: L("Seiten drehen"), short: L("Drehen …"), icon: I.RotateCw, desc: L("Seiten um 90° oder 180° drehen."), keys: L("rotieren quer hoch wenden"),
    fields: [{ key: 'by', type: 'seg', label: L("Drehung"), opts: [['-90', L("90° links")], ['90', L("90° rechts")], ['180', '180°']], def: '90' }, PAGES('sel')],
    run: async (v, ctx) => rotate(ctx, pagesOf(v.pages, ctx), +v.by),
  },
  { id: 'delete-pages', label: L("Seiten löschen"), short: L("Löschen"), icon: I.Trash2, direct: true, keys: 'entfernen', desc: L("Ausgewählte oder aktuelle Seite löschen"), run: async (_v, ctx) => deletePages(ctx, quickScope(ctx)) },
  {
    id: 'delete-range', label: L("Seitenbereich löschen"), icon: I.Trash2, desc: L("Mehrere Seiten oder Bereiche auf einmal entfernen, z. B. „2, 5-7, 12-“."), keys: L("entfernen löschen"),
    fields: [PAGES('sel')], action: L("Löschen"),
    run: async (v, ctx) => deletePages(ctx, pagesOf(v.pages, ctx)),
  },
  {
    id: 'extract', label: L("Seiten extrahieren"), short: L("Extrahieren"), icon: I.FileOutput, desc: L("Seiten als neues Dokument öffnen oder als Datei speichern."), keys: L("herauslösen auszug kopieren"),
    fields: [PAGES('sel'), { key: 'each', type: 'check', label: L("Jede Seite als eigene Datei"), def: false }, { key: 'remove', type: 'check', label: L("Danach aus diesem Dokument löschen"), def: false }],
    action: L("Extrahieren"),
    run: async (v, ctx) => {
      const idx = pagesOf(v.pages, ctx);
      const src = await plLoad(ctx.bytes);
      const groups = v.each ? idx.map(i => [i]) : [idx];
      const outs = (await pick(ctx.bytes, groups, ctx.progress)).map((bytes, k) => ({ bytes, name: outName(ctx, 'S. ' + rangeLabel(groups[k])), label: L("Extrahiert") }));
      const r: any = v.each ? { files: outs.map(o => ({ name: o.name, data: o.bytes })) } : { doc: outs[0] };
      if (v.remove) {
        if (idx.length >= src.getPageCount()) throw new Error(L("Mindestens eine Seite muss bleiben"));
        for (const i of [...idx].reverse()) src.removePage(i);
        r.bytes = await plSave(src); r.label = L("{0} Seite(n) extrahiert und entfernt", idx.length);
      }
      return r;
    },
  },
  {
    id: 'duplicate', label: L("Seiten duplizieren"), short: L("Duplizieren"), icon: I.Copy, desc: L("Seiten direkt dahinter kopieren."), keys: L("kopie verdoppeln"),
    fields: [PAGES('sel'), { key: 'times', type: 'number', label: L("Anzahl Kopien"), def: 1, min: 1, max: 50 }],
    run: async (v, ctx) => {
      const idx = pagesOf(v.pages, ctx); const pl = await plLoad(ctx.bytes); let off = 0;
      for (const i of idx) { const cp = await pl.copyPages(pl, Array(+v.times).fill(i)); cp.forEach((p, k) => pl.insertPage(i + off + 1 + k, p)); off += cp.length; }
      return { bytes: await plSave(pl), label: L("{0} Seite(n) dupliziert", idx.length * v.times) };
    },
  },
  {
    id: 'insert-blank', label: L("Leere Seite einfügen"), short: L("Leere Seite"), icon: I.FilePlus2, desc: L("Leere Seiten an beliebiger Stelle einfügen."), keys: L("vakat neu seite"),
    fields: [
      { key: 'where', type: 'select', label: 'Position', opts: [['after', L("Nach der aktuellen Seite")], ['before', L("Vor der aktuellen Seite")], ['start', L("Am Anfang")], ['end', L("Am Ende")], ['every', L("Nach jeder Seite")]], def: 'after' },
      { key: 'count', type: 'number', label: L("Anzahl"), def: 1, min: 1, max: 100 },
      { key: 'size', type: 'select', label: L("Format"), opts: [['same', L("Wie die Nachbarseite")], ...PAPER.slice(0, 6).flatMap(p => [[p[0], p[0] + ' hoch'], [p[0] + 'q', p[0] + ' quer']] as [string, string][])], def: 'same' },
    ],
    run: async (v, ctx) => {
      const pl = await plLoad(ctx.bytes); const n = pl.getPageCount(); const c = ctx.current;
      const sz = (ref: number): [number, number] => v.size === 'same' ? dispSize(pl.getPage(Math.max(0, Math.min(ref, pl.getPageCount() - 1)))) : paperSize(v.size.replace(/q$/, ''), v.size.endsWith('q'));
      const ins = (at: number, ref: number) => { for (let k = 0; k < v.count; k++) pl.insertPage(at, sz(ref)); };
      if (v.where === 'every') for (let i = n - 1; i >= 0; i--) ins(i + 1, i);
      else if (v.where === 'start') ins(0, 0); else if (v.where === 'end') ins(n, n - 1);
      else if (v.where === 'before') ins(c, c); else ins(c + 1, c);
      const cur = v.where === 'start' ? 1 : v.where === 'end' ? n + 1 : v.where === 'before' ? c + 1 : c + 2;
      return { bytes: await plSave(pl), label: L("Leere Seite(n) eingefügt"), current: v.where === 'every' ? undefined : cur };
    },
  },
  {
    id: 'insert-file', label: L("Seiten aus Datei einfügen"), short: L("Aus Datei"), icon: I.FileUp, desc: L("Ein anderes PDF (oder Word, Bilder …) an eine Stelle dieses Dokuments einfügen."), keys: L("anhängen hinzufügen kombinieren"),
    fields: [
      { key: 'src', type: 'docs', label: L("Einzufügende Dokumente"), hint: L("Offene Dokumente wählen oder Dateien hinzufügen. Nicht-PDFs werden umgewandelt.") },
      { key: 'where', type: 'select', label: 'Position', opts: [['end', L("Am Ende")], ['start', L("Am Anfang")], ['after', L("Nach der aktuellen Seite")], ['before', L("Vor der aktuellen Seite")]], def: 'end' },
    ],
    action: L("Einfügen"),
    run: async (v, ctx) => {
      if (!v.src?.length) throw new Error(L("Bitte mindestens ein Dokument wählen"));
      const n = ctx.doc!.numPages, c = ctx.current;
      const at = typeof v.at === 'number' ? Math.max(0, Math.min(n, v.at)) : v.where === 'start' ? 0 : v.where === 'after' ? c + 1 : v.where === 'before' ? c : n;
      return insertDocs(ctx, v.src, at);
    },
  },
  {
    id: 'replace-pages', label: L("Seiten ersetzen"), short: L("Ersetzen"), icon: I.Replace, desc: L("Seiten dieses Dokuments durch Seiten eines anderen ersetzen – z. B. eine korrigierte Seite."), keys: L("austauschen tauschen"),
    fields: [PAGES('sel', L("Zu ersetzende Seiten")), { key: 'src', type: 'doc', label: L("Ersatz aus") }, { key: 'from', type: 'text', label: L("Seiten der Quelle"), def: '1', ph: L("z. B. 1 oder 3-4"), hint: L("Anzahl muss nicht übereinstimmen.") }],
    action: L("Ersetzen"),
    run: async (v, ctx) => {
      if (!v.src) throw new Error(L("Bitte die Quelle wählen"));
      const idx = pagesOf(v.pages, ctx); const pl = await plLoad(ctx.bytes); const src = await plLoad(await refBytes(v.src));
      const from = parseRange(v.from || '1', src.getPageCount()); if (!from.length) throw new Error(L("Keine Quellseiten"));
      const cp = await pl.copyPages(src, from);
      const at = idx[0];
      for (const i of [...idx].sort((a, b) => b - a)) pl.removePage(i);
      cp.forEach((p, k) => pl.insertPage(at + k, p));
      return { bytes: await plSave(pl), label: L("{0} Seite(n) ersetzt", idx.length), current: at + 1 };
    },
  },
  {
    id: 'reverse', label: L("Reihenfolge umkehren"), short: L("Umkehren"), icon: I.ArrowDownUp, direct: true, desc: L("Letzte Seite nach vorn – hilft bei falsch herum gescannten Stapeln."), keys: L("rückwärts"),
    run: async (_v, ctx) => { const pl = await plLoad(ctx.bytes); reorderPages(pl, [...Array(pl.getPageCount()).keys()].reverse()); return { bytes: await plSave(pl), label: L("Reihenfolge umgekehrt") }; },
  },
  {
    id: 'merge', label: L("Dateien zusammenführen"), short: L("Zusammenführen"), icon: I.Combine, noDoc: true, desc: L("Mehrere Dokumente zu einem PDF verbinden. Word, Excel, Bilder und mehr werden dabei umgewandelt."), keys: L("kombinieren verbinden vereinen merge"),
    fields: [{ key: 'docs', type: 'docs', label: L("Dokumente in Reihenfolge"), hint: L("Mit den Pfeilen sortieren.") }, { key: 'name', type: 'text', label: L("Name des neuen Dokuments"), def: L("Zusammengeführt") }, { key: 'bookmarks', type: 'check', label: L("Lesezeichen je Datei anlegen"), def: true }],
    action: L("Zusammenführen"),
    run: async (v, ctx) => {
      const refs: DocRef[] = v.docs || [];
      if (refs.length < 2) throw new Error(L("Mindestens zwei Dokumente wählen"));
      const parts: { bytes: Uint8Array; title: string }[] = [];
      for (const [k, r] of refs.entries()) { ctx.progress(k / refs.length, r.name); parts.push({ bytes: await refBytes(r), title: baseName(r.name) }); }
      const bytes = await assemble(parts, v.bookmarks ? 'files' : 'concat');
      return { doc: { bytes, name: (v.name || L("Zusammengeführt")) + '.pdf', label: L("Aus {0} Dokumenten zusammengeführt", refs.length) } };
    },
  },
  {
    id: 'split', label: L("Dokument aufteilen"), short: L("Aufteilen"), icon: I.Split, desc: L("In einzelne Seiten, feste Portionen, nach Lesezeichen, nach Dateigröße oder eigene Bereiche zerlegen."), keys: L("trennen splitten zerlegen"),
    fields: [
      { key: 'mode', type: 'select', label: L("Aufteilen"), opts: [['each', L("In einzelne Seiten")], ['n', L("Alle n Seiten")], ['ranges', L("Nach eigenen Bereichen")], ['bookmarks', L("Nach Lesezeichen (1. Ebene)")], ['size', L("Nach Dateigröße")], ['half', L("In zwei Hälften")]], def: 'each' },
      { key: 'n', type: 'number', label: L("Seiten je Teil"), def: 2, min: 1, max: 9999, when: v => v.mode === 'n' },
      { key: 'ranges', type: 'text', label: L("Bereiche, mit Semikolon getrennt"), def: '1-3; 4-', ph: '1-3; 4-6; 7-', when: v => v.mode === 'ranges' },
      { key: 'mb', type: 'number', label: L("Höchstens (MB) je Teil"), def: 10, min: 0.5, max: 500, step: 0.5, when: v => v.mode === 'size' },
      { key: 'out', type: 'seg', label: L("Ergebnis"), opts: [['files', L("Als Dateien speichern")], ['tabs', L("In Tabs öffnen")]], def: 'files' },
    ],
    action: L("Aufteilen"),
    run: async (v, ctx) => {
      const src = await plLoad(ctx.bytes); const n = src.getPageCount();
      let parts: { pages: number[]; name: string }[] = [];
      const nm = (p: number[]) => outName(ctx, 'S. ' + rangeLabel(p));
      if (v.mode === 'each') parts = [...Array(n).keys()].map(i => ({ pages: [i], name: nm([i]) }));
      else if (v.mode === 'n') for (let i = 0; i < n; i += +v.n) { const p = [...Array(Math.min(+v.n, n - i)).keys()].map(k => i + k); parts.push({ pages: p, name: nm(p) }); }
      else if (v.mode === 'ranges') parts = v.ranges.split(';').map((s: string) => s.trim()).filter(Boolean).map((s: string) => parseRange(s, n)).filter((p: number[]) => p.length).map((p: number[]) => ({ pages: p, name: nm(p) }));
      else if (v.mode === 'half') { const h = Math.ceil(n / 2); parts = [{ pages: [...Array(h).keys()], name: outName(ctx, L("Teil 1")) }, { pages: [...Array(n - h).keys()].map(k => k + h), name: outName(ctx, L("Teil 2")) }]; }
      else if (v.mode === 'bookmarks') {
        const pdf = ctx.doc!.pdf!; const ol = (await pdf.getOutline()) || [];
        const starts: [string, number][] = [];
        for (const it of ol) { try { let d: any = it.dest; if (typeof d === 'string') d = await pdf.getDestination(d); if (!d) continue; const pi = typeof d[0] === 'object' ? await pdf.getPageIndex(d[0]) : d[0]; starts.push([it.title, pi]); } catch { /* übergehen */ } }
        if (!starts.length) throw new Error(L("Das Dokument hat keine Lesezeichen"));
        starts.sort((a, b) => a[1] - b[1]);
        if (starts[0][1] > 0) starts.unshift([L("Anfang"), 0]);
        parts = starts.map(([t, s], k) => { const e = k + 1 < starts.length ? starts[k + 1][1] : n; return { pages: [...Array(Math.max(0, e - s)).keys()].map(x => x + s), name: `${baseName(ctx.doc!.name)} – ${t.replace(/[\\/:*?"<>|]/g, '').slice(0, 60)}.pdf` }; }).filter(p => p.pages.length);
      } else if (v.mode === 'size') {
        const limit = v.mb * 1048576; let cur: number[] = [];
        for (let i = 0; i < n; i++) {
          const tryP = [...cur, i]; const o = await PDFDocument.create(); (await o.copyPages(src, tryP)).forEach(p => o.addPage(p));
          const size = (await o.save({ useObjectStreams: true })).length;
          if (size > limit && cur.length) { parts.push({ pages: cur, name: nm(cur) }); cur = [i]; } else cur = tryP;
          ctx.progress(i / n);
        }
        if (cur.length) parts.push({ pages: cur, name: nm(cur) });
      }
      if (!parts.length) throw new Error(L("Keine Teile"));
      if (v.out === 'tabs' && parts.length > 40) throw new Error(L("{0} Teile sind zu viele für Tabs – bitte als Dateien speichern", parts.length));
      const outs: { bytes: Uint8Array; name: string }[] = [];
      (await pick(ctx.bytes, parts.map(p => p.pages), ctx.progress)).forEach((bytes, k) => outs.push({ name: parts[k].name, bytes }));
      if (v.out === 'tabs') return { docs: outs.map(o => ({ bytes: o.bytes, name: o.name, label: L("Aufgeteilt") })) };
      return { files: outs.map(o => ({ name: o.name, data: o.bytes })), zipName: outName(ctx, 'aufgeteilt', 'zip') };
    },
  },
  {
    id: 'alternate', label: L("Vorder- und Rückseiten mischen"), short: L("Duplex mischen"), icon: I.Shuffle, desc: L("Getrennt gescannte Vorder- und Rückseiten abwechselnd verzahnen."), keys: L("duplex reißverschluss abwechselnd"),
    fields: [{ key: 'src', type: 'doc', label: L("Rückseiten aus"), hint: L("Leer lassen, wenn Vorder- und Rückseiten in diesem Dokument nacheinander liegen (erst alle Vorder-, dann alle Rückseiten).") }, { key: 'rev', type: 'check', label: L("Rückseiten in umgekehrter Reihenfolge (Stapel umgedreht gescannt)"), def: true }],
    action: L("Mischen"),
    run: async (v, ctx) => {
      const a = await plLoad(ctx.bytes); const out = await PDFDocument.create();
      let A, B;
      if (v.src) {
        const b = await plLoad(await refBytes(v.src));
        A = await out.copyPages(a, a.getPageIndices()); B = await out.copyPages(b, b.getPageIndices());
      } else {
        // Ein Dokument: erste Hälfte Vorderseiten, zweite Hälfte Rückseiten
        const n = a.getPageCount();
        if (n < 2) throw new Error(L("Das Dokument hat zu wenige Seiten zum Mischen"));
        const half = Math.ceil(n / 2);
        const all = await out.copyPages(a, a.getPageIndices());
        A = all.slice(0, half); B = all.slice(half);
      }
      if (v.rev) B = B.reverse();
      for (let i = 0; i < Math.max(A.length, B.length); i++) { if (A[i]) out.addPage(A[i]); if (B[i]) out.addPage(B[i]); }
      return { bytes: await out.save({ useObjectStreams: true }), label: L("Vorder- und Rückseiten gemischt") };
    },
  },
  {
    id: 'remove-blank', label: L("Leere Seiten entfernen"), short: L("Leere Seiten"), icon: I.ScanSearch, desc: L("Findet (fast) leere Seiten – etwa aus Duplex-Scans – und entfernt sie."), keys: L("leerseiten weiß scan"),
    fields: [{ key: 'tol', type: 'range', label: L("Empfindlichkeit"), def: 3, min: 1, max: 10, hint: L("Höher erkennt auch Seiten mit Flecken, Rauschen oder Lochrand.") }, { key: 'review', type: 'check', label: L("Erst zur Prüfung auswählen, nicht sofort löschen"), def: true }],
    action: L("Suchen"),
    run: async (v, ctx) => {
      const pdf = ctx.doc!.pdf!; const found: number[] = [];
      for (let i = 0; i < pdf.numPages; i++) {
        const c = await renderPage(pdf, i + 1, { width: 120, forms: false });
        const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data; let ink = 0;
        for (let k = 0; k < d.length; k += 4) if (Math.min(d[k], d[k + 1], d[k + 2]) < 225) ink++;
        if (ink / (d.length / 4) < v.tol * 0.0012) found.push(i);
        ctx.progress((i + 1) / pdf.numPages);
      }
      if (!found.length) return { message: L("Keine leeren Seiten gefunden.") };
      if (v.review) { app.organize = true; ctx.doc!.selection = found; return { message: L("{0} leere Seite(n) ausgewählt (S. {1}). Prüfen und mit Entf löschen.", found.length, rangeLabel(found)) }; }
      return deletePages(ctx, found);
    },
  },
  // ---------------- Layout ----------------
  {
    id: 'crop', label: L("Zuschneiden"), icon: I.Crop, desc: L("Ränder abschneiden – fest in Millimetern oder automatisch bis zum Inhalt."), keys: L("rand beschneiden cropbox weißraum"),
    fields: [
      { key: 'mode', type: 'seg', label: L("Art"), opts: [['auto', L("Bis zum Inhalt")], ['mm', L("Feste Ränder")]], def: 'auto' },
      { key: 'pad', type: 'number', label: L("Abstand zum Inhalt (mm)"), def: 5, min: 0, max: 50, when: v => v.mode === 'auto' },
      { key: 'm', type: 'quad', label: L("Abschneiden (mm)"), parts: [['t', L("Oben")], ['r', L("Rechts")], ['b', L("Unten")], ['l', L("Links")]], def: { t: 10, r: 10, b: 10, l: 10 }, when: v => v.mode === 'mm' },
      PAGES('all'),
    ],
    run: async (v, ctx) => {
      const pl = await plLoad(ctx.bytes); const idx = pagesOf(v.pages, ctx); const pdf = ctx.doc!.pdf!;
      for (const [k, i] of idx.entries()) {
        const p = pl.getPage(i), g = geom(p);
        let x0: number, y0: number, x1: number, y1: number;
        if (v.mode === 'auto') {
          const sc = 0.75; const c = await renderPage(pdf, i + 1, { scale: sc, forms: false });
          const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
          let a = c.width, b = c.height, e = 0, f = 0;
          for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) { const o = (y * c.width + x) * 4; if (Math.min(d[o], d[o + 1], d[o + 2]) < 235) { if (x < a) a = x; if (x > e) e = x; if (y < b) b = y; if (y > f) f = y; } }
          if (e <= a) continue;
          const pad = v.pad * MM;
          x0 = Math.max(0, a / sc - pad); y0 = Math.max(0, b / sc - pad); x1 = Math.min(g.dw, e / sc + pad); y1 = Math.min(g.dh, f / sc + pad);
          ctx.progress((k + 1) / idx.length);
        } else { x0 = v.m.l * MM; y0 = v.m.t * MM; x1 = g.dw - v.m.r * MM; y1 = g.dh - v.m.b * MM; }
        if (x1 - x0 < 20 || y1 - y0 < 20) throw new Error(L("Seite {0} wäre danach zu klein", i + 1));
        const a = g.map(x0, y0), b = g.map(x1, y1);
        p.setCropBox(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      }
      return { bytes: await plSave(pl), label: L("{0} Seite(n) zugeschnitten", idx.length) };
    },
  },
  {
    id: 'resize', label: L("Seitenformat ändern"), short: L("Format"), icon: I.Scaling, desc: L("Seiten auf ein einheitliches Papierformat skalieren (z. B. alles auf A4)."), keys: L("a4 skalieren größe letter vereinheitlichen"),
    fields: [
      { key: 'size', type: 'select', label: L("Zielformat"), opts: PAPER.map(p => [p[0], `${p[0]} (${p[1]} × ${p[2]} mm)`] as [string, string]), def: 'A4' },
      { key: 'orient', type: 'seg', label: L("Ausrichtung"), opts: [['auto', L("Wie Seite")], ['port', L("Hoch")], ['land', L("Quer")]], def: 'auto' },
      { key: 'fit', type: 'seg', label: L("Inhalt"), opts: [['fit', L("Einpassen")], ['fill', L("Füllen")], ['none', L("Nicht skalieren")]], def: 'fit' },
      { key: 'margin', type: 'number', label: L("Rand (mm)"), def: 0, min: 0, max: 60 },
      PAGES('all'),
    ],
    run: async (v, ctx) => {
      const src = ensureContents(await plLoad(ctx.bytes)); const out = await PDFDocument.create(); const idx = new Set(pagesOf(v.pages, ctx));
      const pages = src.getPages();
      for (let i = 0; i < pages.length; i++) {
        if (!idx.has(i)) { const [p] = await out.copyPages(src, [i]); out.addPage(p); continue; }
        const page = pages[i]; const [dw, dh] = dispSize(page);
        let [W, H] = paperSize(v.size); if (v.orient === 'land' || (v.orient === 'auto' && dw > dh)) [W, H] = [H, W];
        const m = v.margin * MM; const emb = await out.embedPage(page);
        const s = v.fit === 'none' ? 1 : v.fit === 'fill' ? Math.max((W - 2 * m) / dw, (H - 2 * m) / dh) : Math.min((W - 2 * m) / dw, (H - 2 * m) / dh);
        const sheet = out.addPage([W, H]); drawPageDisp(sheet, emb, rotOf(page), (W - dw * s) / 2, (H - dh * s) / 2, s);
      }
      return { bytes: await out.save({ useObjectStreams: true }), label: L("Auf {0} gebracht", v.size) };
    },
  },
  {
    id: 'divide', label: L("Seiten teilen"), short: L("Halbieren"), icon: I.Columns2, desc: L("Doppelseiten-Scans in linke und rechte (oder obere und untere) Hälften zerlegen."), keys: L("halbieren doppelseite buch scan teilen"),
    fields: [{ key: 'dir', type: 'seg', label: L("Schnitt"), opts: [['v', L("Senkrecht")], ['h', L("Waagerecht")]], def: 'v' }, { key: 'parts', type: 'seg', label: L("Teile"), opts: [['2', '2'], ['3', '3'], ['4', '4']], def: '2' }, { key: 'rtl', type: 'check', label: L("Rechte Hälfte zuerst (Rechts-nach-links-Bücher)"), def: false, when: v => v.dir === 'v' }, PAGES('all')],
    run: async (v, ctx) => {
      const src = ensureContents(await plLoad(ctx.bytes)); const out = await PDFDocument.create(); const idx = new Set(pagesOf(v.pages, ctx)); const k = +v.parts;
      for (let i = 0; i < src.getPageCount(); i++) {
        const page = src.getPage(i);
        if (!idx.has(i)) { const [p] = await out.copyPages(src, [i]); out.addPage(p); continue; }
        const [dw, dh] = dispSize(page); const emb = await out.embedPage(page); const r = rotOf(page);
        const order = [...Array(k).keys()]; if (v.rtl) order.reverse();
        for (const j of order) {
          if (v.dir === 'v') { const s = out.addPage([dw / k, dh]); drawPageDisp(s, emb, r, -j * dw / k, 0, 1); }
          else { const s = out.addPage([dw, dh / k]); drawPageDisp(s, emb, r, 0, -(k - 1 - j) * dh / k, 1); }
        }
      }
      return { bytes: await out.save({ useObjectStreams: true }), label: L("Seiten geteilt") };
    },
  },
  {
    id: 'nup', label: L("Mehrere Seiten pro Blatt"), short: L("Pro Blatt"), icon: I.LayoutDashboard, desc: L("2, 4, 6, 9 oder 16 Seiten verkleinert auf ein Blatt setzen – für Handouts und Sparsamkeit."), keys: L("nup handout drucken verkleinern"),
    fields: [
      { key: 'per', type: 'seg', label: L("Seiten je Blatt"), opts: [['2', '2'], ['4', '4'], ['6', '6'], ['9', '9'], ['16', '16']], def: '2' },
      { key: 'size', type: 'select', label: L("Blatt"), opts: [['A4', 'A4'], ['A3', 'A3'], ['Letter', 'Letter']], def: 'A4' },
      { key: 'order', type: 'seg', label: L("Reihenfolge"), opts: [['row', L("Zeilenweise")], ['col', L("Spaltenweise")]], def: 'row' },
      { key: 'margin', type: 'number', label: L("Rand & Abstand (mm)"), def: 6, min: 0, max: 30 },
      { key: 'frame', type: 'check', label: L("Dünner Rahmen um jede Seite"), def: true },
      { key: 'newdoc', type: 'check', label: L("Als neues Dokument öffnen"), def: true },
    ],
    run: async (v, ctx) => {
      const src = ensureContents(await plLoad(ctx.bytes)); const out = await PDFDocument.create();
      const per = +v.per; const [cols, rows] = ({ 2: [2, 1], 4: [2, 2], 6: [3, 2], 9: [3, 3], 16: [4, 4] } as any)[per];
      const land = per === 2 || per === 6; let [W, H] = paperSize(v.size); if (land) [W, H] = [H, W];
      const m = v.margin * MM, cw = (W - m * (cols + 1)) / cols, ch = (H - m * (rows + 1)) / rows;
      const pages = src.getPages(); const embs = await out.embedPages(pages);
      for (let i = 0; i < pages.length; i += per) {
        const sheet = out.addPage([W, H]);
        for (let k = 0; k < per && i + k < pages.length; k++) {
          const pg = pages[i + k], [dw, dh] = dispSize(pg), s = Math.min(cw / dw, ch / dh);
          const c = v.order === 'col' ? Math.floor(k / rows) : k % cols, r = v.order === 'col' ? k % rows : Math.floor(k / cols);
          const cx = m + c * (cw + m) + (cw - dw * s) / 2, cy = H - m - (r + 1) * ch - r * m + (ch - dh * s) / 2;
          drawPageDisp(sheet, embs[i + k], rotOf(pg), cx, cy, s);
          if (v.frame) sheet.drawRectangle({ x: cx, y: cy, width: dw * s, height: dh * s, borderColor: rgb(0.72, 0.74, 0.78), borderWidth: 0.5 });
        }
      }
      const bytes = await out.save({ useObjectStreams: true });
      return v.newdoc ? { doc: { bytes, name: outName(ctx, L("{0} pro Blatt", per)), label: L("{0} Seiten je Blatt", per) } } : { bytes, label: L("{0} Seiten je Blatt", per) };
    },
  },
  {
    id: 'booklet', label: L("Broschüre"), icon: I.BookOpen, desc: L("Für Rückendrahtheftung ausschießen: beidseitig drucken, falten, heften."), keys: L("heft falten ausschießen"),
    fields: [{ key: 'size', type: 'select', label: L("Druckbogen (quer)"), opts: [['A4', L("A4 → Heft in A5")], ['A3', L("A3 → Heft in A4")], ['Letter', L("Letter → Heft in Half Letter")]], def: 'A4' }, { key: 'creep', type: 'number', label: L("Bundzuwachs-Ausgleich (mm)"), def: 0, min: 0, max: 5, step: 0.1, hint: L("Bei dicken Heften rücken innere Seiten nach außen.") }],
    action: L("Ausschießen"),
    run: async (v, ctx) => {
      const src = ensureContents(await plLoad(ctx.bytes)); const out = await PDFDocument.create();
      const [W, H] = paperSize(v.size, true); const pages = src.getPages(); const embs = await out.embedPages(pages);
      const n = Math.ceil(pages.length / 4) * 4; const cell = W / 2; const sheets = n / 4;
      const put = (sheet: any, idx: number, left: boolean, shift: number) => { if (idx >= pages.length) return; const [dw, dh] = dispSize(pages[idx]); const s = Math.min(cell / dw, H / dh); drawPageDisp(sheet, embs[idx], rotOf(pages[idx]), (left ? 0 : cell) + (cell - dw * s) / 2 + (left ? -shift : shift), (H - dh * s) / 2, s); };
      for (let i = 0; i < sheets; i++) {
        const shift = (v.creep * MM) * (sheets - 1 - i) / Math.max(1, sheets - 1);
        const f = out.addPage([W, H]); put(f, n - 1 - 2 * i, true, shift); put(f, 2 * i, false, shift);
        const b = out.addPage([W, H]); put(b, 2 * i + 1, true, shift); put(b, n - 2 - 2 * i, false, shift);
      }
      return { doc: { bytes: await out.save({ useObjectStreams: true }), name: outName(ctx, L("Broschüre")), label: L("Als Broschüre ausgeschossen") }, message: L("Beidseitig drucken und an der kurzen Kante wenden.") };
    },
  },
  {
    id: 'one-page', label: L("Zu einer langen Seite"), short: L("Eine Seite"), icon: I.GalleryVertical, desc: L("Alle Seiten untereinander auf eine durchgehende Seite setzen."), keys: L("endlos lang scroll"),
    fields: [{ key: 'dir', type: 'seg', label: L("Richtung"), opts: [['v', L("Untereinander")], ['h', L("Nebeneinander")]], def: 'v' }, { key: 'gap', type: 'number', label: L("Abstand (mm)"), def: 0, min: 0, max: 30 }],
    run: async (v, ctx) => {
      const src = ensureContents(await plLoad(ctx.bytes)); const out = await PDFDocument.create(); const pages = src.getPages(); const embs = await out.embedPages(pages);
      const gap = v.gap * MM; const sz = pages.map(dispSize);
      const W = v.dir === 'v' ? Math.max(...sz.map(s => s[0])) : sz.reduce((a, s) => a + s[0], 0) + gap * (pages.length - 1);
      const H = v.dir === 'v' ? sz.reduce((a, s) => a + s[1], 0) + gap * (pages.length - 1) : Math.max(...sz.map(s => s[1]));
      if (W > 14400 || H > 14400) throw new Error(L("Das Ergebnis wäre größer als die PDF-Höchstgröße (5 m). Bitte weniger Seiten verwenden."));
      const sheet = out.addPage([W, H]); let off = v.dir === 'v' ? H : 0;
      pages.forEach((p, i) => {
        if (v.dir === 'v') { off -= sz[i][1]; drawPageDisp(sheet, embs[i], rotOf(p), (W - sz[i][0]) / 2, off, 1); off -= gap; }
        else { drawPageDisp(sheet, embs[i], rotOf(p), off, (H - sz[i][1]) / 2, 1); off += sz[i][0] + gap; }
      });
      return { doc: { bytes: await out.save(), name: outName(ctx, L("eine Seite")), label: L("Zu einer Seite zusammengesetzt") } };
    },
  },
  // ---------------- Kennzeichnen ----------------
  {
    id: 'page-numbers', label: L("Seitenzahlen"), short: L("Seitenzahlen"), icon: I.Hash, desc: L("Seiten nummerieren – Position, Format, Startwert und Schrift frei wählbar."), keys: L("paginierung nummerieren seitenzahlen einfügen paginieren"),
    fields: [
      { key: 'pos', type: 'position', label: 'Position', def: 'bc' },
      { key: 'fmt', type: 'select', label: L("Format"), opts: [['{n}', '1'], [L("Seite {n}"), L("Seite 1")], [L("Seite {n} von {N}"), L("Seite 1 von 9")], ['{n} / {N}', '1 / 9'], [L("– {n} –"), '– 1 –'], ['{r}', 'i, ii, iii'], ['{R}', 'I, II, III']], def: L("Seite {n} von {N}") },
      { key: 'start', type: 'number', label: L("Beginnen mit"), def: 1, min: 0, max: 99999 },
      { key: 'skip', type: 'number', label: L("Erste Seiten auslassen"), def: 0, min: 0, max: 999, hint: L("z. B. 1 für ein Deckblatt") },
      { key: 'size', type: 'number', label: L("Schriftgröße (pt)"), def: 9, min: 5, max: 48 },
      { key: 'color', type: 'color', label: L("Farbe"), def: '#333333' },
      { key: 'margin', type: 'number', label: L("Abstand vom Rand (mm)"), def: 10, min: 2, max: 60 },
      { key: 'mirror', type: 'check', label: L("Gespiegelt (gerade Seiten links, ungerade rechts)"), def: false },
    ],
    run: async (v, ctx) => {
      const pl = await plLoad(ctx.bytes); const font = await embedFont(pl, 'sans'); const n = pl.getPageCount();
      const total = n - v.skip + v.start - 1;
      const roman = (x: number) => { const t: [number, string][] = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']]; let s = ''; for (const [a, r] of t) while (x >= a) { s += r; x -= a; } return s; };
      for (let i = v.skip; i < n; i++) {
        const num = i - v.skip + v.start;
        const txt = v.fmt.replace('{n}', String(num)).replace('{N}', String(total)).replace('{r}', roman(num)).replace('{R}', roman(num).toUpperCase());
        let pos = v.pos as string;
        if (v.mirror && pos[1] !== 'c') pos = pos[0] + ((num % 2 === 0) ? 'l' : 'r');
        stampText(pl.getPage(i), font, txt, pos, v.size, v.margin, color(v.color));
      }
      return { bytes: await plSave(pl), label: L("Seitenzahlen gesetzt") };
    },
  },
  {
    id: 'header-footer', label: L("Kopf- und Fußzeile"), short: L("Kopf/Fuß"), icon: I.PanelTop, desc: L("Text oben und unten auf jeder Seite. Platzhalter: {n} Seite, {N} Seitenzahl, {datum}, {datei}, {titel}."), keys: L("kopfzeile fußzeile footer header"),
    fields: [
      { key: 'h1', type: 'heading', label: L("Kopfzeile") },
      { key: 'tl', type: 'text', label: L("Links"), def: '' }, { key: 'tc', type: 'text', label: L("Mitte"), def: '' }, { key: 'tr', type: 'text', label: L("Rechts"), def: L("{datum}") },
      { key: 'h2', type: 'heading', label: L("Fußzeile") },
      { key: 'bl', type: 'text', label: L("Links"), def: L("{datei}") }, { key: 'bc', type: 'text', label: L("Mitte"), def: '' }, { key: 'br', type: 'text', label: L("Rechts"), def: L("Seite {n} von {N}") },
      { key: 'h3', type: 'heading', label: L("Gestaltung") },
      { key: 'size', type: 'number', label: L("Schriftgröße (pt)"), def: 8, min: 5, max: 30 },
      { key: 'color', type: 'color', label: L("Farbe"), def: '#555555' },
      { key: 'margin', type: 'number', label: L("Abstand vom Rand (mm)"), def: 8, min: 2, max: 40 },
      { key: 'line', type: 'check', label: L("Trennlinie unter Kopf / über Fuß"), def: false },
      PAGES('all'),
    ],
    run: async (v, ctx) => {
      const pl = await plLoad(ctx.bytes); const font = await embedFont(pl, 'sans'); const n = pl.getPageCount();
      const date = new Date().toLocaleDateString(intlLocale()); const title = (() => { try { return pl.getTitle() || baseName(ctx.doc!.name); } catch { return baseName(ctx.doc!.name); } })();
      for (const i of pagesOf(v.pages, ctx)) {
        const page = pl.getPage(i);
        for (const k of ['tl', 'tc', 'tr', 'bl', 'bc', 'br']) if ((v[k] || '').trim())
          stampText(page, font, v[k].replace(/\{n\}/g, i + 1).replace(/\{N\}/g, n).replace(/\{(datum|date)\}/g, date).replace(/\{(datei|file)\}/g, baseName(ctx.doc!.name)).replace(/\{(titel|title)\}/g, title), k, v.size, v.margin, color(v.color));
        if (v.line) {
          const g = geom(page); const m = v.margin * MM;
          for (const dy of [m + v.size * 0.8 + 3, g.dh - m - v.size - 3]) { const a = g.map(m, dy), b = g.map(g.dw - m, dy); page.drawLine({ start: a, end: b, thickness: 0.5, color: color(v.color), opacity: 0.6 }); }
        }
      }
      return { bytes: await plSave(pl), label: L("Kopf- und Fußzeile gesetzt") };
    },
  },
  {
    id: 'bates', label: L("Bates-Nummerierung"), short: 'Bates', icon: I.Tag, desc: L("Fortlaufende Kennung für Akten und Beweisstücke, z. B. AKTE-000123."), keys: L("akte kennung beweis nummer"),
    fields: [{ key: 'pre', type: 'text', label: L("Präfix"), def: L("AKTE-") }, { key: 'start', type: 'number', label: L("Startnummer"), def: 1, min: 0, max: 99999999 }, { key: 'dig', type: 'number', label: L("Stellen"), def: 6, min: 1, max: 12 }, { key: 'suf', type: 'text', label: 'Suffix', def: '' }, { key: 'pos', type: 'position', label: 'Position', def: 'br' }, { key: 'size', type: 'number', label: L("Schriftgröße (pt)"), def: 9, min: 5, max: 30 }],
    run: async (v, ctx) => {
      const pl = await plLoad(ctx.bytes); const font = await embedFont(pl, 'sans-bold');
      pl.getPages().forEach((p, i) => stampText(p, font, v.pre + String(v.start + i).padStart(v.dig, '0') + v.suf, v.pos, v.size, 8, rgb(0.1, 0.1, 0.1)));
      return { bytes: await plSave(pl), label: L("Bates-Nummern gesetzt") };
    },
  },
  {
    id: 'watermark', label: L("Wasserzeichen"), icon: I.Droplet, desc: L("Text oder Bild halbtransparent über oder hinter den Inhalt legen."), keys: L("entwurf vertraulich diagonal logo"),
    fields: [
      { key: 'kind', type: 'seg', label: L("Art"), opts: [['text', 'Text'], ['image', L("Bild")]], def: 'text' },
      { key: 'text', type: 'text', label: 'Text', def: L("VERTRAULICH"), when: v => v.kind === 'text' },
      { key: 'image', type: 'files', label: L("Bild"), accept: ['png', 'jpg', 'jpeg', 'webp', 'svg'], when: v => v.kind === 'image' },
      { key: 'size', type: 'number', label: L("Schriftgröße (pt)"), def: 60, min: 8, max: 300, when: v => v.kind === 'text' },
      { key: 'scale', type: 'range', label: L("Bildbreite"), def: 50, min: 5, max: 100, unit: ' %', when: v => v.kind === 'image' },
      { key: 'color', type: 'color', label: L("Farbe"), def: '#C42B1C', when: v => v.kind === 'text' },
      { key: 'op', type: 'range', label: L("Deckkraft"), def: 18, min: 3, max: 100, unit: ' %' },
      { key: 'ang', type: 'range', label: L("Winkel"), def: 45, min: -90, max: 90, unit: '°' },
      { key: 'layout', type: 'seg', label: L("Anordnung"), opts: [['center', L("Mittig")], ['tile', L("Gekachelt")]], def: 'center' },
      { key: 'behind', type: 'check', label: L("Hinter den Inhalt legen"), def: false },
      PAGES('all'),
    ],
    run: async (v, ctx) => {
      const pl = await plLoad(ctx.bytes); const idx = pagesOf(v.pages, ctx);
      const a = (v.ang * Math.PI) / 180, op = v.op / 100;
      let font: any, img: any, txt = '', tw = 0, th = 0;
      if (v.kind === 'text') { font = await embedFont(pl, 'sans-bold'); txt = safeText(font, v.text || ''); tw = font.widthOfTextAtSize(txt, v.size); th = v.size * 0.7; }
      else {
        const f = v.image?.[0]; if (!f) throw new Error(L("Bitte ein Bild wählen"));
        const { imagesToPdf } = await import('../convert');
        const tmp = await plLoad(await imagesToPdf([{ name: f.name, bytes: f.bytes }], { size: 'image', orient: 'auto', margin: 0 }));
        [img] = await pl.embedPdf(tmp, [0]);
      }
      for (const i of idx) {
        const page = pl.getPage(i), g = geom(page);
        let w = tw, h = th;
        if (img) { w = g.dw * v.scale / 100; h = w * img.height / img.width; }
        const centers: [number, number][] = [];
        if (v.layout === 'tile') { const sx = w * 1.15 + 60, sy = Math.max(h * 2.2, 90); for (let y = sy / 2; y < g.dh + sy; y += sy) for (let x = ((Math.round(y / sy) % 2) ? 0 : sx / 2); x < g.dw + sx; x += sx) centers.push([x, y]); }
        else centers.push([g.dw / 2, g.dh / 2]);
        const before = (page.node.Contents() as any)?.size?.() ?? 0;
        for (const [cx, cy] of centers) {
          const dx = cx - (w / 2) * Math.cos(a) + (h / 2) * Math.sin(a), dy = cy + (w / 2) * Math.sin(a) + (h / 2) * Math.cos(a);
          const o = g.map(dx, dy);
          if (img) page.drawPage(img, { x: o.x, y: o.y, width: w, height: h, opacity: op, rotate: degrees(v.ang + g.r) });
          else page.drawText(txt, { x: o.x, y: o.y, size: v.size, font, color: color(v.color), opacity: op, rotate: degrees(v.ang + g.r) });
        }
        if (v.behind) moveLastStreamToBack(page, before);
      }
      return { bytes: await plSave(pl), label: L("Wasserzeichen gesetzt") };
    },
  },
  {
    id: 'background', label: L("Hintergrund"), icon: I.PaintBucket, desc: L("Farbfläche oder Briefpapier (ein PDF) hinter den Seiteninhalt legen."), keys: L("farbe papier hinterlegen briefpapier briefbogen"),
    fields: [
      { key: 'kind', type: 'seg', label: L("Art"), opts: [['color', L("Farbe")], ['pdf', L("Briefpapier (PDF)")]], def: 'color' },
      { key: 'color', type: 'color', label: L("Farbe"), def: '#FFF8E6', when: v => v.kind === 'color' },
      { key: 'src', type: 'doc', label: L("Briefpapier aus"), when: v => v.kind === 'pdf' },
      { key: 'first', type: 'check', label: L("Seite 1 des Briefpapiers nur für die erste Seite, Seite 2 für alle weiteren"), def: false, when: v => v.kind === 'pdf' },
      { key: 'front', type: 'check', label: L("Vor den Inhalt legen (Overlay)"), def: false, when: v => v.kind === 'pdf' },
      PAGES('all'),
    ],
    run: async (v, ctx) => {
      const pl = await plLoad(ctx.bytes); const idx = pagesOf(v.pages, ctx);
      let embs: any[] = [];
      if (v.kind === 'pdf') { if (!v.src) throw new Error(L("Bitte das Briefpapier wählen")); const bg = ensureContents(await plLoad(await refBytes(v.src))); embs = await pl.embedPdf(bg, bg.getPageIndices().slice(0, 2)); }
      for (const [k, i] of idx.entries()) {
        const p = pl.getPage(i), b = p.getMediaBox();
        const before = (p.node.Contents() as any)?.size?.() ?? 0;
        if (v.kind === 'color') p.drawRectangle({ x: b.x, y: b.y, width: b.width, height: b.height, color: color(v.color) });
        else { const e = embs.length > 1 && v.first ? (k === 0 ? embs[0] : embs[1]) : embs[0]; const cb = p.getCropBox(); p.drawPage(e, { x: cb.x, y: cb.y, width: cb.width, height: cb.height }); }
        if (!(v.kind === 'pdf' && v.front)) moveLastStreamToBack(p, before);
      }
      return { bytes: await plSave(pl), label: v.kind === 'pdf' ? L("Briefpapier hinterlegt") : L("Hintergrund gesetzt") };
    },
  },
  {
    id: 'page-labels', label: L("Seitenbeschriftung"), short: L("Beschriftung"), icon: I.Bookmark, engine: 'pymupdf', desc: L("Logische Seitennamen wie i, ii, iii für das Vorwort und 1, 2, 3 ab dem Hauptteil (erscheinen in PDF-Programmen)."), keys: L("römisch label logisch nummer"),
    fields: [{ key: 'rules', type: 'textarea', label: L("Regeln (je Zeile: ab Seite, Stil, Präfix, Start)"), def: '1, r, , 1\n5, D, , 1', hint: L("Stile: D = 1 2 3, r = i ii iii, R = I II III, a = a b c, A = A B C. Beispiel: „5, D, Anhang-, 1“.") }],
    run: async (v, ctx) => {
      const rules = (v.rules as string).split('\n').map(l => l.split(',').map(s => s.trim())).filter(r => r[0]).map(r => ({ startpage: Math.max(0, (+r[0] || 1) - 1), style: r[1] || 'D', prefix: r[2] || '', firstpagenum: +(r[3] || 1) || 1 }));
      const r = await pyRun(`doc = open_in()\ndoc.set_page_labels(json.loads(ARGS['rules']))\nsave_out(doc)`, { files: { 'in.pdf': ctx.bytes }, outputs: ['out.pdf'], vars: { rules: JSON.stringify(rules) } });
      return { bytes: r.files['out.pdf'], label: L("Seitenbeschriftung gesetzt") };
    },
  },
];

/** Zuletzt angehängten Inhaltsstrom an den Anfang verschieben, damit er hinter dem Inhalt liegt */
function moveLastStreamToBack(page: any, before: number) {
  const arr = page.node.Contents();
  if (!(arr instanceof PDFArray)) return;
  const added = arr.size() - Math.max(before, 0);
  if (added <= 0) return;
  // pdf-lib legt um vorhandene Ströme ein q/Q-Paar; der neue Strom ist der letzte
  const last = arr.get(arr.size() - 1);
  arr.remove(arr.size() - 1);
  arr.insert(0, last);
}
export { dataUrlToBytes };
