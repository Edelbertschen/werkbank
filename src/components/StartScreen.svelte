<script lang="ts">
  import { app, active, saveRecent } from '../lib/app.svelte';
  import { openPaths, openDialog, newBlankDoc } from '../lib/actions';
  import { openTool } from '../lib/ui.svelte';
  import { tool } from '../lib/tools';
  import { revealInFolder, isTauri, fileInfo } from '../lib/platform';
  import { fmtAgo, fmtSize } from '../lib/util';
  import { showMenu } from '../lib/menu.svelte';
  import * as I from '../lib/icons';

  const doc = $derived(active());
  let filter = $state('');
  const recent = $derived(app.recent.filter(r => !filter || r.name.toLowerCase().includes(filter.toLowerCase())));
  const tasks = ['to-word', 'compress', 'ocr', 'sign', 'redact', 'organize', 'protect', 'to-excel'];

  async function startTask(id: string) {
    const t = tool(id);
    if (!t.noDoc && !active()) { await openDialog(); if (!active()) return; }
    app.backstage = false;
    openTool(id);
  }
  async function openRecent(path: string) {
    const info = await fileInfo(path);
    if (isTauri && !info.exists) { app.recent = app.recent.filter(r => r.path !== path); saveRecent(); return; }
    await openPaths([path]);
  }
  function ctx(e: MouseEvent, path: string) {
    showMenu(e, [
      { label: 'Öffnen', icon: I.FolderOpen, run: () => openRecent(path) },
      { label: 'Im Ordner zeigen', icon: I.FolderOpen, disabled: !isTauri, run: () => revealInFolder(path) },
      { sep: true, label: '' },
      { label: 'Aus der Liste entfernen', icon: I.X, run: () => { app.recent = app.recent.filter(r => r.path !== path); saveRecent(); } },
    ]);
  }
  const dirOf = (p: string) => p.replace(/[\\/][^\\/]*$/, '').replace(/^\/(Users|home)\/[^/]+/, '~');
</script>

