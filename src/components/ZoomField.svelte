<script lang="ts">
  import { viewer } from '../lib/viewer.svelte';
  import { active } from '../lib/app.svelte';
  import * as I from '../lib/icons';

  const doc = $derived(active());
  let editing = $state(false);
  let val = $state('');
  const pct = $derived(Math.round((viewer.scale || 1) * 100));
  const presets = [50, 75, 100, 125, 150, 200, 300, 400];
  let open = $state(false);

  function commit() {
    editing = false;
    const n = parseFloat(val.replace(',', '.'));
    if (n > 5 && n < 1000) viewer.setScale(n / 100);
  }
</script>

<div class="zoom" class:dis={!doc}>
  <button class="b" aria-label="Verkleinern" title="Verkleinern" disabled={!doc} onclick={() => viewer.zoomBy(1 / 1.2)}><I.ZoomOut size={15} strokeWidth={1.75} /></button>
  <div class="field">
    {#if editing}
      <!-- svelte-ignore a11y_autofocus -->
      <input class="num" bind:value={val} autofocus onblur={commit} onkeydown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') editing = false; }} aria-label="Zoomstufe in Prozent" />
    {:else}
      <button class="pct num" disabled={!doc} onclick={() => { val = String(pct); editing = true; }} title="Zoomstufe eingeben">{doc ? pct : '–'} %</button>
    {/if}
    <button class="dd" disabled={!doc} aria-label="Zoomstufen" onclick={() => (open = !open)}><I.ChevronDown size={11} strokeWidth={2} /></button>
    {#if open}
      <div class="menu" role="menu">
        {#each presets as p (p)}<button role="menuitem" onclick={() => { viewer.setScale(p / 100); open = false; }}>{p} %</button>{/each}
        <hr />
        <button role="menuitem" onclick={() => { viewer.setZoom('page-width'); open = false; }}>Seitenbreite</button>
        <button role="menuitem" onclick={() => { viewer.setZoom('page-fit'); open = false; }}>Ganze Seite</button>
      </div>
    {/if}
  </div>
  <button class="b" aria-label="Vergrößern" title="Vergrößern" disabled={!doc} onclick={() => viewer.zoomBy(1.2)}><I.ZoomIn size={15} strokeWidth={1.75} /></button>
</div>
<svelte:window onmousedown={e => { if (open && !(e.target as HTMLElement).closest('.zoom')) open = false; }} />

<style>
  .zoom { display: flex; align-items: center; gap: 2px; height: 24px; margin: 2px 6px 0 0; }
  .b { width: 24px; height: 24px; border: 0; background: none; border-radius: 6px; display: grid; place-items: center; color: var(--text-2); }
  .b:hover:not(:disabled) { background: var(--hover); color: var(--text); }
  .b:disabled, .pct:disabled, .dd:disabled { opacity: 0.4; }
  .field { position: relative; display: flex; align-items: center; height: 22px; border: 0.5px solid var(--line-strong); border-radius: 5px; background: var(--surface); }
  .pct, input { width: 52px; height: 20px; border: 0; background: none; text-align: center; font-size: 12px; padding: 0; }
  input { outline: none; }
  .dd { width: 16px; height: 20px; border: 0; border-left: 0.5px solid var(--line); background: none; display: grid; place-items: center; color: var(--text-3); }
  .menu { position: absolute; top: 25px; left: 0; z-index: 50; background: var(--surface); border-radius: 8px; box-shadow: var(--shadow-pop); padding: 4px; min-width: 130px; display: flex; flex-direction: column; animation: pop-in 0.1s; }
  .menu button { border: 0; background: none; text-align: left; padding: 5px 10px; border-radius: 5px; font-size: 12.5px; }
  .menu button:hover { background: var(--accent); color: var(--on-accent); }
  .menu hr { border: 0; border-top: 0.5px solid var(--line); margin: 4px 2px; }
</style>
