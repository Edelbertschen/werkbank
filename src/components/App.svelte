<script lang="ts">
  import { L } from '../lib/i18n';
  import { onMount } from 'svelte';
  import { app, active, loadPersisted, toast } from '../lib/app.svelte';
  import { onOpenFiles, onFileDrop, onCloseRequested, closeWindowNow, isTauri } from '../lib/platform';
  import { openPaths, openDropped, confirmQuit, offerRecovery, runTool } from '../lib/actions';
  import { TOOLS, tool } from '../lib/tools';
  import { matches } from '../lib/shortcuts';
  import { viewer } from '../lib/viewer.svelte';
  import { overlay, removeItem } from '../lib/overlay.svelte';
  import { openTool } from '../lib/ui.svelte';
  import TitleBar from './TitleBar.svelte';
  import Ribbon from './Ribbon.svelte';
  import Rail from './Rail.svelte';
  import Sidebar from './Sidebar.svelte';
  import ViewerHost from './ViewerHost.svelte';
  import Organize from './Organize.svelte';
  import TaskPane from './TaskPane.svelte';
  import StatusBar from './StatusBar.svelte';
  import StartScreen from './StartScreen.svelte';
  import DialogHost from './DialogHost.svelte';
  import Toasts from './Toasts.svelte';
  import Busy from './Busy.svelte';
  import Palette from './Palette.svelte';
  import ContextBar from './ContextBar.svelte';

  const doc = $derived(active());

  onMount(async () => {
    await loadPersisted();
    app.ready = true;
    await onOpenFiles(paths => openPaths(paths));
    await onFileDrop((state, payload) => {
      if (state === 'enter') app.dropping = true;
      else if (state === 'leave') app.dropping = false;
      else { app.dropping = false; if (payload) openDropped(payload); }
    });
    await onCloseRequested(async () => {
      const ok = await confirmQuit();
      if (ok && isTauri) await closeWindowNow();
      return ok;
    }, () => app.docs.some(d => d.dirty));
    setTimeout(() => offerRecovery(), 600);
    if (import.meta.env.VITE_WB_TEST) import('../lib/testhook');
  });

  function onKey(e: KeyboardEvent) {
    const t = e.target as HTMLElement;
    const typing = t.closest('input, textarea, select, [contenteditable="true"], .freeTextEditor, .annotationEditorLayer [contenteditable]');
    if (document.querySelector('.dialog-veil')) return;
    if (e.key === 'Escape') {
      if (viewer.presenting) { viewer.endPresent(); return; }
      if (app.palette) { app.palette = false; return; }
      if (typing) return;
      if (overlay.selected) { overlay.selected = null; return; }
      if (app.mode !== 'select') { app.mode = 'select'; return; }
      if (app.organize) { app.organize = false; return; }
      if (app.pane) { app.pane = null; return; }
      return;
    }
    if (viewer.presenting) {
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); viewer.next(); }
      if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) { e.preventDefault(); viewer.prev(); }
      return;
    }
    // Ausgewähltes Overlay-Element löschen
    if (!typing && (e.key === 'Delete' || e.key === 'Backspace') && overlay.selected && doc) { e.preventDefault(); removeItem(doc, overlay.selected); return; }
    // Kürzel aus dem Werkzeugverzeichnis
    for (const t2 of TOOLS) {
      if (!t2.shortcut || !matches(e, t2.shortcut)) continue;
      const plain = !/Mod|Ctrl|Alt/.test(t2.shortcut);
      if (typing && (plain || ['undo', 'redo'].includes(t2.id))) return;
      // pdf.js-Editoren verwalten Rückgängig selbst, solange Eingaben offen sind
      if (['undo', 'redo'].includes(t2.id) && viewer.editorType > 0 && doc?.pendingEdits) return;
      e.preventDefault();
      if (t2.disabled?.()) return;
      openTool(t2.id);
      return;
    }
    if (!typing && doc && !e.metaKey && !e.ctrlKey && !e.altKey) {
      if (e.key === 'PageDown' || (e.key === 'ArrowRight' && app.prefs.scroll === 3)) { e.preventDefault(); viewer.next(); }
      else if (e.key === 'PageUp' || (e.key === 'ArrowLeft' && app.prefs.scroll === 3)) { e.preventDefault(); viewer.prev(); }
      else if (e.key === 'Home' && !app.organize) { e.preventDefault(); viewer.goto(1); }
      else if (e.key === 'End' && !app.organize) { e.preventDefault(); viewer.goto(doc.numPages); }
    }
  }

  // Unbekannte Werkzeug-IDs früh auffallen lassen
  if (import.meta.env.DEV) { try { tool('open'); } catch (e) { console.error(e); } }
  void runTool; void toast;
</script>

<svelte:window onkeydown={onKey} />

<div class="app" class:presenting={viewer.presenting} class:night={app.prefs.nightReading}>
  {#if !viewer.presenting}
    <TitleBar />
    <Ribbon />
  {/if}
  <div class="work">
    {#if doc && !viewer.presenting}<Rail />{/if}
    {#if doc && app.sidebar && !viewer.presenting}<Sidebar {doc} />{/if}
    <main class="center">
      <div class="viewer-area" class:hidden={!doc || app.backstage || app.organize}>
        <ViewerHost />
        {#if doc && !viewer.presenting}<ContextBar {doc} />{/if}
      </div>
      {#if doc && app.organize && !app.backstage}<Organize {doc} />{/if}
      {#if !doc || app.backstage}<StartScreen />{/if}
    </main>
    {#if app.pane && !viewer.presenting}<TaskPane />{/if}
  </div>
  {#if !viewer.presenting}<StatusBar />{/if}
</div>

{#if app.dropping}
  <div class="drop-veil"><div class="drop-card">{L("Zum Öffnen loslassen")}<span>{L("PDF, Office, Bilder, E-Books, Mails")}</span></div></div>
{/if}
<Palette />
<DialogHost />
<Busy />
<Toasts />

<style>
  .app { height: 100%; display: grid; grid-template-rows: auto auto minmax(0, 1fr) auto; background: var(--win); }
  .app.presenting { grid-template-rows: minmax(0, 1fr); background: #000; }
  .work { display: flex; min-height: 0; min-width: 0; }
  .center { flex: 1; position: relative; min-width: 0; min-height: 0; background: var(--canvas); }
  .viewer-area { position: absolute; inset: 0; }
  .viewer-area.hidden { visibility: hidden; pointer-events: none; }
  .presenting .center { background: #000; }
  .drop-veil { position: fixed; inset: 0; z-index: 80; display: grid; place-items: center; background: color-mix(in srgb, var(--win) 55%, transparent); backdrop-filter: blur(3px); animation: fade-in 0.12s; pointer-events: none; }
  .drop-card { border: 2px dashed var(--accent); border-radius: 16px; padding: 34px 48px; background: var(--surface); font: 600 17px var(--font-display); display: flex; flex-direction: column; align-items: center; gap: 6px; box-shadow: var(--shadow-pop); }
  .drop-card span { font: 400 12.5px var(--font); color: var(--text-2); }
</style>
