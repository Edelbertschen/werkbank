// Schützen: Passwort, Berechtigungen, Signaturen, Bereinigen
import * as I from '../icons';
import type { Tool } from './types';
import { outName } from './common';
import { pyRun, qpdf } from '../engines';
import { app } from '../app.svelte';
import type { Protection } from '../doc.svelte';

export function qpdfEncryptArgs(p: Protection) {
  const args = ['--encrypt', p.user, p.owner || p.user || crypto.randomUUID(), '256'];
  if (!p.print) args.push('--print=none');
  if (!p.copy) args.push('--extract=n');
  if (!p.modify) args.push('--modify=none');
  else if (!p.annotate) args.push('--modify=form');
  if (!p.forms) args.push('--form=n');
  if (!p.annotate) args.push('--annotate=n');
  args.push('--', 'IN', 'OUT');
  return args;
}
export async function encryptBytes(bytes: Uint8Array, p: Protection) { return qpdf(qpdfEncryptArgs(p), bytes); }


import { L } from '../i18n';
export const protectTools: Tool[] = [
  {
    id: 'protect', label: L("Mit Passwort schützen"), short: L("Passwort"), icon: I.Lock,
    desc: L("AES-256-Verschlüsselung und Berechtigungen. Wird beim Speichern angewendet – solange das Dokument hier offen ist, kannst du weiterarbeiten."), keys: L("verschlüsseln passwort sperren aes"),
    fields: [
      { key: 'user', type: 'password', label: L("Passwort zum Öffnen"), def: '', hint: L("Leer lassen, wenn jeder öffnen, aber nicht alles darf.") },
      { key: 'owner', type: 'password', label: L("Rechte-Passwort"), def: '', hint: L("Nötig, um die Einschränkungen später aufzuheben.") },
      { key: 'h', type: 'heading', label: L("Erlaubt") },
      { key: 'print', type: 'check', label: L("Drucken"), def: true },
      { key: 'copy', type: 'check', label: L("Text und Bilder kopieren"), def: true },
      { key: 'forms', type: 'check', label: L("Formulare ausfüllen"), def: true },
      { key: 'annotate', type: 'check', label: L("Kommentieren"), def: true },
      { key: 'modify', type: 'check', label: L("Inhalt ändern"), def: false },
    ],
    action: L("Schutz festlegen"),
    run: async (v, ctx) => {
      if (!v.user && !v.owner) throw new Error(L("Bitte mindestens ein Passwort angeben"));
      ctx.doc!.protection = { user: v.user || '', owner: v.owner || v.user, print: v.print, copy: v.copy, forms: v.forms, annotate: v.annotate, modify: v.modify };
      return { message: L("Schutz festgelegt. Er wird beim nächsten Speichern angewendet.") };
    },
  },
  {
    id: 'unprotect', label: L("Schutz entfernen"), icon: I.LockOpen, direct: true, desc: L("Passwort und Einschränkungen beim nächsten Speichern weglassen."), keys: L("entsperren passwort entfernen"),
    disabled: () => !(app.docs.find(d => d.id === app.activeId)?.protection || app.docs.find(d => d.id === app.activeId)?.wasEncrypted),
    run: async (_v, ctx) => { ctx.doc!.protection = null; ctx.doc!.wasEncrypted = false; return { message: L("Beim nächsten Speichern wird das Dokument ohne Schutz geschrieben.") }; },
  },
  { id: 'sign-digital', label: L("Digital signieren"), short: L("Signieren"), icon: I.BadgeCheck, desc: L("Rechtsgültig mit einem Zertifikat (.p12/.pfx) signieren – sichtbar oder unsichtbar, auf Wunsch mit Zeitstempel."), keys: L("signatur zertifikat pades qualifiziert p12 pfx"), loadPanel: () => import('../../components/panels/SignPanel.svelte') },
  { id: 'verify', label: L("Signaturen prüfen"), short: L("Prüfen"), icon: I.ShieldCheck, desc: L("Zeigt Unterzeichner, Zertifikat und ob das Dokument seit der Signatur verändert wurde."), keys: L("validieren gültig echtheit"), loadPanel: () => import('../../components/panels/VerifyPanel.svelte') },
  {
    id: 'make-cert', label: L("Eigenes Zertifikat erstellen"), short: L("Zertifikat"), icon: I.KeyRound, noDoc: true,
    desc: L("Selbstsigniertes Zertifikat für interne Freigaben. Für qualifizierte Signaturen brauchst du ein Zertifikat einer Vertrauensstelle."), keys: L("zertifikat erstellen selbstsigniert p12"),
    fields: [
      { key: 'name', type: 'text', label: L("Name"), def: '' }, { key: 'email', type: 'text', label: 'E-Mail', def: '' }, { key: 'org', type: 'text', label: L("Organisation"), def: '' },
      { key: 'years', type: 'number', label: L("Gültig (Jahre)"), def: 3, min: 1, max: 20 },
      { key: 'pw', type: 'password', label: L("Passwort für die Zertifikatsdatei"), def: '' },
    ],
    action: L("Erstellen"),
    run: async v => {
      if (!v.name) throw new Error(L("Bitte einen Namen angeben"));
      if ((v.pw || '').length < 6) throw new Error(L("Das Passwort sollte mindestens 6 Zeichen haben"));
      await new Promise(r => setTimeout(r, 30));
      const { createSelfSigned } = await import('../sign');
      const p12 = createSelfSigned({ name: v.name, email: v.email, org: v.org, years: v.years, password: v.pw });
      return { files: [{ name: `${v.name.replace(/[^\p{L}\p{N} _-]/gu, '')}.p12`, data: p12, filters: [{ name: L("Zertifikat"), extensions: ['p12', 'pfx'] }] }], message: L("Zertifikat erstellt. Bewahre Datei und Passwort sicher auf.") };
    },
  },
  {
    id: 'sanitize', label: L("Dokument bereinigen"), short: L("Bereinigen"), icon: I.ShieldCheck, engine: 'pymupdf',
    desc: L("Versteckte Inhalte vor dem Weitergeben entfernen: Metadaten, Skripte, Anhänge, verborgener Text und mehr."), keys: L("säubern datenschutz javascript anonym metadaten"),
    fields: [
      { key: 'metadata', type: 'check', label: L("Metadaten (Autor, Software, Daten)"), def: true },
      { key: 'javascript', type: 'check', label: L("JavaScript und automatische Aktionen"), def: true },
      { key: 'files', type: 'check', label: L("Eingebettete Dateien und Dateianhänge"), def: true },
      { key: 'thumbs', type: 'check', label: L("Vorschaubilder"), def: true },
      { key: 'hidden', type: 'check', label: L("Verborgenen Text (z. B. weiß auf weiß)"), def: false },
      { key: 'links', type: 'check', label: L("Links"), def: false },
      { key: 'fields', type: 'check', label: L("Formulareingaben zurücksetzen"), def: false },
      { key: 'annots', type: 'check', label: L("Kommentare"), def: false },
    ],
    action: L("Bereinigen"),
    run: async (v, ctx) => {
      const r = await pyRun(`
a = ARGS
doc = open_in()
doc.scrub(attached_files=a['files'], embedded_files=a['files'], metadata=a['metadata'], xml_metadata=a['metadata'], javascript=a['javascript'], thumbnails=a['thumbs'], hidden_text=a['hidden'], remove_links=a['links'], reset_fields=a['fields'], reset_responses=a['annots'], clean_pages=False, redactions=True, redact_images=0)
if a['annots']:
    for page in doc:
        for an in list(page.annots()):
            if an.type[1] not in ('Link', 'Widget'):
                page.delete_annot(an)
if a['javascript']:
    cat = doc.pdf_catalog()
    for key in ('OpenAction', 'AA'):
        try: doc.xref_set_key(cat, key, 'null')
        except Exception: pass
save_out(doc, garbage=4, deflate=True)`, { files: { 'in.pdf': ctx.bytes }, outputs: ['out.pdf'], vars: v });
      return { bytes: r.files['out.pdf'], label: L("Dokument bereinigt") };
    },
  },
  { id: 'metadata', label: L("Dokumenteigenschaften"), short: L("Eigenschaften"), icon: I.Tag, desc: L("Titel, Autor, Thema und Stichwörter ansehen und ändern."), keys: L("metadaten titel autor info eigenschaften"), loadPanel: () => import('../../components/panels/MetaPanel.svelte') },
  {
    id: 'strip-metadata', label: L("Metadaten entfernen"), short: L("Metadaten weg"), icon: I.EyeOff, direct: true, engine: 'pymupdf', desc: L("Autor, Programm, Datumsangaben und XMP-Daten löschen."), keys: L("anonym metadaten"),
    run: async (_v, ctx) => {
      const r = await pyRun(`doc = open_in()\ndoc.set_metadata({})\ndoc.del_xml_metadata()\nsave_out(doc)`, { files: { 'in.pdf': ctx.bytes }, outputs: ['out.pdf'] });
      return { bytes: r.files['out.pdf'], label: L("Metadaten entfernt") };
    },
  },
  {
    id: 'save-protected-copy', label: L("Geschützte Kopie speichern"), short: L("Geschützte Kopie"), icon: I.FileLock, desc: L("Eine verschlüsselte Kopie speichern, ohne das offene Dokument zu verändern."), keys: L("kopie passwort versenden"),
    fields: [{ key: 'pw', type: 'password', label: L("Passwort zum Öffnen"), def: '' }, { key: 'print', type: 'check', label: L("Drucken erlauben"), def: true }, { key: 'copy', type: 'check', label: L("Kopieren erlauben"), def: false }],
    action: L("Speichern"),
    run: async (v, ctx) => {
      if (!v.pw) throw new Error(L("Bitte ein Passwort angeben"));
      const data = await encryptBytes(ctx.bytes, { user: v.pw, owner: v.pw, print: v.print, copy: v.copy, forms: true, annotate: false, modify: false });
      return { files: [{ name: outName(ctx, L("geschützt")) as string, data }] };
    },
  },
];
