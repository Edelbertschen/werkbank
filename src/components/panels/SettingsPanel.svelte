<script lang="ts">
  import { L, getLocale } from '../../lib/i18n';
  import { app, savePrefs, saveRecent, applyTheme, toast } from '../../lib/app.svelte';
  import { OCR_LANGS } from '../../lib/tools/optimize';
  import { TOOLS } from '../../lib/tools';
  import { RIBBON, ESSENTIAL_HIDDEN } from '../../lib/ribbon';
  import { warmPy, warmLibreOffice, resetEngines } from '../../lib/engines';
  import { openExternal, os, officeInfo, isTauri, stateSaveNow, mcpInfo } from '../../lib/platform';
  import * as I from '../../lib/icons';

  const p = app.prefs;
  const startLang = p.lang;
  let langChanged = $state(false);
  function setLang(l: 'system' | 'de' | 'en') { set('lang', l); langChanged = l !== startLang; }
  async function restart() { await stateSaveNow('prefs', $state.snapshot(app.prefs)); location.reload(); }
  const qaCandidates = ['open', 'save', 'save-as', 'print', 'undo', 'redo', 'close', 'find', 'organize', 'compress', 'ocr', 'merge', 'sign-digital', 'protect', 'present'];
  const qaTools = $derived(qaCandidates.map(id => TOOLS.find(t => t.id === id)).filter(Boolean) as typeof TOOLS);

  function set<K extends keyof typeof p>(k: K, v: (typeof p)[K]) { p[k] = v; savePrefs(); if (k === 'theme') applyTheme(); }
  function toggleLang(code: string) {
    const has = p.ocrLangs.includes(code);
    if (has && p.ocrLangs.length === 1) return;
    set('ocrLangs', has ? p.ocrLangs.filter(c => c !== code) : [...p.ocrLangs, code]);
  }
  function toggleQa(id: string) {
    set('quickAccess', p.quickAccess.includes(id) ? p.quickAccess.filter(x => x !== id) : [...p.quickAccess, id]);
  }
  function clearRecent() { app.recent = []; saveRecent(); toast(L("Liste der zuletzt geöffneten Dateien geleert")); }
  function showIntro() { set('introSeen', false); app.pane = null; }
  const mac = navigator.platform.includes('Mac');

  // KI-Assistenten (MCP)
  let exe = $state('');
  mcpInfo().then(i => (exe = i?.exe || ''));
  const mcpConfig = $derived(JSON.stringify({ mcpServers: { werkbank: { command: exe || (mac ? '/Applications/Werkbank.app/Contents/MacOS/Werkbank' : 'werkbank'), args: ['mcp'] } } }, null, 2));
  let copied = $state(false);
  async function setMcp(on: boolean) {
    set('mcp', on);
    const { applyMcpPref } = await import('../../lib/mcp');
    try { await applyMcpPref(); } catch (e: any) { toast(L("KI-Steuerung ließ sich nicht umschalten: {0}", e.message || e), { kind: 'error' }); }
  }
  async function copyConfig() {
    try { await navigator.clipboard.writeText(mcpConfig); copied = true; setTimeout(() => (copied = false), 1600); } catch { /* Auswahl bleibt möglich */ }
  }
  function clearSignatures() { set('signatures', []); toast(L("Gespeicherte Unterschriften entfernt")); }

  let office = $state<{ available: boolean; path?: string } | null>(null);
  officeInfo().then(o => (office = o));
  let warming = $state('');
  async function preload() {
    warming = L("PDF-Engine");
    try { await warmPy(); if (!office?.available) { warming = L("Office-Engine"); await warmLibreOffice(); } toast(L("Engines sind geladen – Umwandlungen starten jetzt sofort"), { kind: 'ok' }); }
    catch (e: any) { toast(L("Vorladen fehlgeschlagen: ") + e.message, { kind: 'error' }); }
    warming = '';
  }
  function restartEngines() { resetEngines(); toast(L("Engines neu gestartet")); }

  const components: [string, string, string][] = [
    ['BentoPDF', 'AGPL-3.0', 'https://github.com/alam00000/bentopdf'],
    ['PDF.js', 'Apache-2.0', 'https://github.com/mozilla/pdf.js'],
    ['pdf-lib', 'MIT', 'https://github.com/Hopding/pdf-lib'],
    ['PyMuPDF / MuPDF', 'AGPL-3.0', 'https://github.com/pymupdf/PyMuPDF'],
    ['Pyodide', 'MPL-2.0', 'https://github.com/pyodide/pyodide'],
    ['Ghostscript', 'AGPL-3.0', 'https://www.ghostscript.com'],
    ['LibreOffice', 'MPL-2.0', 'https://www.libreoffice.org'],
    ['Tesseract', 'Apache-2.0', 'https://github.com/tesseract-ocr/tesseract'],
    ['qpdf', 'Apache-2.0', 'https://github.com/qpdf/qpdf'],
    ['zgapdfsigner', 'Apache-2.0', 'https://github.com/zboris12/zgapdfsigner'],
    ['Tauri', 'MIT / Apache-2.0', 'https://tauri.app'],
    ['Svelte', 'MIT', 'https://svelte.dev'],
    ['Lucide', 'ISC', 'https://lucide.dev'],
  ];
