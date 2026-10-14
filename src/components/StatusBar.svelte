<script lang="ts">
  import { L } from '../lib/i18n';
  import { app, active, savePrefs } from '../lib/app.svelte';
  import { viewer } from '../lib/viewer.svelte';
  import { engineState, ENGINE_LABEL, type EngineName } from '../lib/engines/state.svelte';
  import { paperName, mm, fmtSize } from '../lib/util';
  import * as I from '../lib/icons';

  const doc = $derived(active());
  const pinfo = $derived(doc ? doc.pages[(doc.current || 1) - 1] : null);
  const loading = $derived((Object.entries(engineState.all) as [EngineName, string][]).filter(([, s]) => s === 'loading').map(([n]) => ENGINE_LABEL[n]));
  let pageInput = $state('');
  let editing = $state(false);

  function commitPage() { editing = false; const n = parseInt(pageInput, 10); if (n) viewer.goto(n); }
  function layout(scroll: 0 | 1 | 2 | 3, spread: 0 | 1 | 2) { app.prefs.scroll = scroll; app.prefs.spread = spread; savePrefs(); viewer.applyLayout(); }
  const zoomPct = $derived(Math.round((viewer.scale || 1) * 100));
</script>

<footer class="status">
  {#if doc}
    <div class="seg-left">
      <button class="nb" aria-label={L("Vorherige Seite")} disabled={doc.current <= 1} onclick={() => viewer.prev()}><I.ChevronLeft size={13} /></button>
      {#if editing}
        <!-- svelte-ignore a11y_autofocus -->
        <input class="pg num" bind:value={pageInput} autofocus onblur={commitPage} onkeydown={e => { if (e.key === 'Enter') commitPage(); if (e.key === 'Escape') editing = false; }} aria-label={L("Seite")} />
      {:else}
        <button class="pgb num" onclick={() => { pageInput = String(doc.current); editing = true; }} title={L("Zu Seite springen")}>{#if doc.labelOf(doc.current)}{L("Seite {0} ({1} von {2})", doc.labelOf(doc.current)!, doc.current, doc.numPages)}{:else}{L("Seite {0} von {1}", doc.current, doc.numPages)}{/if}</button>
      {/if}
      <button class="nb" aria-label={L("Nächste Seite")} disabled={doc.current >= doc.numPages} onclick={() => viewer.next()}><I.ChevronRight size={13} /></button>
      {#if pinfo}<span class="dim num">{paperName(pinfo.w, pinfo.h) || ''} {mm(pinfo.w)} × {mm(pinfo.h)} mm</span>{/if}
      {#if doc.selection.length > 1}<span class="dim">{L("{0} Seiten ausgewählt", doc.selection.length)}</span>{/if}
    </div>
  {/if}
  <div class="mid">
    {#if app.mcpBusy}<span class="eng ai"><span class="spin"></span>{L("KI-Assistent arbeitet …")}</span>
    {:else if loading.length}<span class="eng"><span class="spin"></span>{L("{0} wird geladen …", loading.join(', '))}</span>
    {:else if doc}
      <span class="dim num">{fmtSize(doc.bytes.length)}</span>
      {#if doc.protection}<span class="badge"><I.Lock size={11} />{L("Geschützt beim Speichern")}</span>{/if}
      {#if doc.dirty}<span class="badge warm">{L("Nicht gespeichert")}</span>{:else if doc.path}<span class="dim">{L("Gespeichert")}</span>{/if}
    {/if}
  </div>
  {#if doc}
    <div class="right">
      <div class="views" role="group" aria-label={L("Seitenansicht")}>
        <button title={L("Fortlaufend")} aria-label={L("Fortlaufend")} class:on={app.prefs.scroll === 0 && app.prefs.spread === 0} onclick={() => layout(0, 0)}><I.Rows3 size={13} /></button>
        <button title={L("Einzelseite")} aria-label={L("Einzelseite")} class:on={app.prefs.scroll === 3} onclick={() => layout(3, 0)}><I.FileText size={13} /></button>
        <button title={L("Doppelseite")} aria-label={L("Doppelseite")} class:on={app.prefs.spread > 0 && app.prefs.scroll !== 1} onclick={() => layout(0, 1)}><I.BookOpen size={13} /></button>
        <button title={L("Seiten organisieren")} aria-label={L("Seiten organisieren")} class:on={app.organize} onclick={() => (app.organize = !app.organize)}><I.LayoutGrid size={13} /></button>
      </div>
      <button class="nb" aria-label={L("Verkleinern")} onclick={() => viewer.zoomBy(1 / 1.15)}><I.Minus size={12} /></button>
      <input class="zs" type="range" min="10" max="400" value={zoomPct} oninput={e => viewer.setScale(+(e.target as HTMLInputElement).value / 100)} aria-label="Zoom" />
      <button class="nb" aria-label={L("Vergrößern")} onclick={() => viewer.zoomBy(1.15)}><I.Plus size={12} /></button>
      <span class="zp num">{zoomPct} %</span>
    </div>
  {/if}
</footer>

<style>
  .status { height: 30px; display: flex; align-items: center; gap: 14px; padding: 0 12px; background: var(--win); font-size: 11.75px; color: var(--text-2); min-width: 0; }
  .seg-left, .right, .mid { display: flex; align-items: center; gap: 6px; min-width: 0; }
  .mid { flex: 1; justify-content: center; gap: 10px; }
  .nb { width: 22px; height: 22px; border: 0; background: none; border-radius: 6px; display: grid; place-items: center; color: var(--text-2); }
  .nb:hover:not(:disabled) { background: var(--hover); color: var(--text); }
  .nb:disabled { opacity: 0.32; }
  .pgb { border: 0; background: var(--hover); border-radius: 6px; padding: 2px 9px; color: var(--text); font-size: 11.75px; font-weight: 550; font-variant-numeric: tabular-nums; }
  .pgb:hover { background: var(--pressed); }
  .pg { width: 60px; height: 22px; border: 0; box-shadow: var(--focus); border-radius: 6px; text-align: center; font-size: 11.75px; background: var(--surface); }
  .dim { color: var(--text-3); white-space: nowrap; }
  .badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 10px; background: var(--selected); color: var(--text-2); white-space: nowrap; font-weight: 500; }
  .badge.warm { background: var(--accent-soft); color: var(--accent-text); }
  .eng { display: inline-flex; align-items: center; gap: 6px; color: var(--accent-text); }
  .spin { width: 10px; height: 10px; border-radius: 50%; border: 1.5px solid currentColor; border-right-color: transparent; animation: spin 0.8s linear infinite; }
  .views { display: flex; gap: 2px; margin-right: 8px; padding: 2px; border-radius: 8px; background: var(--hover); }
  .views button { width: 24px; height: 20px; border: 0; background: none; border-radius: 6px; display: grid; place-items: center; color: var(--text-3); }
  .views button:hover { color: var(--text); }
  .views button.on { color: var(--accent); background: var(--surface); box-shadow: var(--shadow-1); }
  .zs { width: 110px; accent-color: var(--accent); }
  .zp { width: 42px; text-align: right; font-variant-numeric: tabular-nums; }
  @media (max-width: 1000px) { .dim, .zs { display: none; } }
</style>
