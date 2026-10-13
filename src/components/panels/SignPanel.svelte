<script lang="ts">
  import { L, intlLocale } from '../../lib/i18n';
  import { app, active, toast, savePrefs } from '../../lib/app.svelte';
  import { pickFiles } from '../../lib/platform';
  import { readP12, signPdf, signatureAppearance, type CertInfo } from '../../lib/sign';
  import { withBusy, applyResult } from '../../lib/actions';
  import { openTool } from '../../lib/ui.svelte';
  import { dataUrlToBytes } from '../../lib/util';
  import * as I from '../../lib/icons';

  const doc = $derived(active());
  let cert = $state<{ name: string; bytes: Uint8Array } | null>(null);
  let pw = $state('');
  let info = $state<CertInfo | null>(null);
  let err = $state('');
  let visible = $state(true);
  let where = $state<'last' | 'first' | 'current'>('last');
  let corner = $state<'br' | 'bl' | 'tr'>('br');
  let useHand = $state(app.prefs.signatures.length > 0);
  let hand = $state(app.prefs.signatures[0] || '');
  let reason = $state(L("Freigabe"));
  let location = $state('');
  let contact = $state('');
  let perm = $state<'0' | '2' | '1'>('0');
  let tsa = $state(false);
  let tsaUrl = $state('http://timestamp.digicert.com');
  let ltv = $state(false);

  async function chooseCert() {
    const [f] = await pickFiles({ filters: [{ name: L("Zertifikat"), extensions: ['p12', 'pfx'] }], title: L("Zertifikat wählen") });
    if (!f) return;
    cert = { name: f.name, bytes: f.bytes }; info = null; err = '';
    if (pw) check();
  }
  function check() {
    if (!cert) return;
    try { info = readP12(cert.bytes, pw); err = ''; }
    catch (e: any) { info = null; err = e.message; }
  }
  const expired = $derived(!!info && info.validTo < new Date());

  async function sign() {
    if (!doc || !cert) return;
    if (doc.protection) { toast(L("Für ein Dokument mit Passwortschutz zuerst „Schutz entfernen“ wählen – die Verschlüsselung beim Speichern würde die Signatur ungültig machen."), { kind: 'error', ms: 10000 }); return; }
    check(); if (!info) return;
    try {
      const base = await doc.baked();
      const out = await withBusy(L("Dokument wird signiert"), async progress => {
        let visibleOpt;
        if (visible) {
          const pageIdx = where === 'first' ? 0 : where === 'current' ? doc.current - 1 : doc.numPages - 1;
          const p = doc.pages[pageIdx];
          const w = Math.min(210, p.w * 0.42), h = 64, m = 36;
          const x = corner === 'bl' ? m : p.w - w - m;
          const y = corner === 'tr' ? m : p.h - h - m;
          progress(-1, L("Erscheinungsbild wird erzeugt …"));
          const png = await signatureAppearance({ name: info!.cn, reason, location, date: new Date(), image: useHand && hand ? hand : undefined, w, h });
          visibleOpt = { page: pageIdx, x, y, w, h, png };
        }
        progress(-1, tsa ? L("Zeitstempel wird angefordert …") : L("Signatur wird berechnet …"));
        return signPdf(base, { p12: cert!.bytes, password: pw, reason, location, contact, permission: +perm as any, tsa: tsa ? tsaUrl : undefined, ltv, visible: visibleOpt });
      });
      await applyResult({ bytes: out, label: L("Digital signiert von {0}", info.cn) });
      toast(L("Signiert. Jetzt speichern – spätere Änderungen machen die Signatur ungültig."), { kind: 'ok', ms: 9000 });
      if (!app.prefs.author) { app.prefs.author = info.cn; savePrefs(); }
    } catch (e: any) {
      toast(L("Signieren fehlgeschlagen: ") + (e.message || e), { kind: 'error' });
    }
  }
  void dataUrlToBytes;
</script>

