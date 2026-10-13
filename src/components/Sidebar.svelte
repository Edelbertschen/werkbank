<script lang="ts">
  import { L } from '../lib/i18n';
  import { app, savePrefs } from '../lib/app.svelte';
  import type { Doc } from '../lib/doc.svelte';
  import ThumbsPanel from './side/ThumbsPanel.svelte';
  import OutlinePanel from './side/OutlinePanel.svelte';
  import SearchPanel from './side/SearchPanel.svelte';
  import CommentsPanel from './side/CommentsPanel.svelte';
  import AttachmentsPanel from './side/AttachmentsPanel.svelte';
  import LayersPanel from './side/LayersPanel.svelte';
  import HistoryPanel from './panels/HistoryPanel.svelte';
  import * as I from '../lib/icons';

  let { doc }: { doc: Doc } = $props();
  const TITLES: Record<string, string> = { pages: L("Seiten"), outline: L("Lesezeichen"), search: L("Suchen"), comments: L("Kommentare"), attachments: L("Anhänge"), layers: L("Ebenen"), history: L("Verlauf") };

  let dragging = false;
  function startResize(e: PointerEvent) {
    dragging = true; const x0 = e.clientX, w0 = app.prefs.sidebarWidth;
    const mv = (ev: PointerEvent) => { app.prefs.sidebarWidth = Math.max(170, Math.min(460, w0 + ev.clientX - x0)); };
    const up = () => { dragging = false; removeEventListener('pointermove', mv); removeEventListener('pointerup', up); savePrefs(); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  }
</script>

<aside class="sidebar" style:width={app.prefs.sidebarWidth + 'px'}>
  <header>
    <h2>{TITLES[app.sidebar!]}</h2>
    <button class="x" aria-label={L("Seitenleiste schließen")} onclick={() => (app.sidebar = null)}><I.X size={13} strokeWidth={2} /></button>
  </header>
  <div class="content">
    {#key doc.id}
      {#if app.sidebar === 'pages'}<ThumbsPanel {doc} />
      {:else if app.sidebar === 'outline'}<OutlinePanel {doc} />
      {:else if app.sidebar === 'search'}<SearchPanel {doc} />
      {:else if app.sidebar === 'comments'}<CommentsPanel {doc} />
      {:else if app.sidebar === 'attachments'}<AttachmentsPanel {doc} />
      {:else if app.sidebar === 'layers'}<LayersPanel {doc} />
      {:else if app.sidebar === 'history'}<div class="pad scroll"><HistoryPanel /></div>
      {/if}
    {/key}
  </div>
  <div class="grip" role="separator" aria-orientation="vertical" onpointerdown={startResize}></div>
</aside>

<style>
  .sidebar { flex: none; display: flex; flex-direction: column; background: var(--bar); border-radius: 12px; box-shadow: var(--shadow-1); position: relative; min-height: 0; }
  header { display: flex; align-items: center; height: 42px; padding: 0 8px 0 16px; flex: none; }
  h2 { margin: 0; flex: 1; font: 600 13px/1 var(--font-display); letter-spacing: -0.005em; color: var(--text); }
  .x { width: 24px; height: 24px; border: 0; background: none; border-radius: 6px; color: var(--text-3); display: grid; place-items: center; }
  .x:hover { background: var(--hover); color: var(--text); }
  .content { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .pad { padding: 4px 12px 16px; overflow: auto; flex: 1; }
  .grip { position: absolute; top: 0; bottom: 0; right: -3px; width: 6px; cursor: col-resize; z-index: 5; }
</style>
