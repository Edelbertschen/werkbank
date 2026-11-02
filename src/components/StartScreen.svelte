<script lang="ts">
  import { L } from '../lib/i18n';
  import { app, active, saveRecent } from '../lib/app.svelte';
  import { openPaths, openDialog, newBlankDoc } from '../lib/actions';
  import { openTool } from '../lib/ui.svelte';
  import { tool } from '../lib/tools';
  import { revealInFolder, isTauri, fileInfo } from '../lib/platform';
  import { fmtAgo, fmtSize } from '../lib/util';
  import { showMenu } from '../lib/menu.svelte';
  import { label as scLabel } from '../lib/shortcuts';
  import * as I from '../lib/icons';

  const doc = $derived(active());
  let filter = $state('');
  const recent = $derived(app.recent.filter(r => !filter || r.name.toLowerCase().includes(filter.toLowerCase())));
  const fresh = $derived(!app.recent.length);
  // Einstiege ohne geöffnetes Dokument – als schlichte Textzeile, nicht als Kacheln
  const starts: [string, () => void][] = [
    [L("Leeres Dokument"), () => newBlankDoc()],
    [L("Dateien zusammenführen"), () => startTask('merge')],
    [L("Office-Datei in PDF"), () => startTask('create-office')],
    [L("Bilder in PDF"), () => startTask('create-images')],
    [L("Zwei PDFs vergleichen"), () => startTask('compare')],
    [L("Stapelverarbeitung"), () => startTask('batch')],
  ];

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
      { label: L("Öffnen"), icon: I.FolderOpen, run: () => openRecent(path) },
      { label: L("Im Ordner zeigen"), icon: I.FolderOpen, disabled: !isTauri, run: () => revealInFolder(path) },
      { sep: true, label: '' },
      { label: L("Aus der Liste entfernen"), icon: I.X, run: () => { app.recent = app.recent.filter(r => r.path !== path); saveRecent(); } },
    ]);
  }
  const dirOf = (p: string) => p.replace(/[\\/][^\\/]*$/, '').replace(/^\/(Users|home)\/[^/]+/, '~');
  const folderOf = (p: string) => dirOf(p).split(/[\\/]/).pop() || dirOf(p);
</script>

