<script lang="ts">
  import { active, app } from '../../lib/app.svelte';
  import { fmtSize } from '../../lib/util';
  import * as I from '../../lib/icons';

  const doc = $derived(active());
  const list = $derived(doc ? (doc.rev, doc.versions()) : []);
  const time = (t: number) => new Date(t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  async function go(i: number) { if (!doc) return; await doc.goto(i); app.viewerRev++; }
</script>

{#if doc}
  <p class="hint">Klick auf einen Eintrag springt zu diesem Stand. Spätere Schritte bleiben erhalten, bis du etwas Neues änderst.</p>
  <ol class="hist">
    {#each list as v (v.i)}
      <li>
        <button class:cur={v.i === doc.pos} class:future={v.i > doc.pos} onclick={() => go(v.i)}>
          <span class="dot">{#if v.i === doc.savedPos}<I.Save size={10} />{/if}</span>
          <span class="l">{v.label}</span>
          <span class="m num">{time(v.at)} · {fmtSize(v.size)}</span>
        </button>
      </li>
    {/each}
  </ol>
{/if}

<style>
  .hint { margin: 0 0 10px; font-size: 12px; color: var(--text-3); line-height: 1.45; }
  .hist { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 1px; position: relative; }
  button { width: 100%; display: grid; grid-template-columns: 16px minmax(0, 1fr); grid-template-rows: auto auto; column-gap: 8px; border: 0; background: none; text-align: left; padding: 6px 8px; border-radius: 7px; color: var(--text); }
  button:hover { background: var(--hover); }
  button.cur { background: var(--accent-soft); }
  button.future { opacity: 0.5; }
  .dot { grid-row: span 2; width: 12px; height: 12px; border-radius: 50%; margin-top: 2px; border: 1.5px solid var(--text-3); display: grid; place-items: center; color: var(--text-2); }
  button.cur .dot { border-color: var(--accent); background: var(--accent); color: #fff; }
  .l { font-size: 12.5px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .m { font-size: 11px; color: var(--text-3); }
</style>
