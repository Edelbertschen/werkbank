<script lang="ts">
  import { L } from '../lib/i18n';
  import { app, active, saveRecent, savePrefs } from '../lib/app.svelte';
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
  // Eine Zeile je Aufgabe – was sie bewirkt, nicht wie
  const SHORT: Record<string, string> = {
    'to-word': L("Bearbeitbare Word-Datei mit Absätzen und Tabellen"),
    compress: L("Datei verkleinern, Text bleibt durchsuchbar"),
    ocr: L("Scans durchsuchbar und kopierbar machen"),
    sign: L("Unterschrift zeichnen, tippen oder laden"),
    redact: L("Inhalte dauerhaft unkenntlich machen"),
    organize: L("Seiten ordnen, drehen und löschen"),
    protect: L("Passwort und Berechtigungen festlegen"),
    'to-excel': L("Tabellen als Arbeitsblätter exportieren"),
  };
  const starts: [string, any, () => void][] = [
    [L("Leeres Dokument"), I.FilePlus2, () => newBlankDoc()],
    [L("Dateien zusammenführen"), I.Combine, () => startTask('merge')],
    [L("Office-Datei in PDF"), I.FileText, () => startTask('create-office')],
    [L("Bilder in PDF"), I.Images, () => startTask('create-images')],
    [L("Stapelverarbeitung"), I.Workflow, () => startTask('batch')],
    [L("Zwei PDFs vergleichen"), I.GitCompare, () => startTask('compare')],
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
  const mod = navigator.platform.includes('Mac') ? '⌘' : L("Strg");
  const intro: [any, string, string][] = [
    [I.HardDrive, L("Alles bleibt auf diesem Rechner"), L("Umwandeln, Texterkennung und Komprimieren laufen lokal. Es wird nichts hochgeladen.")],
    [I.MousePointer2, L("Direkt auf der Seite arbeiten"), L("Text, Bilder und Anmerkungen anklicken und ändern. Jede Änderung lässt sich mit {0}+Z zurücknehmen.", mod)],
    [I.Command, L("Jedes Werkzeug mit {0}+K", mod), L("Die Befehlssuche findet alles, auch was in der Bandleiste ausgeblendet ist.")],
  ];
  function closeIntro() { app.prefs.introSeen = true; savePrefs(); }
  const dirOf = (p: string) => p.replace(/[\\/][^\\/]*$/, '').replace(/^\/(Users|home)\/[^/]+/, '~');
</script>

<div class="start scroll">
  <div class="inner">
    <header class="hero">
      <div class="mark">
        <img src="/icon.png" alt="" />
        <h1>Werkbank</h1>
      </div>
      <p>{L("PDFs lesen, bearbeiten, umwandeln und schützen – alles auf diesem Rechner.")}</p>
      {#if doc}<button class="btn back" onclick={() => (app.backstage = false)}>{L("Zurück zu „{0}“", doc.title)}<I.ChevronRight size={14} /></button>{/if}
    </header>

    {#if app.ready && !app.prefs.introSeen}
      <section class="intro" aria-labelledby="intro-h">
        <div class="ih">
          <h2 id="intro-h">{L("Willkommen in der Werkbank")}</h2>
          <button class="btn sm primary" onclick={closeIntro}>{L("Verstanden")}</button>
        </div>
        <ol>
          {#each intro as [Icon, t, d], k (k)}
            <li><span class="ii"><Icon size={17} strokeWidth={1.7} /></span><b>{t}</b><span>{d}</span></li>
          {/each}
        </ol>
      </section>
    {/if}

    <section class="bench">
      <button class="drop" class:hot={app.dropping} onclick={() => openDialog()}>
        <span class="di"><I.FolderOpen size={26} strokeWidth={1.4} /></span>
        <span class="dt">
          <b>{L("Datei hierher ziehen")}</b>
          <small>{L("PDF, Word, Excel, PowerPoint, Bilder, E-Books oder E-Mails")}</small>
        </span>
        <span class="btn primary open">{L("Datei öffnen")}</span>
      </button>
      <nav class="starts" aria-label={L("Neu beginnen")}>
        {#each starts as [label, Icon, run] (label)}
          <button onclick={run}><Icon size={16} strokeWidth={1.7} /><span>{label}</span></button>
        {/each}
      </nav>
    </section>

    <section>
      <div class="rhead">
        <h2>{L("Zuletzt geöffnet")}</h2>
        {#if app.recent.length > 6}<input class="input" type="search" placeholder={L("Filtern")} bind:value={filter} />{/if}
      </div>
      {#if !recent.length}
        {#if app.recent.length}<p class="empty">{L("Kein Dokument passt zum Filter.")}</p>
        {:else}
          <div class="shelf">
            <span class="ghost"></span><span class="ghost"></span><span class="ghost"></span>
            <p>{L("Noch nichts geöffnet. Was du hier öffnest, liegt beim nächsten Mal griffbereit.")}</p>
          </div>
        {/if}
      {:else}
        <div class="recent">
          {#each recent.slice(0, 18) as r (r.path)}
            <button class="rf" onclick={() => openRecent(r.path)} oncontextmenu={e => ctx(e, r.path)} title={r.path}>
              <span class="rt">{#if r.thumb}<img src={r.thumb} alt="" />{:else}<I.FileText size={22} />{/if}</span>
              <span class="rn">{r.name}</span>
              <span class="rm num">{fmtAgo(r.at)}{r.pages ? ` · ${r.pages} S.` : ''}{r.size ? ` · ${fmtSize(r.size)}` : ''}</span>
              <span class="rd">{dirOf(r.path)}</span>
            </button>
          {/each}
        </div>
      {/if}
    </section>

    <section>
      <h2>{L("Häufige Aufgaben")}</h2>
      <div class="tasks">
        {#each tasks as id (id)}
          {@const t = tool(id)}
          <button class="task" onclick={() => startTask(id)}>
            <span class="ti"><t.icon size={17} strokeWidth={1.6} /></span>
            <span class="tl">{t.label}</span>
            <span class="td">{SHORT[id]}</span>
          </button>
        {/each}
      </div>
    </section>
  </div>
</div>

<style>
  .start { position: absolute; inset: 0; background: var(--bar); }
  .inner { max-width: 1040px; margin: 0 auto; padding: 56px 48px 64px; display: flex; flex-direction: column; gap: 44px; }
  .hero { display: grid; grid-template-columns: 1fr auto; align-items: end; row-gap: 8px; }
  .mark { display: flex; align-items: center; gap: 14px; }
  .mark img { width: 46px; height: 46px; filter: drop-shadow(0 2px 4px rgba(14, 28, 30, 0.18)); }
  h1 { margin: 0; font: 650 40px/1 var(--font-display); letter-spacing: -0.035em; font-stretch: 100%; }
  .hero p { grid-column: 1; margin: 0; color: var(--text-2); font-size: 15px; max-width: 60ch; }
  .back { grid-column: 2; grid-row: 1 / span 2; align-self: center; }
  h2 { margin: 0 0 14px; font: 600 15px/1.2 var(--font-display); letter-spacing: -0.01em; color: var(--text); }

  /* Die Werkbank: Ablagefläche zum Hineinziehen und daneben die Einstiege */
  .bench { display: grid; grid-template-columns: minmax(0, 1fr) 260px; gap: 20px; align-items: stretch; }
  .drop { position: relative; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 18px; text-align: left; min-height: 128px; padding: 24px 26px; border-radius: 16px;
    border: 1.5px dashed color-mix(in srgb, var(--accent) 45%, var(--line-strong)); background: color-mix(in srgb, var(--accent) 4%, var(--surface)); color: var(--text);
    transition: border-color 0.15s, background-color 0.15s, transform 0.15s var(--ease); }
  .drop:hover, .drop.hot { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 8%, var(--surface)); }
  .drop.hot { transform: scale(1.01); }
  .di { width: 58px; height: 58px; border-radius: 15px; background: var(--accent-soft); color: var(--accent); display: grid; place-items: center; }
  .dt b { display: block; font: 600 19px/1.2 var(--font-display); letter-spacing: -0.015em; margin-bottom: 6px; }
  .dt small { font-size: 13px; color: var(--text-2); line-height: 1.45; }
  .open { pointer-events: none; height: 34px; padding: 0 16px; font-size: 13px; }
  .starts { display: flex; flex-direction: column; gap: 2px; padding: 8px; border-radius: 16px; background: var(--surface); box-shadow: var(--shadow-1); }
  .starts button { display: flex; align-items: center; gap: 11px; border: 0; background: none; border-radius: 9px; padding: 0 11px; height: 36px; font-weight: 500; color: var(--text); text-align: left; transition: background-color 0.12s; }
  .starts button :global(svg) { color: var(--text-2); flex: none; }
  .starts button:hover { background: var(--hover); }
  .starts button:hover :global(svg) { color: var(--accent); }

  /* Einführung: einmal, knapp, ohne Tour */
  .intro { padding: 20px 22px 22px; border-radius: 16px; background: var(--surface); box-shadow: var(--shadow-1), inset 3px 0 0 var(--accent); animation: intro-in 0.35s var(--ease); }
  @keyframes intro-in { from { opacity: 0; transform: translateY(6px); } }
  .ih { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
  .ih h2 { margin: 0; font-size: 17px; letter-spacing: -0.015em; }
  .intro ol { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 22px; }
  .intro li { display: grid; grid-template-columns: 34px minmax(0, 1fr); column-gap: 12px; row-gap: 3px; align-items: start; }
  .ii { grid-row: span 2; width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; background: var(--accent-soft); color: var(--accent); }
  .intro b { font-size: 13px; font-weight: 600; padding-top: 1px; }
  .intro li > span:last-child { font-size: 12.5px; line-height: 1.5; color: var(--text-2); }
  .shelf { display: flex; align-items: center; gap: 14px; }
  .ghost { width: 54px; aspect-ratio: 0.74; border-radius: 3px; border: 1.5px dashed var(--line-strong); flex: none; }
  .ghost:nth-child(2) { opacity: 0.7; } .ghost:nth-child(3) { opacity: 0.4; }
  .shelf p { margin: 0 0 0 8px; color: var(--text-3); font-size: 13px; max-width: 42ch; line-height: 1.5; }

  .rhead { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
  .rhead .input { width: 220px; }
  .empty { color: var(--text-3); margin: 0; font-size: 13px; }
  .recent { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 22px 18px; }
  .rf { border: 0; background: none; text-align: left; display: flex; flex-direction: column; gap: 2px; padding: 0; color: var(--text); min-width: 0; }
  .rt { aspect-ratio: 0.74; border-radius: 3px; background: var(--surface); box-shadow: var(--shadow-page); display: grid; place-items: center; overflow: hidden; color: var(--text-3); margin-bottom: 10px; transition: transform 0.18s var(--ease), box-shadow 0.18s; }
  .rf:hover .rt { transform: translateY(-3px); box-shadow: var(--shadow-page), 0 14px 26px -10px rgba(14, 28, 30, 0.3); }
  .rt img { width: 100%; height: 100%; object-fit: cover; object-position: top; }
  .rn { font-weight: 550; font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rd, .rm { font-size: 11.25px; color: var(--text-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .tasks { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 2px 24px; }
  .task { display: grid; grid-template-columns: 36px minmax(0, 1fr); grid-template-rows: auto auto; column-gap: 12px; align-items: center; text-align: left; border: 0; background: none; border-radius: 10px; padding: 9px 10px; color: var(--text); transition: background-color 0.12s; }
  .task:hover { background: var(--hover); }
  .ti { grid-row: span 2; width: 36px; height: 36px; border-radius: 10px; background: var(--surface); box-shadow: var(--shadow-1); color: var(--accent); display: grid; place-items: center; }
  .tl { font-weight: 600; font-size: 13px; }
  .td { font-size: 12px; color: var(--text-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  @media (max-width: 900px) { .bench, .intro ol { grid-template-columns: 1fr; } .tasks { grid-template-columns: 1fr; } .inner { padding: 36px 24px; } }
</style>
