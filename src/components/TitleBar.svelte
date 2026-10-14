<script lang="ts">
  import { L } from '../lib/i18n';
  import { app } from '../lib/app.svelte';
  import { activate, closeDoc, closeOthers, reopenClosed } from '../lib/actions';
  import { showMenu } from '../lib/menu.svelte';
  import { revealInFolder, isTauri } from '../lib/platform';
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
  function tabMenu(e: MouseEvent, d: any) {
    showMenu(e, [
      { label: L("Schließen"), icon: I.X, run: () => closeDoc(d) },
      { label: L("Andere schließen"), icon: I.X, disabled: app.docs.length < 2, run: () => closeOthers(d) },
      { label: L("Zuletzt geschlossenes wieder öffnen"), icon: I.RotateCcw, disabled: !app.closed.length, run: () => reopenClosed() },
      { sep: true, label: '' },
      { label: L("Im Ordner zeigen"), icon: I.FolderOpen, disabled: !isTauri || !d.path, run: () => revealInFolder(d.path) },
      { label: L("Pfad kopieren"), icon: I.Copy, disabled: !d.path, run: () => navigator.clipboard?.writeText(d.path).catch(() => {}) },
    ]);
  }
  function dbl(e: MouseEvent) { if ((e.target as HTMLElement).closest('button')) return; if (mac) toggleMaximize(); }
</script>

<header class="titlebar" class:mac data-tauri-drag-region ondblclick={dbl}>
  <div class="quick" data-tauri-drag-region>
    <button class="brand" title={L("Start")} aria-label={L("Startseite")} onclick={() => (app.backstage = !app.backstage)} class:on={app.backstage}>
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
        title={d.path || d.name} onclick={() => activate(d)} onmousedown={e => onTabMouse(e, d)} oncontextmenu={e => tabMenu(e, d)} onkeydown={e => e.key === 'Enter' && activate(d)}>
        {#if d.protection}<I.Lock size={11} strokeWidth={2} />{/if}
        <span class="name">{d.title}</span>
        {#if d.dirty}<span class="dot" title={L("Ungespeicherte Änderungen")}></span>{/if}
        <button class="x" aria-label={L("{0} schließen", d.title)} onclick={e => { e.stopPropagation(); closeDoc(d); }}><I.X size={12} strokeWidth={2} /></button>
      </div>
    {/each}
    <button class="newtab" title={L("Öffnen")} aria-label={L("Datei öffnen")} onclick={() => openTool('open')}><I.Plus size={14} strokeWidth={2} /></button>
  </div>
  <button class="search" onclick={() => (app.palette = true)} title={L("Befehl oder Werkzeug suchen")}>
    <I.Search size={13} strokeWidth={2} /><span>{L("Werkzeug suchen")}</span><kbd>{scLabel('Mod+K')}</kbd>
  </button>
  <button class="qa gear" title={L("Einstellungen")} aria-label={L("Einstellungen")} onclick={() => openTool('settings')}><I.Settings size={15} strokeWidth={1.7} /></button>
</header>

<style>
  .titlebar { height: 44px; display: flex; align-items: center; gap: 10px; padding: 0 12px; background: var(--win); min-width: 0; }
  .titlebar.mac { padding-left: 82px; height: 42px; }
  .quick { display: flex; align-items: center; gap: 2px; flex: none; }
  .brand { width: 28px; height: 28px; border-radius: 8px; border: 0; padding: 3px; background: none; margin-right: 6px; display: grid; place-items: center; transition: background-color 0.12s; }
  .brand img { width: 21px; height: 21px; filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.12)); }
  .brand:hover, .brand.on { background: var(--hover); }
  .qa { width: 28px; height: 28px; border: 0; background: none; border-radius: 7px; display: grid; place-items: center; color: var(--text-2); transition: background-color 0.12s, color 0.12s; }
  .qa:hover:not(:disabled) { background: var(--hover); color: var(--text); }
  .qa:disabled { opacity: 0.32; }
  /* Dokument-Reiter: der aktive liegt als Blatt auf dem Chrom */
  .tabs { flex: 1; display: flex; align-items: center; gap: 4px; min-width: 0; overflow-x: auto; scrollbar-width: none; height: 100%; padding: 0 6px; }
  .tabs::-webkit-scrollbar { display: none; }
  .tab { display: flex; align-items: center; gap: 7px; height: 30px; padding: 0 6px 0 12px; border-radius: 8px; min-width: 0; max-width: 240px; flex: 0 1 auto; color: var(--text-2); font-weight: 550; position: relative; transition: background-color 0.12s, color 0.12s; }
  .tab:hover { background: var(--hover); color: var(--text); }
  .tab.active { background: var(--surface); color: var(--text); box-shadow: var(--shadow-2); }
  .tab .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .tab .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); flex: none; box-shadow: 0 0 0 2px var(--accent-soft); }
  .tab .x { width: 20px; height: 20px; border: 0; background: none; border-radius: 5px; display: grid; place-items: center; color: var(--text-3); flex: none; opacity: 0; transition: opacity 0.12s; }
  .tab:hover .x, .tab.active .x { opacity: 1; }
  .tab .x:hover { background: var(--pressed); color: var(--text); }
  .newtab { width: 26px; height: 26px; border: 0; background: none; border-radius: 7px; color: var(--text-2); display: grid; place-items: center; flex: none; }
  .newtab:hover { background: var(--hover); color: var(--text); }
  .search { flex: none; display: flex; align-items: center; gap: 8px; height: 30px; padding: 0 8px 0 10px; border-radius: 9px; border: 0; background: var(--hover); color: var(--text-3); width: 240px; transition: background-color 0.12s, box-shadow 0.12s; }
  .search span { flex: 1; text-align: left; font-size: 12.5px; }
  .search kbd { font: 500 11px var(--font); color: var(--text-3); padding: 1px 6px; border-radius: 5px; background: var(--surface); box-shadow: var(--shadow-1); }
  .search:hover { background: var(--surface); box-shadow: var(--shadow-1); color: var(--text-2); }
  @media (max-width: 1050px) { .search { width: auto; } .search span, .search kbd { display: none; } }
</style>
