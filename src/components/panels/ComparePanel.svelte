<script lang="ts">
  import { app, active } from '../../lib/app.svelte';
  import { dialog } from '../../lib/dialogs.svelte';
  import { refBytes } from '../../lib/tools/common';
  import { withBusy } from '../../lib/actions';
  import Fields from '../Fields.svelte';
  import CompareView from '../dialogs/CompareView.svelte';
  import type { Field } from '../../lib/fields';

  const doc = $derived(active());
  const fields: Field[] = [{ key: 'other', type: 'doc', label: 'Vergleichen mit (neuere Fassung)' }];
  let values = $state<Record<string, any>>({});

  async function start() {
    if (!doc || !values.other) return;
    const other = values.other;
    const b = await withBusy('Fassung wird geladen', () => refBytes(other));
    await dialog({ title: 'Vergleich', component: CompareView, props: { a: { name: doc.name, bytes: doc.bytes }, b: { name: other.name, bytes: b } }, width: Math.min(1400, innerWidth - 48) });
  }
</script>

<div class="p">
  <Fields {fields} bind:values />
  <p class="hint">„{doc?.title}“ gilt als ältere Fassung. Unterschiede werden als Bild (rot = entfernt, blau = neu) und als Textvergleich gezeigt.</p>
  <button class="btn primary" disabled={!values.other} onclick={start}>Vergleich öffnen</button>
  {#if app.docs.length < 2}<p class="hint">Tipp: Öffne die zweite Fassung zuerst in einem eigenen Tab oder wähle sie hier von der Festplatte.</p>{/if}
</div>

<style>
  .p { display: flex; flex-direction: column; gap: 12px; }
  .hint { margin: 0; font-size: 12px; color: var(--text-3); line-height: 1.45; }
  .btn { align-self: flex-start; }
</style>
