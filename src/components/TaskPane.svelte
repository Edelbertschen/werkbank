<script lang="ts">
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
    if (ok) done = 'Erledigt';
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
      <button class="x" aria-label="Schließen" title="Schließen (Esc)" onclick={() => (app.pane = null)}><I.X size={14} strokeWidth={2} /></button>
    </header>
    <div class="body scroll">
      {#if t.desc}<p class="desc">{t.desc}</p>{/if}
      {#if !doc && !t.noDoc}
        <p class="note">Öffne zuerst ein Dokument.</p>
      {:else if t.panel}
        {#key app.pane?.nonce}<t.panel />{/key}
      {:else if t.fields?.length}
        {#key paneKey}{#if valuesKey === paneKey}<Fields fields={t.fields} bind:values />{/if}{/key}
      {/if}
    </div>
    {#if !t.panel && t.run && (doc || t.noDoc)}
      <footer>
        {#if done}<span class="done"><I.Check size={13} strokeWidth={2.4} />{done}</span>{/if}
        <span class="grow"></span>
        <button class="btn" onclick={() => (app.pane = null)}>Schließen</button>
        <button class="btn primary" disabled={running} onclick={go}>{running ? 'Läuft …' : t.action || 'Anwenden'}</button>
      </footer>
    {/if}
  </aside>
{/if}

<style>
  .pane { flex: none; display: flex; flex-direction: column; background: var(--panel); border-left: 0.5px solid var(--line); position: relative; min-height: 0; animation: slide 0.14s ease-out; }
  @keyframes slide { from { transform: translateX(12px); opacity: 0; } }
  .grip { position: absolute; left: -3px; top: 0; bottom: 0; width: 6px; cursor: col-resize; z-index: 3; }
  header { display: flex; align-items: center; gap: 9px; padding: 12px 12px 6px 16px; }
  .ic { width: 30px; height: 30px; border-radius: 8px; display: grid; place-items: center; background: var(--accent-softer); color: var(--accent-text); flex: none; }
  h2 { margin: 0; flex: 1; font: 600 14.5px/1.25 var(--font-display); letter-spacing: -0.01em; }
  .x { width: 24px; height: 24px; border: 0; background: none; border-radius: 6px; color: var(--text-3); display: grid; place-items: center; }
  .x:hover { background: var(--hover); color: var(--text); }
  .body { flex: 1; min-height: 0; padding: 4px 16px 20px; }
  .desc { margin: 0 0 14px; color: var(--text-2); font-size: 12.5px; line-height: 1.5; }
  .note { color: var(--text-2); }
  footer { display: flex; align-items: center; gap: 8px; padding: 10px 16px; border-top: 0.5px solid var(--line); background: var(--panel); }
  .grow { flex: 1; }
  .done { display: inline-flex; align-items: center; gap: 4px; color: var(--ok); font-size: 12px; font-weight: 500; }
</style>
