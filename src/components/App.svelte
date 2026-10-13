<script lang="ts">
  import { hideSplash } from '../lib/splash';
  import { L } from '../lib/i18n';
  import { onMount } from 'svelte';
  import { app, active, loadPersisted, toast } from '../lib/app.svelte';
  import { onOpenFiles, onFileDrop, onCloseRequested, closeWindowNow, isTauri } from '../lib/platform';
  import { openPaths, openDropped, insertDropped, confirmQuit, offerRecovery, runTool } from '../lib/actions';
  import { dropTargetAt, type DropTarget } from '../lib/dropzone';
  import { TOOLS, tool } from '../lib/tools';
  import { matches } from '../lib/shortcuts';
  import { viewer } from '../lib/viewer.svelte';
  import { overlay, removeItem, findItem, commitItem } from '../lib/overlay.svelte';
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
  import Welcome from './Welcome.svelte';

  const doc = $derived(active());
  let dropTarget = $state<DropTarget | null>(null);

  onMount(async () => {
    await loadPersisted();
    app.ready = true;
    hideSplash();
    // PDF-Engine gleich still vorbereiten – bis eine Datei gewählt ist, ist sie meist fertig
    if (app.prefs.preloadEngines) import('../lib/engines').then(m => m.preloadWhenIdle());
    await onOpenFiles(paths => openPaths(paths));
    await onFileDrop((state, p) => {
      if (state === 'leave') { app.dropping = false; dropTarget = null; return; }
      // Über den Miniaturen: an der Stelle einfügen; sonst öffnen
      const t = p?.x != null && p.y != null && active() ? dropTargetAt(p.x, p.y) : null;
      if (state === 'drop') { app.dropping = false; dropTarget = null; if (p) t ? insertDropped(p, t.at) : openDropped(p); return; }
      dropTarget = t; app.dropping = !t;
    });
    await onCloseRequested(async () => {
      const ok = await confirmQuit();
      if (ok && isTauri) await closeWindowNow();
      return ok;
    }, () => app.docs.some(d => d.dirty));
    setTimeout(() => offerRecovery(), 600);
    if (import.meta.env.VITE_WB_TEST) import('../lib/testhook');
  });

  let nudgeTimer: ReturnType<typeof setTimeout> | undefined;
  function onKey(e: KeyboardEvent) {
    const t = e.target as HTMLElement;
    const typing = t.closest('input, textarea, select, [contenteditable="true"], .freeTextEditor, .annotationEditorLayer [contenteditable]');
    if (document.querySelector('.dialog-veil, .welcome')) return;
    if (e.key === 'Escape') {
      if (viewer.presenting) { viewer.endPresent(); return; }
      if (app.palette) { app.palette = false; return; }
      // Esc im Text eines Elements beendet die Eingabe (und hält sie als Stand fest)
      if (typing && t.closest('.ov-host')) { (t.closest('[contenteditable], textarea') as HTMLElement | null)?.blur(); return; }
      if (typing) return;
      if (overlay.selected) { overlay.selected = null; return; }
      if (app.mode !== 'select') { app.mode = 'select'; return; }
      if (app.organize) { if (doc?.selection.length) doc.selection = []; else app.organize = false; return; }
      if (app.pane) { app.pane = null; return; }
      return;
    }
    if (viewer.presenting) {
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); viewer.next(); }
      if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) { e.preventDefault(); viewer.prev(); }
      return;
    }
    // Ausgewähltes Overlay-Element löschen
    if (!typing && (e.key === 'Delete' || e.key === 'Backspace') && overlay.selected && doc) {
      e.preventDefault();
      const it = findItem(doc, overlay.selected);
      // Inhalt des PDFs: als gelöscht vormerken (beim Speichern entfernt); eigene Elemente: entfernen
      if (it?.kind === 'move') { it.remove = true; commitItem(doc, it); } else removeItem(doc, overlay.selected);
      return;
    }
    // Ausgewähltes Element mit den Pfeiltasten verschieben (1 pt, mit Umschalt 10 pt)
    if (!typing && app.mode === 'move' && overlay.selected && doc && e.key.startsWith('Arrow') && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const it = findItem(doc, overlay.selected) as any;
      const pg = it && doc.pages[it.page];
      if (it && pg) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = (e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0) / pg.w;
        const dy = (e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0) / pg.h;
        if ('x1' in it) { it.x1 += dx; it.x2 += dx; it.y1 += dy; it.y2 += dy; }
        else if ('rects' in it) it.rects = it.rects.map((q: number[]) => [q[0] + dx, q[1] + dy, q[2], q[3]]);
        else { it.x += dx; it.y += dy; }
        // Mehrere Tastendrücke kurz hintereinander ergeben einen Stand
        const d = doc;
        clearTimeout(nudgeTimer); nudgeTimer = setTimeout(() => commitItem(d, it), 500);
        return;
      }
    }
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
    <!-- Ohne Dokument hat die Bandleiste nichts zu tun: die Startseite bietet die Einstiege -->
    {#if doc}<Ribbon />{:else}<div class="ribbon-gap"></div>{/if}
  {/if}
  <div class="work">
    {#if doc && !viewer.presenting}<Rail />{/if}
    {#if doc && app.sidebar && !viewer.presenting}<Sidebar {doc} />{/if}
    <main class="center">
      <div class="viewer-area" class:hidden={!doc || app.backstage || app.organize}>
        <ViewerHost />
      </div>
      {#if doc && app.organize && !app.backstage}<Organize {doc} />{/if}
      {#if !doc || app.backstage}<StartScreen />{/if}
    </main>
    {#if app.pane && !viewer.presenting}<TaskPane />{/if}
  </div>
  {#if !viewer.presenting}<StatusBar />{/if}
</div>

{#if dropTarget}
  {@const l = dropTarget.line}
  <div class="insert-line" class:v={dropTarget.layout === 'grid'} style:left={l.x + 'px'} style:top={l.y + 'px'} style:width={l.w ? l.w + 'px' : null} style:height={l.h ? l.h + 'px' : null}>
    <span>{L("Hier einfügen")}</span>
  </div>
{/if}
{#if app.dropping}
  <div class="drop-veil"><div class="drop-card">{L("Zum Öffnen loslassen")}<span>{L("PDF, Office, Bilder, E-Books, Mails")}</span></div></div>
{/if}
<Palette />
{#if app.ready && !app.prefs.introSeen}<Welcome />{/if}
<DialogHost />
<Busy />
<Toasts />

<style>
  .app { height: 100%; display: grid; grid-template-rows: auto auto minmax(0, 1fr) auto; background: var(--win); }
  .app.presenting { grid-template-rows: minmax(0, 1fr); background: #000; }
  /* Arbeitsbereich: Seitenleiste, Dokumentfläche und Aufgabenbereich liegen als Blätter auf dem Fensterchrom */
  .ribbon-gap { height: 4px; }
  .work { display: flex; gap: 8px; padding: 0 8px 0 0; min-height: 0; min-width: 0; }
  .center { flex: 1; position: relative; min-width: 0; min-height: 0; background: var(--canvas); border-radius: 12px; overflow: hidden; box-shadow: inset 0 0 0 0.5px var(--line); }
  .work:not(:has(:global(.rail))) { padding-left: 8px; }
  .viewer-area { position: absolute; inset: 0; }
  .viewer-area.hidden { visibility: hidden; pointer-events: none; }
  .presenting .center { background: #000; border-radius: 0; }
  .presenting .work { padding: 0; gap: 0; }
  .drop-veil { position: fixed; inset: 0; z-index: 80; display: grid; place-items: center; background: color-mix(in srgb, var(--win) 60%, transparent); backdrop-filter: blur(6px) saturate(1.2); animation: fade-in 0.14s; pointer-events: none; }
  .drop-card { border: 1.5px dashed var(--accent); border-radius: 18px; padding: 36px 56px; background: var(--surface); font: 600 19px var(--font-display); letter-spacing: -0.015em; display: flex; flex-direction: column; align-items: center; gap: 6px; box-shadow: var(--shadow-pop); animation: pop-in 0.18s var(--ease); }
  .insert-line { position: fixed; z-index: 80; pointer-events: none; height: 3px; margin-top: -1.5px; border-radius: 2px; background: var(--accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 22%, transparent); }
  .insert-line.v { width: 3px; height: auto; margin: 0 0 0 -1.5px; }
  .insert-line span { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); white-space: nowrap; padding: 3px 9px; border-radius: 999px; background: var(--accent); color: #fff; font: 600 11.5px var(--font); box-shadow: var(--shadow-pop); }
  .drop-card span { font: 400 12.5px var(--font); color: var(--text-2); }
</style>
