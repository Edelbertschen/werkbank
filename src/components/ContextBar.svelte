<script lang="ts">
  import { L } from '../lib/i18n';
  import type { Doc } from '../lib/doc.svelte';
  import { clearOverlay, itemsOf } from '../lib/overlay.svelte';
  import { flush, withBusy } from '../lib/actions';
  import { app, toast } from '../lib/app.svelte';
  import { confirm } from '../lib/dialogs.svelte';
  import * as I from '../lib/icons';

  let { doc }: { doc: Doc } = $props();
  const count = $derived(doc.overlayCount);
  const redactions = $derived(count ? itemsOf(doc).filter(i => i.kind === 'redact').length : 0);
  const show = $derived(count > 0 || doc.pendingEdits);

  let busy = false;
  async function apply() {
    if (busy) return;
    busy = true;
    try { await applyInner(); } finally { busy = false; }
  }
  async function applyInner() {
    if (redactions && !(await confirm(L("Endgültig schwärzen?"), L("{0} Bereich(e) werden geschwärzt. Text und Bilddaten darunter werden aus dem Dokument entfernt.", redactions), L("Schwärzen"), { danger: true }))) return;
    try { await withBusy(L("Änderungen werden übernommen"), () => flush(doc)); app.mode = 'select'; }
    catch (e: any) { toast(L("Übernehmen fehlgeschlagen: ") + (e.message || e), { kind: 'error' }); }
  }
  async function discard() {
    clearOverlay(doc);
    if (doc.pendingEdits) await doc.load();
    app.viewerRev++;
  }
</script>

{#if show}
  <div class="cbar" role="status">
    <span class="dot"></span>
    <span class="t">
      {#if count}{count} {count === 1 ? L("Änderung") : L("Änderungen")} offen{#if redactions}{redactions === 1 ? L(" · davon 1 Schwärzung") : L(" · davon {0} Schwärzungen", redactions)}{/if}{/if}
      {#if count && doc.pendingEdits} · {/if}
      {#if doc.pendingEdits}{L("Anmerkungen oder Eingaben noch nicht übernommen")}{/if}
    </span>
    <button class="btn sm ghost" onclick={discard}>{L("Verwerfen")}</button>
    <button class="btn sm primary" onclick={apply}><I.Check size={13} strokeWidth={2.2} />{L("Übernehmen")}</button>
  </div>
{/if}

<style>
  .cbar { position: absolute; left: 50%; top: 12px; transform: translateX(-50%); z-index: 40; display: flex; align-items: center; gap: 8px; padding: 5px 6px 5px 12px; border-radius: 10px; background: var(--surface); box-shadow: var(--shadow-pop); animation: pop-in 0.14s; max-width: calc(100% - 32px); }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--brand); flex: none; }
  .t { font-size: 12.5px; color: var(--text-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
</style>
