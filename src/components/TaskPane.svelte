<script lang="ts">
  import { L } from '../lib/i18n';
  import { app, active, savePrefs } from '../lib/app.svelte';
  import { tool } from '../lib/tools';
  import { runTool } from '../lib/actions';
  import { defaults } from '../lib/fields';
  import Fields from './Fields.svelte';
  import * as I from '../lib/icons';

  const t = $derived(app.pane ? tool(app.pane.tool) : null);
  const doc = $derived(active());
  let values = $state<Record<string, any>>({});
  let valuesKey = $state('');
  const paneKey = $derived(app.pane ? app.pane.tool + ':' + app.pane.nonce : '');
  let running = $state(false);
  let done = $state('');

  $effect(() => {
    const p = app.pane; if (!p) return;
    const def = defaults(tool(p.tool).fields);
    values = { ...def, ...(p.values || {}) };
    valuesKey = p.tool + ':' + p.nonce;
    done = '';
  });

  async function go() {
    if (!t) return;
    running = true; done = '';
    const ok = await runTool(t, $state.snapshot(values));
    running = false;
    if (ok) done = L("Erledigt");
  }

  let w0 = 0, x0 = 0;
  function resize(e: PointerEvent) {
    x0 = e.clientX; w0 = app.prefs.paneWidth;
    const mv = (ev: PointerEvent) => { app.prefs.paneWidth = Math.max(280, Math.min(560, w0 - (ev.clientX - x0))); };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); savePrefs(); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  }
</script>

{#if t}
  <aside class="pane" style:width={app.prefs.paneWidth + 'px'} aria-label={t.label}>
    <div class="grip" role="separator" aria-orientation="vertical" onpointerdown={resize}></div>
    <header>
      <span class="ic"><t.icon size={18} strokeWidth={1.6} /></span>
      <h2>{t.label}</h2>
      <button class="x" aria-label={L("Schließen")} title={L("Schließen (Esc)")} onclick={() => (app.pane = null)}><I.X size={14} strokeWidth={2} /></button>
    </header>
    <div class="body scroll">
      {#if t.desc}<p class="desc">{t.desc}</p>{/if}
      {#if !doc && !t.noDoc}
        <p class="note">{L("Öffne zuerst ein Dokument.")}</p>
      {:else if t.panel}
        {#key app.pane?.nonce}<t.panel />{/key}
      {:else if t.loadPanel}
        {#key app.pane?.nonce}{#await t.loadPanel() then m}<m.default />{/await}{/key}
      {:else if t.fields?.length}
        {#key paneKey}{#if valuesKey === paneKey}<Fields fields={t.fields} bind:values />{/if}{/key}
      {/if}
    </div>
    {#if !t.panel && !t.loadPanel && t.run && (doc || t.noDoc)}
      <footer>
        {#if done}<span class="done"><I.Check size={13} strokeWidth={2.4} />{done}</span>{/if}
        <span class="grow"></span>
        <button class="btn" onclick={() => (app.pane = null)}>{L("Schließen")}</button>
        <button class="btn primary" disabled={running} onclick={go}>{running ? L("Läuft …") : t.action || L("Anwenden")}</button>
      </footer>
    {/if}
  </aside>
{/if}

<style>
  .pane { flex: none; display: flex; flex-direction: column; background: var(--bar); border-radius: 12px; box-shadow: var(--shadow-1); overflow: hidden; position: relative; min-height: 0; animation: slide-in-right 0.2s var(--ease); }
  .grip { position: absolute; left: -3px; top: 0; bottom: 0; width: 6px; cursor: col-resize; z-index: 3; }
  header { display: flex; align-items: center; gap: 11px; padding: 16px 12px 8px 18px; }
  .ic { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; background: var(--accent-soft); color: var(--accent); flex: none; }
  h2 { margin: 0; flex: 1; font: 600 16px/1.2 var(--font-display); letter-spacing: -0.015em; }
  .x { width: 24px; height: 24px; border: 0; background: none; border-radius: 6px; color: var(--text-3); display: grid; place-items: center; }
  .x:hover { background: var(--hover); color: var(--text); }
  .body { flex: 1; min-height: 0; padding: 4px 18px 22px; }
  .desc { margin: 0 0 18px; color: var(--text-2); font-size: 12.75px; line-height: 1.55; max-width: 46ch; }
  .note { color: var(--text-2); }
  footer { display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-top: 0.5px solid var(--line); background: var(--bar); }
  .grow { flex: 1; }
  .done { display: inline-flex; align-items: center; gap: 4px; color: var(--ok); font-size: 12px; font-weight: 500; }
</style>
