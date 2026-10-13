// Schützen: Passwort, Berechtigungen, Signaturen, Bereinigen
import * as I from '../icons';
import type { Tool } from './types';
import { outName } from './common';
import { pyRun, qpdf } from '../engines';
import { createSelfSigned } from '../sign';
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

import SignPanel from '../../components/panels/SignPanel.svelte';
import VerifyPanel from '../../components/panels/VerifyPanel.svelte';
import MetaPanel from '../../components/panels/MetaPanel.svelte';

export const protectTools: Tool[] = [
  {
    id: 'protect', label: 'Mit Passwort schützen', short: 'Passwort', icon: I.Lock,
    desc: 'AES-256-Verschlüsselung und Berechtigungen. Wird beim Speichern angewendet – solange das Dokument hier offen ist, kannst du weiterarbeiten.', keys: 'verschlüsseln passwort sperren aes',
    fields: [
      { key: 'user', type: 'password', label: 'Passwort zum Öffnen', def: '', hint: 'Leer lassen, wenn jeder öffnen, aber nicht alles darf.' },
      { key: 'owner', type: 'password', label: 'Rechte-Passwort', def: '', hint: 'Nötig, um die Einschränkungen später aufzuheben.' },
      { key: 'h', type: 'heading', label: 'Erlaubt' },
      { key: 'print', type: 'check', label: 'Drucken', def: true },
      { key: 'copy', type: 'check', label: 'Text und Bilder kopieren', def: true },
      { key: 'forms', type: 'check', label: 'Formulare ausfüllen', def: true },
      { key: 'annotate', type: 'check', label: 'Kommentieren', def: true },
      { key: 'modify', type: 'check', label: 'Inhalt ändern', def: false },
    ],
    action: 'Schutz festlegen',
    run: async (v, ctx) => {
      if (!v.user && !v.owner) throw new Error('Bitte mindestens ein Passwort angeben');
      ctx.doc!.protection = { user: v.user || '', owner: v.owner || v.user, print: v.print, copy: v.copy, forms: v.forms, annotate: v.annotate, modify: v.modify };
      return { message: 'Schutz festgelegt. Er wird beim nächsten Speichern angewendet.' };
    },
  },
  {
    id: 'unprotect', label: 'Schutz entfernen', icon: I.LockOpen, direct: true, desc: 'Passwort und Einschränkungen beim nächsten Speichern weglassen.', keys: 'entsperren passwort entfernen',
    disabled: () => !(app.docs.find(d => d.id === app.activeId)?.protection || app.docs.find(d => d.id === app.activeId)?.wasEncrypted),
    run: async (_v, ctx) => { ctx.doc!.protection = null; ctx.doc!.wasEncrypted = false; return { message: 'Beim nächsten Speichern wird das Dokument ohne Schutz geschrieben.' }; },
  },
  { id: 'sign-digital', label: 'Digital signieren', short: 'Signieren', icon: I.BadgeCheck, desc: 'Rechtsgültig mit einem Zertifikat (.p12/.pfx) signieren – sichtbar oder unsichtbar, auf Wunsch mit Zeitstempel.', keys: 'signatur zertifikat pades qualifiziert p12 pfx', panel: SignPanel },
  { id: 'verify', label: 'Signaturen prüfen', short: 'Prüfen', icon: I.ShieldCheck, desc: 'Zeigt Unterzeichner, Zertifikat und ob das Dokument seit der Signatur verändert wurde.', keys: 'validieren gültig echtheit', panel: VerifyPanel },
  {
    id: 'make-cert', label: 'Eigenes Zertifikat erstellen', short: 'Zertifikat', icon: I.KeyRound, noDoc: true,
    desc: 'Selbstsigniertes Zertifikat für interne Freigaben. Für qualifizierte Signaturen brauchst du ein Zertifikat einer Vertrauensstelle.', keys: 'zertifikat erstellen selbstsigniert p12',
    fields: [
      { key: 'name', type: 'text', label: 'Name', def: '' }, { key: 'email', type: 'text', label: 'E-Mail', def: '' }, { key: 'org', type: 'text', label: 'Organisation', def: '' },
      { key: 'years', type: 'number', label: 'Gültig (Jahre)', def: 3, min: 1, max: 20 },
      { key: 'pw', type: 'password', label: 'Passwort für die Zertifikatsdatei', def: '' },
    ],
    action: 'Erstellen',
    run: async v => {
      if (!v.name) throw new Error('Bitte einen Namen angeben');
      if ((v.pw || '').length < 6) throw new Error('Das Passwort sollte mindestens 6 Zeichen haben');
      await new Promise(r => setTimeout(r, 30));
      const p12 = createSelfSigned({ name: v.name, email: v.email, org: v.org, years: v.years, password: v.pw });
      return { files: [{ name: `${v.name.replace(/[^\p{L}\p{N} _-]/gu, '')}.p12`, data: p12, filters: [{ name: 'Zertifikat', extensions: ['p12', 'pfx'] }] }], message: 'Zertifikat erstellt. Bewahre Datei und Passwort sicher auf.' };
    },
  },
  {
    id: 'sanitize', label: 'Dokument bereinigen', short: 'Bereinigen', icon: I.ShieldCheck, engine: 'pymupdf',
    desc: 'Versteckte Inhalte vor dem Weitergeben entfernen: Metadaten, Skripte, Anhänge, verborgener Text und mehr.', keys: 'säubern datenschutz javascript anonym metadaten',
    fields: [
      { key: 'metadata', type: 'check', label: 'Metadaten (Autor, Software, Daten)', def: true },
      { key: 'javascript', type: 'check', label: 'JavaScript und automatische Aktionen', def: true },
      { key: 'files', type: 'check', label: 'Eingebettete Dateien und Dateianhänge', def: true },
      { key: 'thumbs', type: 'check', label: 'Vorschaubilder', def: true },
      { key: 'hidden', type: 'check', label: 'Verborgenen Text (z. B. weiß auf weiß)', def: false },
      { key: 'links', type: 'check', label: 'Links', def: false },
      { key: 'fields', type: 'check', label: 'Formulareingaben zurücksetzen', def: false },
      { key: 'annots', type: 'check', label: 'Kommentare', def: false },
    ],
    action: 'Bereinigen',
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
      return { bytes: r.files['out.pdf'], label: 'Dokument bereinigt' };
    },
  },
  { id: 'metadata', label: 'Dokumenteigenschaften', short: 'Eigenschaften', icon: I.Tag, desc: 'Titel, Autor, Thema und Stichwörter ansehen und ändern.', keys: 'metadaten titel autor info eigenschaften', panel: MetaPanel },
  {
    id: 'strip-metadata', label: 'Metadaten entfernen', short: 'Metadaten weg', icon: I.EyeOff, direct: true, engine: 'pymupdf', desc: 'Autor, Programm, Datumsangaben und XMP-Daten löschen.', keys: 'anonym metadaten',
    run: async (_v, ctx) => {
      const r = await pyRun(`doc = open_in()\ndoc.set_metadata({})\ndoc.del_xml_metadata()\nsave_out(doc)`, { files: { 'in.pdf': ctx.bytes }, outputs: ['out.pdf'] });
      return { bytes: r.files['out.pdf'], label: 'Metadaten entfernt' };
    },
  },
  {
    id: 'save-protected-copy', label: 'Geschützte Kopie speichern', short: 'Geschützte Kopie', icon: I.FileLock, desc: 'Eine verschlüsselte Kopie speichern, ohne das offene Dokument zu verändern.', keys: 'kopie passwort versenden',
    fields: [{ key: 'pw', type: 'password', label: 'Passwort zum Öffnen', def: '' }, { key: 'print', type: 'check', label: 'Drucken erlauben', def: true }, { key: 'copy', type: 'check', label: 'Kopieren erlauben', def: false }],
    action: 'Speichern',
    run: async (v, ctx) => {
      if (!v.pw) throw new Error('Bitte ein Passwort angeben');
      const data = await encryptBytes(ctx.bytes, { user: v.pw, owner: v.pw, print: v.print, copy: v.copy, forms: true, annotate: false, modify: false });
      return { files: [{ name: outName(ctx, 'geschützt') as string, data }] };
    },
  },
];
