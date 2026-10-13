<script lang="ts">
  import { L, getLocale } from '../../lib/i18n';
  import { app, savePrefs, saveRecent, applyTheme, toast } from '../../lib/app.svelte';
  import { OCR_LANGS } from '../../lib/tools/optimize';
  import { TOOLS } from '../../lib/tools';
  import { RIBBON, ESSENTIAL_HIDDEN } from '../../lib/ribbon';
  import { warmPy, warmLibreOffice, resetEngines } from '../../lib/engines';
  import { openExternal, os, officeInfo, isTauri, stateSaveNow } from '../../lib/platform';
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
    <label class="row"><span>{L("Dein Name")}</span><input class="input" placeholder={L("für Kommentare, Stempel, Signaturen")} value={p.author} oninput={e => set('author', e.currentTarget.value)} /></label>
    <div class="row"><span>{L("Sprache")}{getLocale() === 'de' ? ' · Language' : ''}</span>
      <div class="seg">
        <button aria-pressed={p.lang === 'system'} onclick={() => setLang('system')}>{L("Wie System")}</button>
        <button aria-pressed={p.lang === 'de'} onclick={() => setLang('de')}>Deutsch</button>
        <button aria-pressed={p.lang === 'en'} onclick={() => setLang('en')}>English</button>
      </div>
      {#if langChanged}
        <p class="hint">{L("Die neue Sprache gilt nach einem Neustart der Werkbank.")}
          {#if !app.docs.some(d => d.dirty)}<button class="link" onclick={restart}>{L("Jetzt neu starten")}</button>{/if}</p>
      {/if}
    </div>
    <div class="row"><span>{L("Erscheinungsbild")}</span>
      <div class="seg">
        <button aria-pressed={p.theme === 'system'} onclick={() => set('theme', 'system')}>System</button>
        <button aria-pressed={p.theme === 'light'} onclick={() => set('theme', 'light')}>{L("Hell")}</button>
        <button aria-pressed={p.theme === 'dark'} onclick={() => set('theme', 'dark')}>{L("Dunkel")}</button>
      </div>
    </div>
    <label class="check"><input type="checkbox" checked={p.showFieldHighlight} onchange={e => set('showFieldHighlight', e.currentTarget.checked)} /> {L("Formularfelder hervorheben")}</label>
    <label class="check"><input type="checkbox" checked={p.nightReading} onchange={e => set('nightReading', e.currentTarget.checked)} /> {L("Nachtmodus beim Lesen")}</label>
  </section>

  <section>
    <h3>{L("Texterkennung")}</h3>
    <div class="chips">
      {#each OCR_LANGS as [code, name] (code)}
        <button class="chip" class:on={p.ocrLangs.includes(code)} onclick={() => toggleLang(code)}>{#if p.ocrLangs.includes(code)}<I.Check size={12} />{/if}{name}</button>
      {/each}
    </div>
    <p class="hint">{L("Standardsprachen für neue Texterkennungen. Die Sprachdaten sind in der App enthalten, es wird nichts heruntergeladen.")}</p>
  </section>

  <section>
    <h3>{L("Bandleiste")}</h3>
    <div class="chips">
      {#each RIBBON as t (t.id)}
        {@const shown = t.id === 'start' || !p.hiddenTabs.includes(t.id)}
        <button class="chip" class:on={shown} disabled={t.id === 'start'} onclick={() => set('hiddenTabs', shown ? [...p.hiddenTabs, t.id] : p.hiddenTabs.filter(x => x !== t.id))}>{#if shown}<I.Check size={12} />{/if}{t.label}</button>
      {/each}
    </div>
    <div class="btns">
      <button class="btn sm" onclick={() => set('hiddenTabs', [...ESSENTIAL_HIDDEN])}>{L("Nur das Wichtigste")}</button>
      <button class="btn sm ghost" disabled={!p.hiddenTabs.length} onclick={() => set('hiddenTabs', [])}>{L("Alle zeigen")}</button>
    </div>
    <p class="hint">{L("Ausgeblendete Werkzeuge bleiben über die Befehlssuche (Strg+K) erreichbar. Rechtsklick auf eine Registerkarte blendet sie direkt aus.")}</p>
  </section>

  <section>
    <h3>{L("Schnellzugriff")}</h3>
    <div class="chips">
      {#each qaTools as t (t.id)}
        <button class="chip" class:on={p.quickAccess.includes(t.id)} onclick={() => toggleQa(t.id)}><t.icon size={12} />{t.short || t.label}</button>
      {/each}
    </div>
    <p class="hint">{L("Diese Befehle stehen oben in der Titelleiste.")}</p>
  </section>

  <section>
    <h3>{L("Engines")}</h3>
    <label class="check"><input type="checkbox" checked={p.preloadEngines} onchange={e => set('preloadEngines', e.currentTarget.checked)} /> {L("PDF-Engine im Hintergrund vorbereiten")}</label>
    <p class="hint">{L("Umwandlungen laufen vollständig auf diesem Rechner. Mit dieser Option starten Komprimieren, Word-Export und Co. ohne Wartezeit (kostet etwas Arbeitsspeicher).")}</p>
    <div class="office" class:ok={office?.available}>
      <b>{L("Office-Umwandlung")}</b>
      {#if !isTauri}<span>{L("Eingebaute Engine (Browser)")}</span>
      {:else if office === null}<span>{L("wird geprüft …")}</span>
      {:else if office.available}<span>{L("Installiertes LibreOffice – schnell")}</span><small title={office.path}>{office.path}</small>
      {:else}<span>{L("Eingebaute Engine – der erste Start dauert etwas.")}</span><small>{L("Tipp: Mit installiertem")} <button class="link" onclick={() => openExternal('https://de.libreoffice.org/download/download/')}>LibreOffice</button> {L("geht es deutlich schneller; Werkbank erkennt es automatisch.")}</small>{/if}
    </div>
    <div class="btns">
      <button class="btn sm" disabled={!!warming} onclick={preload}>{warming ? L("{0} lädt …", warming) : L("Jetzt vorladen")}</button>
      <button class="btn sm ghost" onclick={restartEngines}>{L("Neu starten")}</button>
    </div>
  </section>

  <section>
    <h3>{L("Daten")}</h3>
    <div class="btns">
      <button class="btn sm" disabled={!app.recent.length} onclick={clearRecent}>{L("Zuletzt geöffnet leeren")}</button>
      <button class="btn sm" disabled={!p.signatures.length} onclick={clearSignatures}>{L("Unterschriften löschen ({0})", p.signatures.length)}</button>
    </div>
  </section>

  <section>
    <h3>{L("Über Werkbank")}</h3>
    <p class="hint">{L("Werkbank · {0} · freie Software unter AGPL-3.0, aufgebaut auf BentoPDF und diesen Komponenten:", os === 'web' ? 'Browser' : os === 'macos' ? 'macOS' : os === 'windows' ? 'Windows' : 'Linux')}</p>
    <ul class="lic">
      {#each components as [n, l, u] (n)}<li><button class="link" onclick={() => openExternal(u)}>{n}</button><span>{l}</span></li>{/each}
    </ul>
  </section>
</div>

<style>
  .p { display: flex; flex-direction: column; gap: 18px; }
  section { display: flex; flex-direction: column; gap: 8px; }
  h3 { margin: 0; font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-3); }
  .row { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--text-2); }
  .check { display: flex; align-items: center; gap: 8px; font-size: 12.5px; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip { display: inline-flex; align-items: center; gap: 4px; padding: 3px 9px; border-radius: 999px; border: 0.5px solid var(--line-strong, var(--line)); background: var(--surface); font-size: 12px; color: var(--text-2); }
  .chip.on { background: var(--accent-soft); color: var(--accent); border-color: transparent; }
  .hint { margin: 0; font-size: 12px; color: var(--text-3); line-height: 1.45; }
  .btns { display: flex; flex-wrap: wrap; gap: 6px; }
  .office { display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; border-radius: 8px; background: var(--surface); box-shadow: var(--shadow-1); font-size: 12px; }
  .office b { font-weight: 600; font-size: 12px; }
  .office span { color: var(--text-2); }
  .office.ok span { color: var(--ok, #2a9d55); }
  .office small { color: var(--text-3); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 1.45; }
  .office small:has(button) { white-space: normal; }
  .lic { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 3px; font-size: 12px; }
  .lic li { display: flex; justify-content: space-between; gap: 8px; }
  .lic span { color: var(--text-3); }
  .link { border: 0; background: none; padding: 0; color: var(--accent); font-size: 12px; cursor: pointer; }
  .link:hover { text-decoration: underline; }
</style>
