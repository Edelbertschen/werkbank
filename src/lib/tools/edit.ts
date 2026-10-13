// Bearbeiten, Kommentieren, Formulare
import * as I from '../icons';
import type { Tool } from './types';
import { PAGES, pagesOf, outName, author } from './common';
import { plLoad, plSave, PDFName } from '../ops';
import { pyRun } from '../engines';
import { app } from '../app.svelte';
import { PDFDocument } from 'pdf-lib';

import { L } from '../i18n';
const modeTool = (id: string, label: string, icon: any, mode: any, desc: string, keys = '', extra: Partial<Tool> = {}): Tool =>
  ({ id, label, icon, mode, desc, keys, active: () => app.mode === mode, ...extra });

export const REDACT_PRESETS: [string, string, string][] = [
  ['email', 'E-Mail-Adressen', String.raw`[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}`],
  ['iban', 'IBAN', String.raw`\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}(?:\s?[A-Z0-9]{1,3})?\b`],
  ['phone', L("Telefonnummern"), String.raw`(?:\+\d{1,3}[\s\-/]?)?(?:\(?0\d{1,5}\)?[\s\-/]?)\d{3,}(?:[\s\-/]?\d{2,})*`],
  ['date', L("Datumsangaben"), String.raw`\b\d{1,2}\.\s?\d{1,2}\.\s?\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b`],
  ['money', L("Geldbeträge"), String.raw`\b\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})?\s?(?:€|EUR|Euro)|(?:€|EUR)\s?\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})?`],
  ['taxid', L("Steuer-/USt-IdNr."), String.raw`\bDE\s?\d{9}\b|\b\d{2,3}/\d{3,4}/\d{4,5}\b`],
  ['plz', L("Postleitzahlen"), String.raw`\b\d{5}\b`],
  ['url', L("Web-Adressen"), String.raw`https?://\S+|www\.\S+`],
];

