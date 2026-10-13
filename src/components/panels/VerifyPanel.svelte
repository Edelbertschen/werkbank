<script lang="ts">
  import { active } from '../../lib/app.svelte';
  import { extractSignatures, validateSignature } from '../../lib/sign';
  import { pickFiles } from '../../lib/platform';
  import type { SignatureValidationResult } from '../../lib/vendor/signature-types';
  import forge from 'node-forge';
  import * as I from '../../lib/icons';

  const doc = $derived(active());
  let results = $state<SignatureValidationResult[] | null>(null);
  let trusted = $state<{ name: string; cert: forge.pki.Certificate } | null>(null);
  let err = $state('');

  async function run() {
    if (!doc) return;
    err = ''; results = null;
    try {
      const sigs = extractSignatures(doc.bytes);
      const out: SignatureValidationResult[] = [];
      for (const s of sigs) out.push(await validateSignature(s, doc.bytes, trusted?.cert));
      results = out;
    } catch (e: any) { err = e.message || String(e); }
  }
  $effect(() => { doc?.rev; trusted; run(); });

  async function loadTrusted() {
    const [f] = await pickFiles({ filters: [{ name: 'Zertifikat', extensions: ['cer', 'crt', 'pem', 'der'] }] });
    if (!f) return;
    try {
      const txt = new TextDecoder().decode(f.bytes);
      const cert = txt.includes('BEGIN CERTIFICATE') ? forge.pki.certificateFromPem(txt) : forge.pki.certificateFromAsn1(forge.asn1.fromDer(Array.from(f.bytes, b => String.fromCharCode(b)).join('')));
      trusted = { name: f.name, cert };
    } catch { err = 'Das Zertifikat ließ sich nicht lesen.'; }
  }
  const fmt = (d?: Date) => (d && d.getTime() > 0 ? d.toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : '–');
  function verdict(r: SignatureValidationResult): ['ok' | 'warn' | 'bad', string] {
    if (r.errorMessage && !r.cryptoVerified) return ['bad', 'Signatur nicht prüfbar'];
    if (r.cryptoVerified === false || r.cryptoVerificationStatus === 'failed') return ['bad', 'Ungültig – Dokument oder Signatur verändert'];
    if (r.coverageStatus === 'partial') return ['warn', 'Gültig, danach wurde das Dokument geändert'];
    if (r.isExpired) return ['warn', 'Gültig, aber das Zertifikat ist abgelaufen'];
    if (!r.isTrusted) return ['warn', r.isSelfSigned ? 'Gültig, Zertifikat selbstsigniert' : 'Gültig, Aussteller nicht geprüft'];
    return ['ok', 'Gültig und vertrauenswürdig'];
  }
</script>

<div class="p">
  {#if err}<p class="err">{err}</p>{/if}
  {#if results && !results.length}
    <div class="none"><I.ShieldCheck size={26} strokeWidth={1.4} /><p>Dieses Dokument enthält keine digitale Signatur.</p></div>
  {/if}
  {#each results || [] as r (r.signatureIndex)}
    {@const [kind, text] = verdict(r)}
    <div class="sig {kind}">
      <div class="head">
        {#if kind === 'ok'}<I.BadgeCheck size={18} />{:else if kind === 'warn'}<I.AlertTriangle size={18} />{:else}<I.CircleAlert size={18} />{/if}
        <b>{text}</b>
      </div>
      <dl>
        <dt>Unterzeichner</dt><dd>{r.signerName}{r.signerOrg ? ', ' + r.signerOrg : ''}</dd>
        {#if r.signerEmail}<dt>E-Mail</dt><dd>{r.signerEmail}</dd>{/if}
        <dt>Signiert am</dt><dd>{fmt(r.signatureDate)}</dd>
        <dt>Aussteller</dt><dd>{r.issuer}{r.issuerOrg ? ', ' + r.issuerOrg : ''}</dd>
        <dt>Zertifikat gültig</dt><dd>{fmt(r.validFrom)} – {fmt(r.validTo)}</dd>
        {#if r.reason}<dt>Grund</dt><dd>{r.reason}</dd>{/if}
        {#if r.location}<dt>Ort</dt><dd>{r.location}</dd>{/if}
        <dt>Umfang</dt><dd>{r.coverageStatus === 'full' ? 'Ganzes Dokument' : r.coverageStatus === 'partial' ? 'Älterer Stand (danach geändert)' : 'Unbekannt'}</dd>
        <dt>Verfahren</dt><dd>{r.algorithms.signature} · {r.algorithms.digest}{r.usesInsecureDigest ? ' (veraltet)' : ''}</dd>
      </dl>
    </div>
  {/each}
  <section class="trust">
    <h3>Vertrauen</h3>
    <p class="hint">Ohne Vertrauensliste kann die Werkbank prüfen, ob das Dokument unverändert ist, aber nicht, ob der Aussteller vertrauenswürdig ist. Lade dazu das Zertifikat deiner Zertifizierungsstelle.</p>
    <div class="row">
      <button class="btn sm" onclick={loadTrusted}><I.KeyRound size={13} />{trusted ? 'Anderes Zertifikat' : 'Vertrauenswürdiges Zertifikat laden …'}</button>
      {#if trusted}<span class="tn">{trusted.name}</span>{/if}
    </div>
  </section>
</div>

<style>
  .p { display: flex; flex-direction: column; gap: 12px; }
  .err { color: var(--danger); margin: 0; }
  .none { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 18px; color: var(--text-3); text-align: center; }
  .none p { margin: 0; font-size: 12.5px; }
  .sig { border-radius: 10px; background: var(--surface); box-shadow: var(--shadow-1); overflow: hidden; }
  .head { display: flex; align-items: center; gap: 8px; padding: 9px 12px; font-size: 13px; }
  .sig.ok .head { background: color-mix(in srgb, var(--ok) 12%, transparent); color: color-mix(in srgb, var(--ok) 75%, var(--text)); }
  .sig.warn .head { background: color-mix(in srgb, var(--warn) 13%, transparent); color: color-mix(in srgb, var(--warn) 70%, var(--text)); }
  .sig.bad .head { background: color-mix(in srgb, var(--danger) 12%, transparent); color: var(--danger); }
  dl { margin: 0; padding: 8px 12px 10px; display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 3px 10px; font-size: 12px; }
  dt { color: var(--text-3); }
  dd { margin: 0; overflow-wrap: anywhere; }
  .trust { display: flex; flex-direction: column; gap: 6px; margin-top: 6px; }
  h3 { margin: 0; font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-3); }
  .hint { margin: 0; font-size: 11.5px; color: var(--text-3); line-height: 1.45; }
  .row { display: flex; align-items: center; gap: 8px; }
  .tn { font-size: 12px; color: var(--text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