<div class="start scroll" class:hot={app.dropping}>
  <div class="inner" class:fresh>
    {#if doc}
      <button class="btn back" onclick={() => (app.backstage = false)}>{L("Zurück zu „{0}“", doc.title)}<I.ChevronRight size={14} /></button>
    {/if}

    {#if fresh}
      <!-- Erster Start: die Werkbank ist noch leer -->
      <section class="bench" aria-labelledby="bench-title">
        <span class="ruler" aria-hidden="true"></span>
        <div class="bench-body">
          <h1 id="bench-title">{L("Leg eine Datei auf die Werkbank.")}</h1>
          <p>{L("PDF, Word, Excel, PowerPoint, Bilder, E-Books oder E-Mails. Ziehen, ablegen, loslegen – alles bleibt auf diesem Rechner.")}</p>
          <div class="acts">
            <button class="big primary" onclick={() => openDialog()}><I.FolderOpen size={18} strokeWidth={1.9} />{L("Datei öffnen")}</button>
            <button class="big" onclick={() => newBlankDoc()}>{L("Leeres Dokument")}</button>
          </div>
        </div>
        <span class="ruler down" aria-hidden="true"></span>
      </section>
      <div class="foot">
        <nav class="starts" aria-label={L("Neu beginnen")}>
          <span class="cap">{L("Oder")}</span>
          {#each starts.slice(1, 5) as [label, run] (label)}<button onclick={run}>{label}</button>{/each}
        </nav>
        <p class="hint">{L("Jedes Werkzeug findest du mit")} <kbd>{scLabel('Mod+K')}</kbd></p>
      </div>
    {:else}
      <!-- Suchen oder öffnen – die Befehlssuche steht im Mittelpunkt -->
      <section class="ask">
        <h1>{L("Was liegt an?")}</h1>
        <div class="askrow">
          <button class="field" onclick={() => (app.palette = true)}>
            <I.Search size={20} strokeWidth={1.8} />
            <span>{L("Werkzeug suchen – z. B. „schwärzen“, „OCR“, „Word“")}</span>
            <kbd>{scLabel('Mod+K')}</kbd>
          </button>
          <button class="big primary" onclick={() => openDialog()}><I.FolderOpen size={18} strokeWidth={1.9} />{L("Datei öffnen")}</button>
        </div>
        <nav class="starts" aria-label={L("Neu beginnen")}>
          <span class="cap">{L("Neu")}</span>
          {#each starts as [label, run] (label)}<button onclick={run}>{label}</button>{/each}
        </nav>
      </section>

      <section class="recentwrap" aria-labelledby="recent-title">
        <span class="ruler" aria-hidden="true"></span>
        <div class="rhead">
          <h2 id="recent-title">{L("Zuletzt geöffnet")}</h2>
          <span class="count">{app.recent.length === 1 ? L("1 Datei") : L("{0} Dateien", app.recent.length)}</span>
          {#if app.recent.length > 6}<input class="input" type="search" placeholder={L("Filtern")} aria-label={L("Filtern")} bind:value={filter} />{/if}
        </div>
        {#if !recent.length}
          <p class="empty">{L("Kein Dokument passt zum Filter.")}</p>
        {:else}
          <div class="recent">
            {#each recent.slice(0, 18) as r (r.path)}
              <button class="rf" onclick={() => openRecent(r.path)} oncontextmenu={e => ctx(e, r.path)} title={r.path}>
                <span class="tile"><span class="paper">{#if r.thumb}<img src={r.thumb} alt="" />{:else}<span class="lines" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>{/if}</span></span>
                <span class="rn">{r.name}</span>
                <span class="rm num">{folderOf(r.path)} · {fmtAgo(r.at)}{r.pages ? ` · ${r.pages} S.` : ''}{r.size ? ` · ${fmtSize(r.size)}` : ''}</span>
              </button>
            {/each}
          </div>
        {/if}
      </section>

      <p class="drophint"><I.Download size={15} strokeWidth={1.8} />{L("Dateien kannst du überall in diesem Fenster ablegen.")}</p>
    {/if}
  </div>
</div>

<style>
  .start { position: absolute; inset: 0; background: var(--bar); transition: box-shadow 0.15s; }
  .start.hot { box-shadow: inset 0 0 0 3px var(--accent); background: color-mix(in srgb, var(--accent) 4%, var(--bar)); }
  .inner { position: relative; max-width: 1180px; min-height: 100%; margin: 0 auto; padding: 64px 40px 32px; display: flex; flex-direction: column; gap: 52px; }
  .inner.fresh { gap: 26px; padding-top: 48px; }
  .back { position: absolute; top: 18px; right: 40px; }

  h1 { margin: 0; font-family: var(--font-brand); font-weight: 620; letter-spacing: -0.028em; font-stretch: 100%; color: var(--text); }
  h2 { margin: 0; font: 600 21px/1.2 var(--font-brand); letter-spacing: -0.015em; color: var(--text); }
  kbd { font: 500 11.5px var(--mono); color: var(--text-2); border: 0.5px solid var(--line-strong); border-radius: 6px; padding: 2px 7px; background: var(--surface); }

  /* Das Lineal: das wiederkehrende Werkbank-Motiv */
  .ruler { display: block; height: 10px; flex: none;
    background:
      repeating-linear-gradient(90deg, var(--line-strong) 0 1px, transparent 1px 12px) bottom / 100% 5px no-repeat,
      repeating-linear-gradient(90deg, color-mix(in srgb, var(--text) 30%, transparent) 0 1px, transparent 1px 60px) bottom / 100% 10px no-repeat;
    border-bottom: 1px solid var(--line-strong); }
  .ruler.down { background-position: top, top; border-bottom: 0; border-top: 1px solid var(--line-strong); }

  /* Große Schaltflächen */
  .big { height: 54px; padding: 0 24px; border-radius: 12px; border: 0.5px solid var(--line-strong); background: var(--surface); color: var(--text);
    display: inline-flex; align-items: center; justify-content: center; gap: 10px; font: 600 14.5px var(--font); white-space: nowrap; transition: background-color 0.12s, transform 0.12s var(--ease); }
  .big:hover { background: color-mix(in srgb, var(--surface) 92%, var(--text)); }
  .big.primary { border: 0; background: var(--accent); color: var(--on-accent); }
  .big.primary:hover { background: color-mix(in srgb, var(--accent) 88%, var(--text)); }
  .big:active { transform: translateY(1px); }

  /* Suchen oder öffnen */
  .ask { display: flex; flex-direction: column; gap: 18px; }
  .ask h1 { font-size: 40px; line-height: 1.1; }
  .askrow { display: flex; flex-wrap: wrap; gap: 12px; }
  .field { flex: 999 1 420px; min-width: 0; height: 60px; display: flex; align-items: center; gap: 14px; padding: 0 18px; border-radius: 12px; text-align: left;
    background: var(--surface); border: 0.5px solid var(--line-strong); box-shadow: var(--shadow-1); color: var(--text-2); transition: box-shadow 0.15s, border-color 0.15s; }
  .field span { flex: 1; min-width: 0; font-size: 16px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .field:hover { border-color: color-mix(in srgb, var(--accent) 50%, var(--line-strong)); box-shadow: var(--shadow-2); }
  .askrow .big { flex: 1 0 auto; height: 60px; }

  /* Einstiege als Textzeile */
  .starts { display: flex; flex-wrap: wrap; align-items: baseline; column-gap: 22px; row-gap: 2px; }
  .cap { font-size: 11.5px; font-weight: 600; letter-spacing: 0.07em; text-transform: uppercase; color: var(--text-2); }
  .starts button { border: 0; background: none; padding: 6px 0; font-size: 14px; color: var(--text); border-bottom: 1px solid transparent; border-radius: 0; transition: color 0.12s, border-color 0.12s; }
  .starts button:hover { color: var(--accent-text); border-bottom-color: var(--accent); }

  /* Zuletzt geöffnet: Blätter auf der Werkbank */
  .recentwrap { display: flex; flex-direction: column; gap: 20px; }
  .rhead { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; }
  .count { font-size: 13px; color: var(--text-2); flex: 1; }
  .rhead .input { width: 220px; }
  .empty { color: var(--text-2); margin: 0; font-size: 13px; }
  .recent { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 28px 22px; }
  .rf { border: 0; background: none; text-align: left; display: flex; flex-direction: column; gap: 3px; padding: 0; color: var(--text); min-width: 0; }
  .tile { height: 208px; margin-bottom: 8px; border-radius: 10px; overflow: hidden; display: flex; justify-content: center; padding-top: 22px;
    background: color-mix(in srgb, var(--text) 6%, var(--bar)); transition: background-color 0.15s; }
  .paper { width: 64%; flex: none; aspect-ratio: 0.74; height: max-content; background: var(--surface); box-shadow: var(--shadow-page); display: grid; place-items: center; overflow: hidden; color: var(--text-3);
    transition: transform 0.2s var(--ease); }
  .paper img { width: 100%; height: 100%; object-fit: cover; object-position: top; }
  /* Ohne Vorschaubild: angedeutetes Blatt mit Textzeilen */
  .lines { align-self: stretch; justify-self: stretch; display: flex; flex-direction: column; gap: 6px; padding: 16% 13%; }
  .lines i { display: block; height: 3px; border-radius: 1px; background: var(--line-strong); }
  .lines i:first-child { width: 48%; height: 5px; margin-bottom: 8px; background: color-mix(in srgb, var(--text) 28%, transparent); }
  .lines i:nth-child(3n) { width: 86%; } .lines i:nth-child(4n) { width: 72%; } .lines i:last-child { width: 54%; }
  .rf:hover .tile { background: color-mix(in srgb, var(--text) 9%, var(--bar)); }
  .rf:hover .paper { transform: translateY(-4px); }
  .rf:focus-visible { outline: none; }
  .rf:focus-visible .tile { box-shadow: var(--focus); }
  .rn { font-weight: 550; font-size: 13.5px; padding: 0 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rm { font-size: 12px; color: var(--text-2); padding: 0 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .drophint { margin: auto 0 0; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 12.5px; color: var(--text-2); }

  /* Erster Start */
  .bench { flex: 1; min-height: 440px; display: flex; flex-direction: column; border-radius: 16px; overflow: hidden; background: color-mix(in srgb, var(--text) 6%, var(--bar)); }
  .bench .ruler { height: 14px; border: 0; background-size: 100% 6px, 100% 12px; background-position: top, top; }
  .bench .ruler.down { background-position: bottom, bottom; }
  .bench-body { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 22px; padding: 48px clamp(24px, 6vw, 88px); }
  .bench h1 { max-width: 14ch; font-size: clamp(40px, 6vw, 72px); line-height: 1.02; letter-spacing: -0.035em; font-weight: 650; }
  .bench p { margin: 0; max-width: 46ch; font-size: 16.5px; line-height: 1.5; color: var(--text-2); }
  .acts { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 6px; }
  .foot { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 12px 32px; }
  .hint { margin: 0; font-size: 13px; color: var(--text-2); }

  @media (max-width: 760px) {
    .inner { padding: 40px 20px 24px; gap: 40px; }
    .ask h1 { font-size: 32px; }
    .back { position: static; align-self: flex-start; }
  }
</style>
