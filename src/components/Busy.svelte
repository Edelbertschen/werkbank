<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { dialogs } from '../lib/dialogs.svelte';
  const b = $derived(app.busy);
  const pct = $derived(b && b.progress >= 0 ? Math.round(b.progress * 100) : -1);
</script>

<!-- Wartet die Arbeit auf eine Rückfrage (Passwort, Bestätigung), tritt der Schleier zurück -->
{#if b && !dialogs.list.length}
  <div class="veil" role="alertdialog" aria-busy="true" aria-label={b.label}>
    <div class="card">
      <div class="top"><span class="spin"></span><b>{b.label}</b>{#if pct >= 0}<span class="pct num">{pct} %</span>{/if}</div>
      <div class="bar" class:ind={pct < 0}><i style:width={pct >= 0 ? pct + '%' : '35%'}></i></div>
      {#if b.detail}<div class="detail">{b.detail}</div>{/if}
    </div>
  </div>
{/if}

<style>
  .veil { position: fixed; inset: 0; z-index: 110; display: grid; place-items: center; background: rgba(15, 18, 28, 0.12); animation: fade-in 0.2s; cursor: progress; }
  .card { width: 340px; max-width: calc(100vw - 32px); background: var(--surface); border-radius: 12px; box-shadow: var(--shadow-pop); padding: 16px 18px; display: flex; flex-direction: column; gap: 10px; animation: pop-in 0.14s; }
  .top { display: flex; align-items: center; gap: 10px; }
  .top b { flex: 1; font-weight: 600; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pct { color: var(--text-3); font-size: 12px; }
  .spin { width: 14px; height: 14px; border-radius: 50%; border: 2px solid var(--accent); border-right-color: transparent; animation: spin 0.8s linear infinite; flex: none; }
  .bar { height: 4px; border-radius: 2px; background: var(--selected); overflow: hidden; position: relative; }
  .bar i { display: block; height: 100%; background: var(--accent); border-radius: 2px; transition: width 0.2s; }
  .bar.ind i { position: absolute; animation: ind 1.2s ease-in-out infinite; }
  @keyframes ind { 0% { left: -35%; } 100% { left: 100%; } }
  .detail { font-size: 12px; color: var(--text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
