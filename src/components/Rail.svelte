<script lang="ts">
  import { L } from '../lib/i18n';
  import { app, type SidebarPanel } from '../lib/app.svelte';
  import * as I from '../lib/icons';

  const items: { id: SidebarPanel; label: string; icon: any }[] = [
    { id: 'pages', label: L("Seiten"), icon: I.Files },
    { id: 'outline', label: L("Lesezeichen"), icon: I.Bookmark },
    { id: 'search', label: L("Suchen"), icon: I.Search },
    { id: 'comments', label: L("Kommentare"), icon: I.MessagesSquare },
    { id: 'attachments', label: L("Anhänge"), icon: I.Paperclip },
    { id: 'layers', label: L("Ebenen"), icon: I.Layers },
    { id: 'history', label: L("Verlauf"), icon: I.History },
  ];
</script>

<nav class="rail" aria-label={L("Seitenleiste")}>
  {#each items as it (it.id)}
    <button class:on={app.sidebar === it.id} title={it.label} aria-label={it.label} aria-pressed={app.sidebar === it.id} onclick={() => (app.sidebar = app.sidebar === it.id ? null : it.id)}>
      <it.icon size={17} strokeWidth={1.6} />
    </button>
  {/each}
</nav>

<style>
  .rail { width: 42px; flex: none; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 8px 0; background: var(--panel); border-right: 0.5px solid var(--line); }
  button { width: 30px; height: 30px; border: 0; background: none; border-radius: 7px; display: grid; place-items: center; color: var(--text-2); }
  button:hover { background: var(--hover); color: var(--text); }
  button.on { background: var(--accent-soft); color: var(--accent-text); }
</style>