</script>

<div class="p">
  <section>
    <h3>{L("Allgemein")}</h3>
    <div class="group">
      <label class="row stack"><span class="lbl">{L("Dein Name")}</span><input class="input" placeholder={L("für Kommentare, Stempel, Signaturen")} value={p.author} oninput={e => set('author', e.currentTarget.value)} /></label>
      <div class="row stack"><span class="lbl">{L("Sprache")}{getLocale() === 'de' ? ' · Language' : ''}</span>
        <div class="seg">
          <button aria-pressed={p.lang === 'system'} onclick={() => setLang('system')}>{L("Wie System")}</button>
          <button aria-pressed={p.lang === 'de'} onclick={() => setLang('de')}>Deutsch</button>
          <button aria-pressed={p.lang === 'en'} onclick={() => setLang('en')}>English</button>
        </div>
        {#if langChanged}
          <p class="note">{L("Die neue Sprache gilt nach einem Neustart der Werkbank.")}
            {#if !app.docs.some(d => d.dirty)}<button class="link" onclick={restart}>{L("Jetzt neu starten")}</button>{/if}</p>
        {/if}
      </div>
      <div class="row stack"><span class="lbl">{L("Erscheinungsbild")}</span>
        <div class="themes">
          {#each [['system', 'System'], ['light', L("Hell")], ['dark', L("Dunkel")]] as [v, n] (v)}
            <button class="th" aria-pressed={p.theme === v} onclick={() => set('theme', v as any)}><span class="sw {v}"></span>{n}</button>
          {/each}
        </div>
      </div>
      <label class="row"><span>{L("Formularfelder hervorheben")}</span><input class="switch" type="checkbox" checked={p.showFieldHighlight} onchange={e => set('showFieldHighlight', e.currentTarget.checked)} /></label>
      <label class="row"><span>{L("Nachtmodus beim Lesen")}</span><input class="switch" type="checkbox" checked={p.nightReading} onchange={e => set('nightReading', e.currentTarget.checked)} /></label>
      <div class="row"><span>{L("Einführung")}</span><button class="btn sm" onclick={showIntro}>{L("Einführung erneut zeigen")}</button></div>
    </div>
  </section>

  <section>
    <h3>{L("Texterkennung")}</h3>
    <div class="group pad">
      <div class="chips">
        {#each OCR_LANGS as [code, name] (code)}
          <button class="chip" class:on={p.ocrLangs.includes(code)} aria-pressed={p.ocrLangs.includes(code)} onclick={() => toggleLang(code)}>{#if p.ocrLangs.includes(code)}<I.Check size={12} strokeWidth={2.5} />{/if}{name}</button>
        {/each}
      </div>
    </div>
    <p class="hint">{L("Standardsprachen für neue Texterkennungen. Die Sprachdaten sind in der App enthalten, es wird nichts heruntergeladen.")}</p>
  </section>

  <section>
    <h3>{L("Bandleiste")}</h3>
    <div class="group pad">
      <div class="chips">
        {#each RIBBON as t (t.id)}
          {@const shown = t.id === 'start' || !p.hiddenTabs.includes(t.id)}
          <button class="chip" class:on={shown} aria-pressed={shown} disabled={t.id === 'start'} onclick={() => set('hiddenTabs', shown ? [...p.hiddenTabs, t.id] : p.hiddenTabs.filter(x => x !== t.id))}>{#if shown}<I.Check size={12} strokeWidth={2.5} />{/if}{t.label}</button>
        {/each}
      </div>
      <div class="btns">
        <button class="btn sm" onclick={() => set('hiddenTabs', [...ESSENTIAL_HIDDEN])}>{L("Nur das Wichtigste")}</button>
        <button class="btn sm ghost" disabled={!p.hiddenTabs.length} onclick={() => set('hiddenTabs', [])}>{L("Alle zeigen")}</button>
      </div>
    </div>
    <p class="hint">{L("Ausgeblendete Werkzeuge bleiben über die Befehlssuche ({0}+K) erreichbar. Rechtsklick auf eine Registerkarte blendet sie direkt aus.", mac ? '⌘' : L("Strg"))}</p>
  </section>

  <section>
    <h3>{L("Schnellzugriff")}</h3>
    <div class="group pad">
      <div class="chips">
        {#each qaTools as t (t.id)}
          <button class="chip" class:on={p.quickAccess.includes(t.id)} aria-pressed={p.quickAccess.includes(t.id)} onclick={() => toggleQa(t.id)}><t.icon size={12} />{t.short || t.label}</button>
        {/each}
      </div>
    </div>
    <p class="hint">{L("Diese Befehle stehen oben in der Titelleiste.")}</p>
  </section>

  <section>
    <h3>{L("Engines")}</h3>
    <div class="group">
      <label class="row"><span>{L("PDF-Engine im Hintergrund vorbereiten")}</span><input class="switch" type="checkbox" checked={p.preloadEngines} onchange={e => set('preloadEngines', e.currentTarget.checked)} /></label>
      <div class="row stack office" class:ok={office?.available}>
        <span class="lbl">{L("Office-Umwandlung")}</span>
        {#if !isTauri}<span class="st"><i></i>{L("Eingebaute Engine (Browser)")}</span>
        {:else if office === null}<span class="st">{L("wird geprüft …")}</span>
        {:else if office.available}<span class="st"><i></i>{L("Installiertes LibreOffice – schnell")}</span><small title={office.path}>{office.path}</small>
        {:else}<span class="st"><i></i>{L("Eingebaute Engine – der erste Start dauert etwas.")}</span><small>{L("Tipp: Mit installiertem")} <button class="link" onclick={() => openExternal('https://de.libreoffice.org/download/download/')}>LibreOffice</button> {L("geht es deutlich schneller; Werkbank erkennt es automatisch.")}</small>{/if}
      </div>
      <div class="row">
        <button class="btn sm" disabled={!!warming} onclick={preload}>{warming ? L("{0} lädt …", warming) : L("Jetzt vorladen")}</button>
        <button class="btn sm ghost" onclick={restartEngines}>{L("Neu starten")}</button>
      </div>
    </div>
    <p class="hint">{L("Umwandlungen laufen vollständig auf diesem Rechner. Mit dieser Option starten Komprimieren, Word-Export und Co. ohne Wartezeit (kostet etwas Arbeitsspeicher).")}</p>
  </section>

  <section>
    <h3>{L("KI-Assistenten")}</h3>
    <div class="group">
      <label class="row"><span>{L("Steuerung durch KI-Assistenten erlauben (MCP)")}</span><input class="switch" type="checkbox" disabled={!isTauri} checked={p.mcp} onchange={e => setMcp(e.currentTarget.checked)} /></label>
      {#if !isTauri}
        <p class="row note">{L("Nur in der Desktop-App verfügbar.")}</p>
      {:else if p.mcp}
        <div class="row stack">
          <span class="lbl">{L("In Claude Desktop oder einem anderen Assistenten eintragen")}</span>
          <pre class="cfg">{mcpConfig}</pre>
          <div class="btns"><button class="btn sm" onclick={copyConfig}>{#if copied}<I.Check size={13} />{L("Kopiert")}{:else}<I.Copy size={13} />{L("Kopieren")}{/if}</button></div>
        </div>
      {/if}
    </div>
    <p class="hint">{L("Der Assistent kann offene Dokumente lesen, kommentieren, Formulare ausfüllen und Werkzeuge ausführen. Jede Änderung lässt sich rückgängig machen; gespeichert wird nur, wenn er es ausdrücklich tut. Die Verbindung bleibt auf diesem Rechner.")}</p>
  </section>

  <section>
    <h3>{L("Daten")}</h3>
    <div class="group">
      <div class="row"><span>{L("Zuletzt geöffnet")} <em class="num">{app.recent.length}</em></span><button class="btn sm" disabled={!app.recent.length} onclick={clearRecent}>{L("Leeren")}</button></div>
      <div class="row"><span>{L("Gespeicherte Unterschriften")} <em class="num">{p.signatures.length}</em></span><button class="btn sm" disabled={!p.signatures.length} onclick={clearSignatures}>{L("Löschen")}</button></div>
    </div>
  </section>

  <section>
    <h3>{L("Über Werkbank")}</h3>
    <div class="group">
      <div class="about">
        <img src="/icon.png" alt="" />
        <div><b>Werkbank</b><span class="num">{L("Version {0}", __APP_VERSION__)} · {os === 'web' ? 'Browser' : os === 'macos' ? 'macOS' : os === 'windows' ? 'Windows' : 'Linux'}</span></div>
      </div>
      <p class="row note">{L("Freie Software unter AGPL-3.0, aufgebaut auf BentoPDF und diesen Komponenten:")}</p>
      <ul class="lic">
        {#each components as [n, l, u] (n)}<li><button class="link" onclick={() => openExternal(u)}>{n}</button><span>{l}</span></li>{/each}
      </ul>
    </div>
  </section>
</div>

<style>
  .p { display: flex; flex-direction: column; gap: 22px; padding-bottom: 8px; }
  section { display: flex; flex-direction: column; gap: 7px; }
  h3 { margin: 0 0 0 2px; font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-3); }
  /* Gruppen wie Karteikarten: Zeilen mit Haarlinie dazwischen */
  .group { display: flex; flex-direction: column; border-radius: 12px; background: var(--surface); box-shadow: var(--shadow-1), 0 0 0 0.5px var(--line); overflow: hidden; }
  .group.pad { padding: 12px; gap: 12px; }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 42px; padding: 7px 12px; font-size: 12.75px; color: var(--text); }
  .row + .row { border-top: 0.5px solid var(--line); }
  .row.stack { flex-direction: column; align-items: stretch; justify-content: center; gap: 7px; padding: 10px 12px; }
  .lbl { font-size: 12px; color: var(--text-2); font-weight: 500; }
  .row em { font-style: normal; color: var(--text-3); margin-left: 4px; font-size: 11.5px; }
  .seg { align-self: flex-start; }
  .themes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .th { display: flex; flex-direction: column; align-items: center; gap: 6px; border: 0; background: none; padding: 0; font-size: 11.5px; color: var(--text-2); }
  .sw { width: 100%; height: 40px; border-radius: 8px; box-shadow: 0 0 0 0.5px var(--line-strong); transition: box-shadow 0.12s; }
  .sw.light { background: linear-gradient(180deg, #F3F5F4 0 32%, #FFFFFF 32%); }
  .sw.dark { background: linear-gradient(180deg, #181C1D 0 32%, #0B0D0E 32%); }
  .sw.system { background: linear-gradient(110deg, #FFFFFF 0 50%, #181C1D 50%); }
  .th[aria-pressed='true'] { color: var(--accent-text); font-weight: 600; }
  .th[aria-pressed='true'] .sw { box-shadow: 0 0 0 2px var(--accent); }
  .switch { appearance: none; flex: none; width: 32px; height: 19px; border-radius: 999px; background: var(--line-strong); position: relative; cursor: pointer; transition: background-color 0.18s var(--ease); margin: 0; }
  .switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 15px; height: 15px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25); transition: transform 0.18s var(--ease); }
  .switch:checked { background: var(--accent); }
  .switch:checked::after { transform: translateX(13px); }
  .switch:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip { display: inline-flex; align-items: center; gap: 4px; height: 26px; padding: 0 10px; border-radius: 999px; border: 0; box-shadow: inset 0 0 0 0.5px var(--line-strong); background: none; font-size: 12px; color: var(--text-2); transition: background-color 0.12s, color 0.12s; }
  .chip:hover:not(:disabled) { background: var(--hover); color: var(--text); }
  .chip.on { background: var(--accent-soft); color: var(--accent-text); box-shadow: none; font-weight: 500; }
  .chip:disabled { opacity: 0.7; }
  .hint { margin: 0 2px; font-size: 11.75px; color: var(--text-3); line-height: 1.5; }
  .note { margin: 0; font-size: 12px; color: var(--text-3); line-height: 1.5; }
  .btns { display: flex; flex-wrap: wrap; gap: 6px; }
  .office .st { display: flex; align-items: center; gap: 7px; font-size: 12.5px; color: var(--text-2); }
  .office .st i { width: 7px; height: 7px; border-radius: 50%; background: var(--warn, #E7A33C); flex: none; }
  .office.ok .st i { background: var(--ok, #2a9d55); }
  .office small { color: var(--text-3); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 1.45; }
  .office small:has(button) { white-space: normal; }
  .about { display: flex; align-items: center; gap: 12px; padding: 14px 12px 4px; }
  .about img { width: 40px; height: 40px; }
  .about div { display: flex; flex-direction: column; gap: 1px; }
  .about b { font: 600 14px/1.2 var(--font-display); letter-spacing: -0.01em; }
  .about span { font-size: 11.5px; color: var(--text-3); }
  .about + .row { border-top: 0; }
  .lic { margin: 0; padding: 0 12px 12px; list-style: none; display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
  .lic li { display: flex; justify-content: space-between; gap: 8px; }
  .lic span { color: var(--text-3); }
  .cfg { margin: 0; padding: 10px 12px; border-radius: 8px; background: var(--hover); font: 11px/1.5 ui-monospace, 'SF Mono', Menlo, Consolas, monospace; color: var(--text); white-space: pre-wrap; word-break: break-all; user-select: text; }
  .link { border: 0; background: none; padding: 0; color: var(--accent-text); font-size: 12px; cursor: pointer; }
  .link:hover { text-decoration: underline; }
</style>
