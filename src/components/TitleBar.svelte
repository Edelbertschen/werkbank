<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { activate, closeDoc } from '../lib/actions';
  import { openTool } from '../lib/ui.svelte';
  import { tool } from '../lib/tools';
  import { os, toggleMaximize } from '../lib/platform';
  import { label as scLabel } from '../lib/shortcuts';
  import * as I from '../lib/icons';

  const quick = $derived(app.prefs.quickAccess.filter(id => { try { tool(id); return true; } catch { return false; } }));
  const mac = os === 'macos';

  function onTabMouse(e: MouseEvent, d: any) {
    if (e.button === 1) { e.preventDefault(); closeDoc(d); }
  }
  function dbl(e: MouseEvent) { if ((e.target as HTMLElement).closest('button')) return; if (mac) toggleMaximize(); }
</script>

<header class="titlebar" class:mac data-tauri-drag-region ondblclick={dbl}>
  <div class="quick" data-tauri-drag-region>
    <button class="brand" title="Start" aria-label="Startseite" onclick={() => (app.backstage = !app.backstage)} class:on={app.backstage}>
      <img src="/icon.png" alt="" />
    </button>
    {#each quick as id (id)}
      {@const t = tool(id)}
      <button class="qa" title={`${t.label}${t.shortcut ? '  ' + scLabel(t.shortcut) : ''}`} aria-label={t.label} disabled={t.disabled?.()} onclick={() => openTool(id)}>
        <t.icon size={15} strokeWidth={1.7} />
      </button>
    {/each}
  </div>
  <div class="tabs" role="tablist" data-tauri-drag-region>
    {#each app.docs as d (d.id)}
      <div class="tab" class:active={d.id === app.activeId && !app.backstage} role="tab" tabindex="0" aria-selected={d.id === app.activeId}
        title={d.path || d.name} onclick={() => activate(d)} onmousedown={e => onTabMouse(e, d)} onkeydown={e => e.key === 'Enter' && activate(d)}>
        {#if d.protection}<I.Lock size={11} strokeWidth={2} />{/if}
        <span class="name">{d.title}</span>
        {#if d.dirty}<span class="dot" title="Ungespeicherte Änderungen"></span>{/if}
        <button class="x" aria-label={`${d.title} schließen`} onclick={e => { e.stopPropagation(); closeDoc(d); }}><I.X size={12} strokeWidth={2} /></button>
      </div>
    {/each}
    <button class="newtab" title="Öffnen" aria-label="Datei öffnen" onclick={() => openTool('open')}><I.Plus size={14} strokeWidth={2} /></button>
  </div>
  <button class="search" onclick={() => (app.palette = true)} title="Befehl oder Werkzeug suchen">
    <I.Search size={13} strokeWidth={2} /><span>Werkzeug suchen</span><kbd>{scLabel('Mod+K')}</kbd>
  </button>
</header>

<style>
  .titlebar { height: 40px; display: flex; align-items: center; gap: 8px; padding: 0 10px; background: var(--win); border-bottom: 0.5px solid var(--line); min-width: 0; }
  .titlebar.mac { padding-left: 80px; height: 38px; }
  .quick { display: flex; align-items: center; gap: 1px; flex: none; }
  .brand { width: 26px; height: 26px; border-radius: 7px; border: 0; padding: 3px; background: none; margin-right: 6px; display: grid; place-items: center; }
  .brand img { width: 20px; height: 20px; }
  .brand:hover, .brand.on { background: var(--hover); }
  .qa { width: 26px; height: 26px; border: 0; background: none; border-radius: 6px; display: grid; place-items: center; color: var(--text-2); }
  .qa:hover:not(:disabled) { background: var(--hover); color: var(--text); }
  .qa:disabled { opacity: 0.35; }
  .tabs { flex: 1; display: flex; align-items: center; gap: 3px; min-width: 0; overflow-x: auto; scrollbar-width: none; height: 100%; padding: 0 4px; }
  .tabs::-webkit-scrollbar { display: none; }
  .tab { display: flex; align-items: center; gap: 6px; height: 27px; padding: 0 6px 0 11px; border-radius: 7px; min-width: 0; max-width: 220px; flex: 0 1 auto; color: var(--text-2); font-weight: 500; position: relative; }
  .tab:hover { background: var(--hover); color: var(--text); }
  .tab.active { background: var(--surface); color: var(--text); box-shadow: var(--shadow-1); }
  .tab .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .tab .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--brand); flex: none; }
  .tab .x { width: 18px; height: 18px; border: 0; background: none; border-radius: 4px; display: grid; place-items: center; color: var(--text-3); flex: none; opacity: 0; }
  .tab:hover .x, .tab.active .x { opacity: 1; }
  .tab .x:hover { background: var(--pressed); color: var(--text); }
  .newtab { width: 24px; height: 24px; border: 0; background: none; border-radius: 6px; color: var(--text-2); display: grid; place-items: center; flex: none; }
  .newtab:hover { background: var(--hover); color: var(--text); }
  .search { flex: none; display: flex; align-items: center; gap: 7px; height: 26px; padding: 0 8px 0 9px; border-radius: 7px; border: 0.5px solid var(--line); background: var(--surface); color: var(--text-3); width: 210px; }
  .search span { flex: 1; text-align: left; font-size: 12px; }
  .search kbd { font: 11px var(--font); color: var(--text-3); }
  .search:hover { border-color: var(--line-strong); color: var(--text-2); }
  @media (max-width: 1050px) { .search { width: auto; } .search span, .search kbd { display: none; } }
</style>
