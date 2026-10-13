<script lang="ts">
  import { app, active } from '../lib/app.svelte';
  import { TOOLS } from '../lib/tools';
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

  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const results = $derived.by(() => {
    const words = norm(q).split(/\s+/).filter(Boolean);
    const list = TOOLS.filter(t => !['palette'].includes(t.id)).map(t => {
      const hay = norm(`${t.label} ${t.short || ''} ${t.keys || ''} ${t.desc || ''} ${tabOf.get(t.id) || ''}`);
      const label = norm(t.label);
      let score = 0;
      for (const w of words) { if (!hay.includes(w)) return null; score += label.startsWith(w) ? 5 : label.includes(w) ? 3 : 1; }
      return { t, score: score + (t.noDoc || doc ? 0.5 : 0) };
    }).filter(Boolean) as { t: (typeof TOOLS)[0]; score: number }[];
    return list.sort((a, b) => b.score - a.score).slice(0, 40).map(x => x.t);
  });

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
    <div class="pal" role="dialog" aria-label="Werkzeug suchen">
      <div class="field"><I.Search size={16} strokeWidth={2} /><input bind:this={input} bind:value={q} onkeydown={key} placeholder="Was möchtest du tun? z. B. „schwärzen“, „word“, „seiten drehen“" aria-label="Suchbegriff" /></div>
      <div class="list scroll">
        {#each results as t, i (t.id)}
          {@const dis = (!t.noDoc && !doc) || t.disabled?.()}
          <button class="item" class:on={i === idx} class:dis onmouseenter={() => (idx = i)} onclick={() => run(i)}>
            <span class="ic"><t.icon size={16} strokeWidth={1.7} /></span>
            <span class="txt"><b>{t.label}</b>{#if t.desc}<small>{t.desc}</small>{/if}</span>
            <span class="meta">{tabOf.get(t.id) || ''}{#if t.shortcut}<kbd>{scLabel(t.shortcut)}</kbd>{/if}</span>
          </button>
        {:else}
          <p class="empty">Nichts gefunden.</p>
        {/each}
      </div>
    </div>
  </div>
{/if}

<style>
  .veil { position: fixed; inset: 0; z-index: 105; background: rgba(15, 18, 28, 0.2); display: flex; justify-content: center; padding-top: 12vh; animation: fade-in 0.1s; }
  .pal { width: 620px; max-width: calc(100vw - 32px); max-height: 62vh; display: flex; flex-direction: column; background: var(--surface); border-radius: 14px; box-shadow: var(--shadow-pop); overflow: hidden; animation: pop-in 0.12s; }
  .field { display: flex; align-items: center; gap: 10px; padding: 0 16px; height: 50px; border-bottom: 0.5px solid var(--line); color: var(--text-3); }
  .field input { flex: 1; border: 0; background: none; font-size: 15px; color: var(--text); outline: none; }
  .list { padding: 6px; overflow: auto; }
  .item { width: 100%; display: flex; align-items: center; gap: 11px; border: 0; background: none; text-align: left; padding: 7px 10px; border-radius: 8px; color: var(--text); }
  .item.on { background: var(--accent); color: var(--on-accent); }
  .item.dis { opacity: 0.5; }
  .ic { width: 28px; height: 28px; border-radius: 7px; display: grid; place-items: center; background: var(--selected); flex: none; }
  .item.on .ic { background: rgba(255, 255, 255, 0.2); }
  .txt { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .txt b { font-weight: 500; font-size: 13px; }
  .txt small { font-size: 11.5px; opacity: 0.7; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .meta { font-size: 11px; opacity: 0.6; display: flex; gap: 8px; align-items: center; white-space: nowrap; }
  kbd { font: 11px var(--font); }
  .empty { padding: 18px; text-align: center; color: var(--text-3); margin: 0; }
</style>