<div class="p">
  <section>
    <h3>{L("Zertifikat")}</h3>
    <div class="cert">
      <span class="ic"><I.KeyRound size={16} /></span>
      <span class="n">{cert ? cert.name : L("Kein Zertifikat gewählt")}</span>
      <button class="btn sm" onclick={chooseCert}>{cert ? L("Ändern") : L("Wählen …")}</button>
    </div>
    <input class="input" type="password" placeholder={L("Passwort des Zertifikats")} bind:value={pw} onblur={check} onkeydown={e => e.key === 'Enter' && check()} aria-label={L("Zertifikatspasswort")} />
    {#if err}<p class="err">{err}</p>{/if}
    {#if info}
      <div class="info">
        <b>{info.cn}</b>{#if info.org}<span>{info.org}</span>{/if}
        <span>{L("Ausgestellt von {0}{1}", info.issuer, info.selfSigned ? ' (selbstsigniert)' : '')}</span>
        <span class:bad={expired}>{L("Gültig bis {0}{1}", info.validTo.toLocaleDateString(intlLocale()), expired ? L(" – abgelaufen") : '')}</span>
      </div>
    {/if}
    <button class="link" onclick={() => openTool('make-cert')}>{L("Noch kein Zertifikat? Eigenes erstellen …")}</button>
  </section>

  <section>
    <h3>{L("Darstellung")}</h3>
    <label class="check"><input type="checkbox" bind:checked={visible} /> {L("Sichtbares Signaturfeld")}</label>
    {#if visible}
      <div class="two">
        <select class="select" bind:value={where} aria-label={L("Seite")}><option value="last">{L("Letzte Seite")}</option><option value="first">{L("Erste Seite")}</option><option value="current">{L("Aktuelle Seite")}</option></select>
        <select class="select" bind:value={corner} aria-label="Position"><option value="br">{L("Unten rechts")}</option><option value="bl">{L("Unten links")}</option><option value="tr">{L("Oben rechts")}</option></select>
      </div>
      {#if app.prefs.signatures.length}
        <label class="check"><input type="checkbox" bind:checked={useHand} /> {L("Handschriftliche Unterschrift einfügen")}</label>
        {#if useHand}<div class="hands">{#each app.prefs.signatures as s (s)}<button class:on={hand === s} onclick={() => (hand = s)} aria-label={L("Unterschrift wählen")}><img src={s} alt="" /></button>{/each}</div>{/if}
      {/if}
    {/if}
  </section>

  <section>
    <h3>{L("Angaben")}</h3>
    <input class="input" placeholder={L("Grund, z. B. Freigabe")} bind:value={reason} aria-label={L("Grund")} />
    <input class="input" placeholder={L("Ort")} bind:value={location} aria-label={L("Ort")} />
    <input class="input" placeholder={L("Kontakt (optional)")} bind:value={contact} aria-label={L("Kontakt")} />
  </section>

  <section>
    <h3>{L("Nach dem Signieren erlaubt")}</h3>
    <select class="select" bind:value={perm} aria-label={L("Berechtigung")}>
      <option value="0">{L("Alles (weitere Signaturen, Kommentare)")}</option>
      <option value="2">{L("Nur Formulare ausfüllen und weitere Signaturen")}</option>
      <option value="1">{L("Keine Änderungen")}</option>
    </select>
  </section>

  <section>
    <h3>{L("Zeitstempel")}</h3>
    <label class="check"><input type="checkbox" bind:checked={tsa} /> {L("Vertrauenswürdigen Zeitstempel einholen")}</label>
    {#if tsa}<input class="input" bind:value={tsaUrl} aria-label={L("Zeitstempeldienst")} />{/if}
    <label class="check"><input type="checkbox" bind:checked={ltv} /> {L("Langzeitprüfung (LTV) aktivieren")}</label>
    {#if tsa || ltv}<p class="hint">{L("Benötigt eine Internetverbindung.")}</p>{/if}
  </section>

  <button class="btn primary big" disabled={!cert || !pw} onclick={sign}><I.BadgeCheck size={15} />{L("Signieren")}</button>
  <p class="hint">{L("Die Signatur sichert den aktuellen Stand. Danach bitte speichern; weitere Änderungen machen sie ungültig.")}</p>
</div>

<style>
  .p { display: flex; flex-direction: column; gap: 18px; }
  section { display: flex; flex-direction: column; gap: 7px; }
  h3 { margin: 0; font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-3); }
  .cert { display: flex; align-items: center; gap: 8px; padding: 8px 8px 8px 10px; border-radius: 8px; background: var(--surface); box-shadow: var(--shadow-1); }
  .cert .ic { color: var(--accent-text); display: grid; }
  .cert .n { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12.5px; }
  .info { display: flex; flex-direction: column; gap: 2px; font-size: 12px; color: var(--text-2); background: var(--accent-softer); padding: 8px 10px; border-radius: 8px; }
  .info b { color: var(--text); font-size: 13px; }
  .bad { color: var(--danger); }
  .err { margin: 0; color: var(--danger); font-size: 12px; }
  .link { border: 0; background: none; color: var(--accent-text); text-align: left; padding: 0; font-size: 12px; }
  .link:hover { text-decoration: underline; }
  .check { display: flex; gap: 8px; align-items: center; font-size: 12.5px; }
  .check input { accent-color: var(--accent); }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .hands { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
  .hands button { height: 44px; border: 0; border-radius: 6px; background: #fff; box-shadow: inset 0 0 0 1px var(--line-strong); padding: 4px; display: grid; place-items: center; }
  .hands button.on { box-shadow: inset 0 0 0 2px var(--accent); }
  .hands img { max-height: 100%; max-width: 100%; }
  .hint { margin: 0; font-size: 11.5px; color: var(--text-3); line-height: 1.45; }
  .big { height: 32px; }
</style>
