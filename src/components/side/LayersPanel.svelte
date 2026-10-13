<script lang="ts">
  import Empty from '../Empty.svelte';
  import { L } from '../../lib/i18n';
  import type { Doc } from '../../lib/doc.svelte';
  import { viewer } from '../../lib/viewer.svelte';
  import * as I from '../../lib/icons';

  let { doc }: { doc: Doc } = $props();
  let groups = $state<{ id: string; name: string; visible: boolean }[]>([]);
  let cfg: any = null;

  async function load() {
    groups = [];
    try {
      cfg = await viewer.inst?.optionalContentConfigPromise;
      if (!cfg) return;
      const out: typeof groups = [];
      for (const [id, g] of cfg) out.push({ id, name: g.name || id, visible: g.visible });
      groups = out;
    } catch { groups = []; }
  }
  $effect(() => { doc.rev; setTimeout(load, 300); });

  function toggle(g: { id: string; visible: boolean }) {
    g.visible = !g.visible;
    cfg.setVisibility(g.id, g.visible);
    viewer.inst.optionalContentConfigPromise = Promise.resolve(cfg);
  }
</script>

<div class="list scroll">
  {#if !groups.length}
    <Empty icon={I.Layers} title={L("Keine Ebenen")} text={L("Ebenen kommen vor allem in CAD-Plänen, Karten und Druckvorlagen vor.")} />
  {:else}
    <p class="hint">{L("Ein- und Ausblenden ändert nur die Anzeige.")}</p>
    {#each groups as g (g.id)}
      <button class="row" onclick={() => toggle(g)} aria-pressed={g.visible}>
        {#if g.visible}<I.Eye size={14} />{:else}<I.EyeOff size={14} />{/if}
        <span class:off={!g.visible}>{g.name}</span>
      </button>
    {/each}
  {/if}
</div>

<style>
  .list { flex: 1; padding: 0 8px 12px; }
  .hint { color: var(--text-3); font-size: 12px; padding: 4px 6px; line-height: 1.5; margin: 0 0 4px; }
  .row { width: 100%; display: flex; align-items: center; gap: 8px; border: 0; background: none; padding: 6px 8px; border-radius: 6px; text-align: left; color: var(--text-2); }
  .row:hover { background: var(--hover); }
  .row span { color: var(--text); }
  .row span.off { color: var(--text-3); text-decoration: line-through; }
</style>