export const editTools: Tool[] = [
  // ---------------- Text & Inhalte ----------------
  modeTool('text-edit', L("Text bearbeiten"), I.Type, 'text:edit', L("Auf eine Textzeile klicken und sie ändern. Der alte Text wird entfernt, der neue in vergleichbarer Größe gesetzt."), L("ändern korrigieren tippfehler")),
  modeTool('text-add', L("Text hinzufügen"), I.TextCursor, 'text:add', L("Klicken und Text auf die Seite schreiben."), L("beschriften schreiben")),
  modeTool('image', L("Bild einfügen"), I.ImagePlus, 'image', L("Bild wählen und auf die Seite setzen, dann verschieben oder skalieren."), L("logo foto grafik")),
  modeTool('sign', L("Unterschreiben"), I.Signature, 'sign', L("Handschriftliche Unterschrift zeichnen, tippen oder als Bild laden und platzieren."), L("unterschrift signatur handschrift")),
  modeTool('stamp', L("Stempel"), I.Stamp, 'stamp', L("Stempel wie „Genehmigt“, „Entwurf“ oder „Eingang“ mit Datum platzieren."), L("genehmigt erledigt eingang")),
  modeTool('link', L("Link einfügen"), I.Link, 'link', L("Bereich aufziehen und auf eine Webadresse oder Seite verlinken."), L("verknüpfung hyperlink")),
  modeTool('whiteout', L("Weiß abdecken"), I.Eraser, 'whiteout', L("Bereich mit weißer Fläche überdecken. Für vertrauliche Inhalte stattdessen „Schwärzen“ verwenden."), L("tipp-ex abdecken korrektur")),
  modeTool('redact', L("Schwärzen"), I.SquareX, 'redact', L("Bereiche aufziehen; beim Übernehmen werden Text und Bilddaten darunter wirklich entfernt."), L("schwärzung anonymisieren dsgvo"), { engine: 'pymupdf' }),
  {
    id: 'find-redact', label: L("Suchen und schwärzen"), short: L("Suchen & schwärzen"), icon: I.FileSearch, engine: 'pymupdf',
    desc: L("Begriffe oder Muster wie IBAN, E-Mail oder Telefonnummern im ganzen Dokument finden und dauerhaft schwärzen."), keys: L("anonymisieren dsgvo schwärzen suchen muster regex"),
    fields: [
      { key: 'terms', type: 'textarea', label: L("Begriffe (je Zeile einer)"), def: '', ph: L("Max Mustermann\nMusterstraße 1") },
      { key: 'presets', type: 'custom', label: L("Muster"), def: [] },
      { key: 'regex', type: 'text', label: L("Eigener regulärer Ausdruck"), def: '', ph: 'optional' },
      { key: 'case', type: 'check', label: L("Groß-/Kleinschreibung beachten"), def: false },
      { key: 'fill', type: 'seg', label: L("Füllung"), opts: [['black', L("Schwarz")], ['white', L("Weiß")]], def: 'black' },
      { key: 'label', type: 'text', label: L("Ersatztext (optional)"), def: '', ph: L("z. B. [geschwärzt]") },
      { key: 'meta', type: 'check', label: L("Auch Metadaten entfernen"), def: true },
      PAGES('all'),
    ],
    action: L("Schwärzen"),
    run: async (v, ctx) => {
      const terms = String(v.terms || '').split('\n').map((s: string) => s.trim()).filter(Boolean);
      const patterns = [...(v.presets || []).map((k: string) => REDACT_PRESETS.find(p => p[0] === k)?.[2]).filter(Boolean), ...(v.regex ? [v.regex] : [])];
      if (!terms.length && !patterns.length) throw new Error(L("Bitte Begriffe eingeben oder Muster wählen"));
      const r = await pyRun<number>(`
import re
doc = open_in()
terms = json.loads(ARGS['terms']); pats = json.loads(ARGS['pats']); pages = json.loads(ARGS['pages'])
flags = 0 if ARGS['case'] else re.IGNORECASE
fill = (0,0,0) if ARGS['fill'] == 'black' else (1,1,1)
txtcol = (1,1,1) if ARGS['fill'] == 'black' else (0,0,0)
total = 0
for k, pno in enumerate(pages):
    page = doc[pno]
    hits = []
    for t in terms:
        hits += page.search_for(t) if not ARGS['case'] else [r for r in page.search_for(t) if t in page.get_textbox(r + (-1, -1, 1, 1))]
    if pats:
        words = page.get_text('words')
        text = page.get_text('text')
        for p in pats:
            for m in re.finditer(p, text, flags):
                s = m.group(0).strip()
                if len(s) < 2: continue
                hits += page.search_for(s)
    for r in hits:
        page.add_redact_annot(r, text=ARGS['label'] or None, fill=fill, text_color=txtcol, fontsize=7)
        total += 1
    if hits:
        page.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_PIXELS)
    progress((k + 1) / len(pages))
if ARGS['meta']:
    doc.set_metadata({})
    doc.del_xml_metadata()
save_out(doc)
total`, { files: { 'in.pdf': ctx.bytes }, outputs: ['out.pdf'], progress: ctx.progress, vars: { terms: JSON.stringify(terms), pats: JSON.stringify(patterns), pages: JSON.stringify(pagesOf(v.pages, ctx)), case: !!v.case, fill: v.fill, label: v.label || '', meta: !!v.meta } });
      if (!r.result) return { message: L("Nichts gefunden – das Dokument bleibt unverändert.") };
      return { bytes: r.files['out.pdf'], label: L("{0} Fundstelle(n) geschwärzt", r.result) };
    },
  },
  {
    id: 'toc', label: L("Inhaltsverzeichnis erzeugen"), short: L("Inhaltsverzeichnis"), icon: I.ListTree, engine: 'pymupdf', desc: L("Aus den Lesezeichen eine Inhaltsseite mit klickbaren Einträgen erzeugen und vorne einfügen."), keys: L("toc verzeichnis gliederung"),
    fields: [{ key: 'title', type: 'text', label: L("Überschrift"), def: L("Inhalt") }, { key: 'levels', type: 'number', label: L("Ebenen"), def: 2, min: 1, max: 6 }],
    run: async (v, ctx) => {
      const r = await pyRun<number>(`
doc = open_in()
toc = [t for t in doc.get_toc() if t[0] <= int(ARGS['levels'])]
if not toc:
    raise Exception('Das Dokument hat keine Lesezeichen. Lege sie unter „Lesezeichen“ an.')
w, h = doc[0].rect.width, doc[0].rect.height
per = int((h - 160) // 20)
pages_needed = (len(toc) + per - 1) // per
font = pymupdf.Font('helv'); fontb = pymupdf.Font('hebo')
for p in range(pages_needed):
    page = doc.new_page(p, width=w, height=h)
    if p == 0:
        page.insert_text((60, 90), ARGS['title'], fontsize=22, fontname='hebo')
    y = 130 if p == 0 else 80
    for lvl, title, pno, *_ in toc[p*per:(p+1)*per]:
        x = 60 + (lvl - 1) * 16
        target = pno - 1 + pages_needed
        size = 11 if lvl == 1 else 10
        fn = 'hebo' if lvl == 1 else 'helv'
        t = title if len(title) < 90 else title[:87] + '…'
        page.insert_text((x, y), t, fontsize=size, fontname=fn)
        num = str(pno + pages_needed)
        nw = pymupdf.get_text_length(num, fontname='helv', fontsize=size)
        page.insert_text((w - 60 - nw, y), num, fontsize=size, fontname='helv', color=(0.35,0.35,0.4))
        tw = pymupdf.get_text_length(t, fontname=fn, fontsize=size)
        dots_x0, dots_x1 = x + tw + 6, w - 60 - nw - 6
        if dots_x1 > dots_x0:
            page.draw_line((dots_x0, y), (dots_x1, y), color=(0.75,0.75,0.78), width=0.6, dashes='[1 3] 0')
        page.insert_link({'kind': pymupdf.LINK_GOTO, 'from': pymupdf.Rect(x, y - size, w - 60, y + 4), 'page': target, 'to': pymupdf.Point(0, 0)})
        y += 20
newtoc = [[l, t, p + pages_needed] + rest for l, t, p, *rest in doc.get_toc(simple=False)] if False else [[l, t, p + pages_needed] for l, t, p, *_ in doc.get_toc()]
doc.set_toc([[1, ARGS['title'], 1]] + newtoc)
save_out(doc)
pages_needed`, { files: { 'in.pdf': ctx.bytes }, outputs: ['out.pdf'], vars: { title: v.title, levels: v.levels } });
      return { bytes: r.files['out.pdf'], label: L("Inhaltsverzeichnis eingefügt"), current: 1 };
    },
  },
  // ---------------- Kommentieren ----------------
  modeTool('highlight', L("Textmarker"), I.Highlighter, 'pdfjs:highlight', L("Text markieren – über die Auswahl ziehen oder frei malen."), L("hervorheben markieren gelb")),
  modeTool('underline', L("Unterstreichen"), I.Underline, 'markup:underline', L("Text auswählen, um ihn zu unterstreichen."), 'unterstreichen'),
  modeTool('strike', L("Durchstreichen"), I.Strikethrough, 'markup:strike', L("Text auswählen, um ihn durchzustreichen."), L("durchstreichen streichen")),
  modeTool('freetext', L("Textkommentar"), I.MessageSquareText, 'pdfjs:freetext', L("Sichtbaren Kommentar direkt auf die Seite schreiben."), L("freitext kommentar")),
  modeTool('note', L("Notiz"), I.StickyNote, 'note', L("Notizzettel anheften – erscheint als Symbol, der Text beim Öffnen."), L("haftnotiz kommentar sticky")),
  modeTool('ink', L("Freihand"), I.PenLine, 'pdfjs:ink', L("Mit Maus, Stift oder Finger zeichnen."), L("zeichnen stift")),
  modeTool('rect', L("Rechteck"), I.Square, 'shape:rect', L("Rechteck aufziehen."), L("form kasten rahmen")),
  modeTool('ellipse', L("Ellipse"), I.Circle, 'shape:ellipse', L("Ellipse oder Kreis aufziehen (mit Umschalt: Kreis)."), L("form kreis")),
  modeTool('line', L("Linie"), I.Minus, 'shape:line', L("Linie ziehen."), 'strich'),
  modeTool('arrow', L("Pfeil"), I.MoveUpRight, 'shape:arrow', L("Pfeil ziehen."), 'zeiger'),
  {
    id: 'remove-annots', label: L("Kommentare entfernen"), short: L("Alle entfernen"), icon: I.FileX, desc: L("Notizen, Markierungen und Zeichnungen löschen."), keys: L("annotationen anmerkungen löschen"),
    fields: [{ key: 'links', type: 'check', label: L("Links behalten"), def: true }, { key: 'forms', type: 'check', label: L("Formularfelder behalten"), def: true }, PAGES('all')],
    action: L("Entfernen"),
    run: async (v, ctx) => {
      const pl = await plLoad(ctx.bytes); let n = 0;
      for (const i of pagesOf(v.pages, ctx)) {
        const p = pl.getPage(i); const arr = p.node.Annots(); if (!arr) continue;
        for (let k = arr.size() - 1; k >= 0; k--) {
          const a: any = pl.context.lookup(arr.get(k)); const t = String(a?.get?.(PDFName.of('Subtype')) || '');
          if ((v.links && t === '/Link') || (v.forms && t === '/Widget')) continue;
          arr.remove(k); n++;
        }
      }
      if (!n) return { message: L("Keine Kommentare gefunden.") };
      return { bytes: await plSave(pl), label: L("{0} Kommentar(e) entfernt", n) };
    },
  },
  {
    id: 'flatten-annots', label: L("Kommentare einbrennen"), short: L("Einbrennen"), icon: I.Layers2, engine: 'pymupdf', direct: true, desc: L("Kommentare und Markierungen fest in die Seiten schreiben, sodass sie nicht mehr verändert werden können."), keys: L("abflachen flatten fixieren"),
    run: async (_v, ctx) => {
      const r = await pyRun(`doc = open_in()\ndoc.bake(annots=True, widgets=False)\nsave_out(doc)`, { files: { 'in.pdf': ctx.bytes }, outputs: ['out.pdf'] });
      return { bytes: r.files['out.pdf'], label: L("Kommentare eingebrannt") };
    },
  },
  {
    id: 'export-comments', label: L("Kommentare exportieren"), short: L("Exportieren"), icon: I.FileDown, engine: 'pymupdf', direct: true, desc: L("Alle Kommentare mit Seite, Art, Autor und Text als Tabelle (CSV) speichern."), keys: L("liste übersicht review"),
    run: async (_v, ctx) => {
      const r = await pyRun<any[]>(`
doc = open_in()
rows = []
for page in doc:
    for a in page.annots():
        if a.type[1] in ('Link', 'Widget', 'Popup'): continue
        info = a.info
        txt = (info.get('content') or '').replace('\\r', ' ')
        if not txt and a.type[1] in ('Highlight', 'Underline', 'StrikeOut', 'Squiggly'):
            txt = page.get_textbox(a.rect)
        rows.append([page.number + 1, a.type[1], info.get('title', ''), info.get('modDate', ''), txt.strip()])
rows`, { files: { 'in.pdf': ctx.bytes } });
      if (!r.result.length) return { message: L("Keine Kommentare gefunden.") };
      const esc = (s: any) => `"${String(s ?? '').replace(/"/g, '""')}"`;
      const typ: Record<string, string> = { Highlight: L("Markierung"), Underline: L("Unterstreichung"), StrikeOut: L("Durchstreichung"), Text: L("Notiz"), FreeText: L("Textkommentar"), Ink: L("Freihand"), Square: L("Rechteck"), Circle: L("Ellipse"), Line: L("Linie"), Stamp: L("Stempel") };
      const csv = L("﻿Seite;Art;Autor;Datum;Text\n") + r.result.map((x: any[]) => [x[0], typ[x[1]] || x[1], x[2], x[3], x[4]].map(esc).join(';')).join('\n');
      return { files: [{ name: outName(ctx, L("Kommentare"), 'csv'), data: new Blob([csv], { type: 'text/csv' }) }] };
    },
  },
  // ---------------- Formulare ----------------
  modeTool('field-text', L("Textfeld"), I.TextCursor, 'field:text', L("Textfeld aufziehen."), L("formular eingabefeld"), { short: L("Textfeld") }),
  modeTool('field-check', L("Kontrollkästchen"), I.SquareCheck, 'field:check', L("Kontrollkästchen aufziehen."), L("checkbox ankreuzen")),
  modeTool('field-radio', L("Optionsfeld"), I.CircleDot, 'field:radio', L("Optionsfelder einer Gruppe nacheinander aufziehen."), L("radio auswahl")),
  modeTool('field-choice', L("Auswahlliste"), I.ListChecks, 'field:choice', L("Aufklappliste aufziehen und Einträge festlegen."), L("dropdown liste")),
  modeTool('field-signature', L("Unterschriftsfeld"), I.FileSignature, 'field:signature', L("Feld für eine Unterschrift aufziehen."), 'signaturfeld'),
  {
    id: 'form-highlight', label: L("Felder hervorheben"), short: L("Felder zeigen"), icon: I.Eye, direct: true, desc: L("Ausfüllbare Felder farbig hinterlegen."), active: () => app.prefs.showFieldHighlight,
    run: async () => { app.prefs.showFieldHighlight = !app.prefs.showFieldHighlight; (await import('../app.svelte')).savePrefs(); },
  },
  {
    id: 'form-reset', label: L("Formular zurücksetzen"), short: L("Zurücksetzen"), icon: I.Eraser, direct: true, desc: L("Alle Eingaben in Formularfeldern löschen."), keys: 'leeren',
    run: async (_v, ctx) => {
      const pl = await plLoad(ctx.bytes); const form = pl.getForm(); const fields = form.getFields(); if (!fields.length) return { message: L("Keine Formularfelder vorhanden.") };
      for (const f of fields as any[]) { try { if (f.setText) f.setText(''); else if (f.uncheck) f.uncheck(); else if (f.clear) f.clear(); } catch { /* übergehen */ } }
      return { bytes: await plSave(pl), label: L("Formular zurückgesetzt") };
    },
  },
  {
    id: 'form-export', label: L("Formulardaten exportieren"), short: L("Daten exportieren"), icon: I.FileJson, direct: true, desc: L("Feldnamen und Werte als JSON und CSV speichern."), keys: L("json csv daten"),
    run: async (_v, ctx) => {
      const pl = await plLoad(ctx.bytes); const fields = pl.getForm().getFields() as any[];
      if (!fields.length) return { message: L("Keine Formularfelder vorhanden.") };
      const data: Record<string, any> = {};
      for (const f of fields) { const n = f.getName(); try { data[n] = f.getText ? f.getText() ?? '' : f.isChecked ? f.isChecked() : f.getSelected ? (f.getSelected()[0] ?? f.getSelected() ?? '') : ''; } catch { data[n] = ''; } }
      const csv = L("﻿Feld;Wert\n") + Object.entries(data).map(([k, x]) => `"${k.replace(/"/g, '""')}";"${String(x).replace(/"/g, '""')}"`).join('\n');
      return { files: [{ name: outName(ctx, L("Formulardaten"), 'json'), data: new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }) }, { name: outName(ctx, L("Formulardaten"), 'csv'), data: new Blob([csv], { type: 'text/csv' }) }] };
    },
  },
  {
    id: 'form-import', label: L("Formulardaten importieren"), short: L("Daten importieren"), icon: I.FileUp, desc: L("Werte aus einer JSON-Datei (Feldname → Wert) in das Formular übernehmen."), keys: L("json befüllen"),
    fields: [{ key: 'file', type: 'files', label: L("JSON-Datei"), accept: ['json'] }], action: L("Importieren"),
    run: async (v, ctx) => {
      const f = v.file?.[0]; if (!f) throw new Error(L("Bitte eine JSON-Datei wählen"));
      const data = JSON.parse(new TextDecoder().decode(f.bytes)); const pl = await plLoad(ctx.bytes); const form = pl.getForm(); let n = 0;
      for (const [k, val] of Object.entries(data)) {
        try { const fld: any = form.getField(k); if (fld.setText) fld.setText(String(val ?? '')); else if (fld.check) (val === true || val === 'true' || val === 'Ja' || val === 'on') ? fld.check() : fld.uncheck(); else if (fld.select) fld.select(String(val)); n++; } catch { /* Feld fehlt */ }
      }
      return { bytes: await plSave(pl), label: L("{0} Feld(er) befüllt", n) };
    },
  },
  {
    id: 'form-flatten', label: L("Formular abflachen"), short: L("Abflachen"), icon: I.Layers, direct: true, desc: L("Ausgefüllte Felder fest in die Seite schreiben – danach nicht mehr änderbar."), keys: L("flatten fixieren"),
    run: async (_v, ctx) => {
      const pl = await plLoad(ctx.bytes); const form = pl.getForm(); const n = form.getFields().length;
      if (!n) return { message: L("Keine Formularfelder vorhanden.") };
      try { form.updateFieldAppearances(); } catch { /* egal */ }
      form.flatten({ updateFieldAppearances: false });
      return { bytes: await plSave(pl), label: L("{0} Formularfeld(er) abgeflacht", n) };
    },
  },
  {
    id: 'form-remove', label: L("Formularfelder entfernen"), short: L("Felder löschen"), icon: I.Trash2, desc: L("Alle Formularfelder samt Inhalt aus dem Dokument löschen."), keys: L("felder löschen"),
    fields: [{ key: 'note', type: 'note', text: L("Eingetragene Werte verschwinden mit den Feldern. Zum Behalten vorher „Abflachen“.") }], action: L("Entfernen"),
    run: async (_v, ctx) => {
      const pl = await plLoad(ctx.bytes); const form = pl.getForm(); const fields = form.getFields(); if (!fields.length) return { message: L("Keine Formularfelder vorhanden.") };
      for (const f of fields) form.removeField(f);
      return { bytes: await plSave(pl), label: L("{0} Formularfeld(er) entfernt", fields.length) };
    },
  },
  {
    id: 'form-detect', label: L("Felder automatisch erkennen"), short: L("Felder erkennen"), icon: I.WandSparkles, engine: 'pymupdf', desc: L("Erkennt Linien und Kästchen in Papierformularen und legt dort ausfüllbare Felder an."), keys: L("automatisch erkennen formular erstellen"),
    fields: [PAGES('all')], action: L("Erkennen"),
    run: async (v, ctx) => {
      const r = await pyRun<any[]>(`
doc = open_in()
found = []
for pno in json.loads(ARGS['pages']):
    page = doc[pno]
    W, H = page.rect.width, page.rect.height
    words = page.get_text('words')
    def near_text(r):
        for w in words:
            wr = pymupdf.Rect(w[:4])
            if wr.intersects(r): return True
        return False
    for d in page.get_drawings():
        for it in d['items']:
            if it[0] == 'l':
                p1, p2 = it[1], it[2]
                if abs(p1.y - p2.y) < 0.8 and abs(p2.x - p1.x) > 60:
                    x0, x1 = min(p1.x, p2.x), max(p1.x, p2.x)
                    r = pymupdf.Rect(x0, p1.y - 14, x1, p1.y - 1)
                    if not near_text(r):
                        found.append(['text', pno, r.x0 / W, r.y0 / H, r.width / W, r.height / H])
            elif it[0] == 're':
                r = it[1]
                if 6 <= r.width <= 16 and 6 <= r.height <= 16 and abs(r.width - r.height) < 3:
                    found.append(['check', pno, r.x0 / W, r.y0 / H, r.width / W, r.height / H])
                elif r.width > 60 and 12 <= r.height <= 40 and not near_text(r):
                    found.append(['text', pno, (r.x0 + 1) / W, (r.y0 + 1) / H, (r.width - 2) / W, (r.height - 2) / H])
found`, { files: { 'in.pdf': ctx.bytes }, vars: { pages: JSON.stringify(pagesOf(v.pages, ctx)) } });
      if (!r.result.length) return { message: L("Keine Linien oder Kästchen für Felder gefunden.") };
      const { addItem } = await import('../overlay.svelte');
      let k = 1;
      for (const [t, page, x, y, w, h] of r.result) addItem(ctx.doc!, { page, kind: 'field', ftype: t === 'check' ? 'check' : 'text', x, y, w, h, name: (t === 'check' ? L("Kästchen ") : L("Feld ")) + k++, options: '', multiline: false, group: '' } as any);
      return { message: L("{0} Feld(er) vorgeschlagen. Prüfe sie und klicke „Übernehmen“.", r.result.length) };
    },
  },
];

export async function blankPdf() { const d = await PDFDocument.create(); d.addPage(); return d.save(); }
export { author };