<div class="start scroll">
  <div class="inner">
    <header class="hero">
      <img src="/icon.png" alt="" />
      <div>
        <h1>Werkbank</h1>
        <p>PDFs lesen, bearbeiten, umwandeln und schützen – alles auf diesem Rechner.</p>
      </div>
      {#if doc}<button class="btn" onclick={() => (app.backstage = false)}>Zurück zum Dokument<I.ChevronRight size={14} /></button>{/if}
    </header>

    <section class="actions">
      <button class="primary-tile" onclick={() => openDialog()}>
        <span class="pi"><I.FolderOpen size={22} strokeWidth={1.6} /></span>
        <span><b>Datei öffnen</b><small>PDF, Word, Excel, PowerPoint, Bilder, E-Books, Mails – oder einfach ins Fenster ziehen</small></span>
      </button>
      <div class="mini">
        <button onclick={() => newBlankDoc()}><I.FilePlus2 size={16} />Neues Dokument</button>
        <button onclick={() => startTask('merge')}><I.Combine size={16} />Dateien zusammenführen</button>
        <button onclick={() => startTask('create-office')}><I.FileText size={16} />Office in PDF</button>
        <button onclick={() => startTask('create-images')}><I.Images size={16} />Bilder in PDF</button>
        <button onclick={() => startTask('batch')}><I.Workflow size={16} />Stapelverarbeitung</button>
        <button onclick={() => startTask('compare')}><I.GitCompare size={16} />Vergleichen</button>
      </div>
    </section>

    <section>
      <h2>Häufige Aufgaben</h2>
      <div class="tasks">
        {#each tasks as id (id)}
          {@const t = tool(id)}
          <button class="task" onclick={() => startTask(id)}>
            <span class="ti"><t.icon size={18} strokeWidth={1.6} /></span>
            <span class="tl">{t.label}</span>
            <span class="td">{t.desc}</span>
          </button>
        {/each}
      </div>
    </section>

    <section>
      <div class="rhead">
        <h2>Zuletzt geöffnet</h2>
        {#if app.recent.length > 6}<input class="input sm" type="search" placeholder="Filtern" bind:value={filter} />{/if}
      </div>
      {#if !recent.length}
        <p class="empty">{app.recent.length ? 'Keine Treffer.' : 'Hier erscheinen deine zuletzt geöffneten Dokumente.'}</p>
      {:else}
        <div class="recent">
          {#each recent.slice(0, 18) as r (r.path)}
            <button class="rf" onclick={() => openRecent(r.path)} oncontextmenu={e => ctx(e, r.path)} title={r.path}>
              <span class="rt">{#if r.thumb}<img src={r.thumb} alt="" />{:else}<I.FileText size={22} />{/if}</span>
              <span class="rn">{r.name}</span>
              <span class="rd">{dirOf(r.path)}</span>
              <span class="rm num">{fmtAgo(r.at)}{r.pages ? ` · ${r.pages} S.` : ''}{r.size ? ` · ${fmtSize(r.size)}` : ''}</span>
            </button>
          {/each}
        </div>
      {/if}
    </section>
  </div>
</div>

<style>
  .start { position: absolute; inset: 0; background: var(--win); }
  .inner { max-width: 1080px; margin: 0 auto; padding: 40px 40px 56px; display: flex; flex-direction: column; gap: 34px; }
  .hero { display: flex; align-items: center; gap: 18px; }
  .hero img { width: 64px; height: 64px; }
  .hero div { flex: 1; }
  h1 { margin: 0; font: 700 28px/1.1 var(--font-display); letter-spacing: -0.02em; }
  .hero p { margin: 5px 0 0; color: var(--text-2); font-size: 14px; }
  h2 { margin: 0 0 12px; font-size: 12px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--text-3); }
  .actions { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 16px; }
  .primary-tile { display: flex; align-items: center; gap: 16px; text-align: left; padding: 20px 22px; border-radius: 14px; border: 0; background: var(--accent); color: var(--on-accent); box-shadow: 0 6px 18px color-mix(in srgb, var(--accent) 30%, transparent); }
  .primary-tile:hover { background: color-mix(in srgb, var(--accent) 92%, #000); }
  .primary-tile .pi { width: 46px; height: 46px; border-radius: 12px; background: rgba(255, 255, 255, 0.18); display: grid; place-items: center; flex: none; }
  .primary-tile b { display: block; font-size: 16px; font-weight: 600; margin-bottom: 3px; }
  .primary-tile small { font-size: 12.5px; opacity: 0.88; line-height: 1.4; }
  .mini { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .mini button { display: flex; align-items: center; gap: 9px; border: 0; background: var(--surface); border-radius: 10px; padding: 0 12px; height: 40px; box-shadow: var(--shadow-1); font-weight: 500; color: var(--text); text-align: left; }
  .mini button :global(svg) { color: var(--accent-text); flex: none; }
  .mini button:hover { background: color-mix(in srgb, var(--surface) 94%, var(--text)); }
  .tasks { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
  .task { display: grid; grid-template-columns: 34px minmax(0, 1fr); grid-template-rows: auto auto; column-gap: 10px; row-gap: 3px; align-items: start; text-align: left; border: 0; background: var(--surface); border-radius: 11px; padding: 12px; box-shadow: var(--shadow-1); color: var(--text); }
  .task:hover { box-shadow: var(--shadow-1), 0 4px 14px rgba(0, 0, 0, 0.06); transform: translateY(-1px); }
  .task { transition: transform 0.12s, box-shadow 0.12s; }
  .ti { grid-row: span 2; width: 34px; height: 34px; border-radius: 9px; background: var(--accent-softer); color: var(--accent-text); display: grid; place-items: center; }
  .tl { font-weight: 600; font-size: 13px; }
  .td { font-size: 11.5px; color: var(--text-2); line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .rhead { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .rhead .input { width: 200px; height: 26px; margin-bottom: 10px; }
  .empty { color: var(--text-3); margin: 0; }
  .recent { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 18px 16px; }
  .rf { border: 0; background: none; text-align: left; display: flex; flex-direction: column; gap: 3px; padding: 8px; border-radius: 10px; color: var(--text); min-width: 0; }
  .rf:hover { background: var(--hover); }
  .rt { aspect-ratio: 0.74; border-radius: 4px; background: var(--surface); box-shadow: var(--shadow-page); display: grid; place-items: center; overflow: hidden; color: var(--text-3); margin-bottom: 6px; }
  .rt img { width: 100%; height: 100%; object-fit: cover; object-position: top; }
  .rn { font-weight: 500; font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rd, .rm { font-size: 11px; color: var(--text-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  @media (max-width: 980px) { .actions { grid-template-columns: 1fr; } .tasks { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
