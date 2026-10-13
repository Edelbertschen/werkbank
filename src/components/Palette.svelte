<script lang="ts">
  import { L } from '../lib/i18n';
  import { app, active } from '../lib/app.svelte';
  import { searchTools } from '../lib/search';
  import { RIBBON } from '../lib/ribbon';
  import { openTool } from '../lib/ui.svelte';
  import { label as scLabel } from '../lib/shortcuts';
  import { tick } from 'svelte';
  import * as I from '../lib/icons';

  let q = $state('');
  let idx = $state(0);
  let input: HTMLInputElement | undefined = $state();
  const doc = $derived(active());

  // Registerkarte je Werkzeug (für die Einordnung)
  const tabOf = new Map<string, string>();
  for (const t of RIBBON) for (const g of t.groups) for (const it of g.items) { const id = typeof it === 'string' ? it : 'id' in it ? it.id : ''; if (id && !tabOf.has(id)) tabOf.set(id, t.label); }

  const results = $derived(searchTools(q, { hasDoc: !!doc }).slice(0, 40));

  $effect(() => { if (app.palette) { q = ''; idx = 0; tick().then(() => input?.focus()); } });
  $effect(() => { q; idx = 0; });

  function run(i: number) { const t = results[i]; if (!t) return; app.palette = false; openTool(t.id); }
  function key(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); idx = Math.min(results.length - 1, idx + 1); scroll(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); idx = Math.max(0, idx - 1); scroll(); }
    else if (e.key === 'Enter') { e.preventDefault(); run(idx); }
    else if (e.key === 'Escape') { e.preventDefault(); app.palette = false; }
  }
  function scroll() { tick().then(() => document.querySelector('.pal .item.on')?.scrollIntoView({ block: 'nearest' })); }
</script>

{#if app.palette}
  <div class="veil" role="presentation" onmousedown={e => { if (e.target === e.currentTarget) app.palette = false; }}>
    <div class="pal" role="dialog" aria-label={L("Werkzeug suchen")}>
      <div class="field"><I.Search size={16} strokeWidth={2} /><input bind:this={input} bind:value={q} onkeydown={key} placeholder={L("Was möchtest du tun? z. B. „schwärzen“, „word“, „seiten drehen“")} aria-label={L("Suchbegriff")} /></div>
      <div class="list scroll">
        {#each results as t, i (t.id)}
          {@const dis = (!t.noDoc && !doc) || t.disabled?.()}
          <button class="item" class:on={i === idx} class:dis onmouseenter={() => (idx = i)} onclick={() => run(i)}>
            <span class="ic"><t.icon size={16} strokeWidth={1.7} /></span>
            <span class="txt"><b>{t.label}</b>{#if t.desc}<small>{t.desc}</small>{/if}</span>
            <span class="meta">{tabOf.get(t.id) || ''}{#if t.shortcut}<kbd>{scLabel(t.shortcut)}</kbd>{/if}</span>
          </button>
        {:else}
          <p class="empty">{L("Nichts gefunden.")}</p>
        {/each}
      </div>
    </div>
  </div>
{/if}

<style>
  .veil { position: fixed; inset: 0; z-index: 105; background: rgba(10, 20, 22, 0.22); backdrop-filter: blur(2px); display: flex; justify-content: center; align-items: flex-start; padding-top: 13vh; animation: fade-in 0.12s; }
  .pal { width: 640px; max-width: calc(100vw - 32px); max-height: 64vh; height: max-content; display: flex; flex-direction: column; background: var(--surface); border-radius: 16px; box-shadow: var(--shadow-pop); overflow: hidden; animation: pop-in 0.16s var(--ease); }
  .field { display: flex; align-items: center; gap: 12px; padding: 0 18px; height: 56px; border-bottom: 0.5px solid var(--line); color: var(--text-3); flex: none; }
  .field input { flex: 1; border: 0; background: none; font: 500 17px var(--font-display); letter-spacing: -0.01em; color: var(--text); outline: none; box-shadow: none; }
  .field input::placeholder { color: var(--text-3); }
  .list { padding: 6px; overflow: auto; }
  .item { width: 100%; display: flex; align-items: center; gap: 12px; border: 0; background: none; text-align: left; padding: 8px 10px; border-radius: 10px; color: var(--text); position: relative; }
  .item.on { background: var(--accent-soft); }
  .item.on::before { content: ''; position: absolute; left: 0; top: 9px; bottom: 9px; width: 3px; border-radius: 2px; background: var(--accent); }
  .item.dis { opacity: 0.5; }
  .ic { width: 30px; height: 30px; border-radius: 8px; display: grid; place-items: center; background: var(--surface); box-shadow: var(--shadow-1); color: var(--text-2); flex: none; }
  .item.on .ic { color: var(--accent); }
  .txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .txt b { font-weight: 600; font-size: 13px; }
  .txt small { font-size: 11.75px; color: var(--text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .meta { font-size: 11px; color: var(--text-3); display: flex; gap: 8px; align-items: center; white-space: nowrap; }
  kbd { font: 500 11px var(--font); padding: 1px 6px; border-radius: 5px; background: var(--hover); color: var(--text-2); }
  .empty { padding: 22px; text-align: center; color: var(--text-3); margin: 0; }
</style>
