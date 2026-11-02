<script lang="ts">
  // Willkommensfenster beim ersten Start: Sprache und Erscheinungsbild wählen, drei Hinweise, los.
  // Gestaltung wie der Startbildschirm: Werkbank-Fläche mit Lineal, Überschrift in der Auszeichnungsschrift.
  import { L, getLocale } from '../lib/i18n';
  import { app, savePrefs, applyTheme } from '../lib/app.svelte';
  import { stateSaveNow } from '../lib/platform';
  import { onMount } from 'svelte';
  import * as I from '../lib/icons';

  const p = app.prefs;
  const mod = navigator.platform.includes('Mac') ? '⌘' : L("Strg");
  let switching = $state(false);
  let go: HTMLButtonElement;

  const points: [string, string][] = [
    [L("Alles bleibt auf diesem Rechner"), L("Umwandeln, Texterkennung und Komprimieren laufen lokal. Es wird nichts hochgeladen.")],
    [L("Direkt auf der Seite arbeiten"), L("Text, Bilder und Anmerkungen anklicken und ändern. Jede Änderung lässt sich mit {0}+Z zurücknehmen.", mod)],
    [L("Jedes Werkzeug mit {0}+K", mod), L("Die Befehlssuche findet alles, auch was in der Bandleiste ausgeblendet ist.")],
  ];
  const themes: ['system' | 'light' | 'dark', string][] = [['system', L("Wie System")], ['light', L("Hell")], ['dark', L("Dunkel")]];

  /** Sprache gilt ab dem nächsten Start: speichern und neu laden – das Fenster erscheint wieder */
  async function setLang(l: 'system' | 'de' | 'en') {
    if (p.lang === l) return;
    p.lang = l; switching = true;
    await stateSaveNow('prefs', $state.snapshot(p));
    location.reload();
  }
  function setTheme(t: 'system' | 'light' | 'dark') { p.theme = t; applyTheme(); savePrefs(); }
  async function done() { p.introSeen = true; await stateSaveNow('prefs', $state.snapshot(p)); }
  function key(e: KeyboardEvent) {
    if (e.key === 'Enter' && !(e.target as HTMLElement).closest('button')) { e.preventDefault(); done(); }
    if (e.key === 'Escape') { e.preventDefault(); done(); }
  }
  onMount(() => { setTimeout(() => go?.focus({ preventScroll: true }), 50); });
</script>

<svelte:window onkeydown={key} />

<div class="welcome">
  <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="wl-h">
    <header class="bench">
      <span class="ruler" aria-hidden="true"></span>
      <div class="bench-body">
        <div class="brand"><img src="/icon.png" alt="" /><span>Werkbank</span></div>
        <h2 id="wl-h">{L("Willkommen in der Werkbank")}</h2>
        <p class="lead">{L("Zwei Dinge vorab – beides lässt sich später in den Einstellungen ändern.")}</p>
      </div>
    </header>

    <section class="main">
      <div class="field">
        <span class="lbl">{L("Sprache")}{getLocale() === 'de' ? ' · Language' : ''}</span>
        <div class="seg lang" class:busy={switching}>
          <button aria-pressed={p.lang === 'system'} onclick={() => setLang('system')}>{L("Wie System")}</button>
          <button aria-pressed={p.lang === 'de'} onclick={() => setLang('de')}>Deutsch</button>
          <button aria-pressed={p.lang === 'en'} onclick={() => setLang('en')}>English</button>
        </div>
      </div>

      <div class="field">
        <span class="lbl">{L("Erscheinungsbild")}</span>
        <div class="themes">
          {#each themes as [v, n] (v)}
            <button class="th" aria-pressed={p.theme === v} aria-label={n} onclick={() => setTheme(v)}>
              <span class="mock {v}"><span class="tb"></span><span class="sb"></span><span class="pg"></span></span>
              <span class="tn">{#if p.theme === v}<I.Check size={12} strokeWidth={2.6} />{/if}{n}</span>
            </button>
          {/each}
        </div>
      </div>

      <ol class="points">
        {#each points as [t, d], k (k)}
          <li><span class="pn num" aria-hidden="true">{String(k + 1).padStart(2, '0')}</span><span><b>{t}</b><small>{d}</small></span></li>
        {/each}
      </ol>

      <footer>
        <span class="kbd">↵</span>
        <button class="btn primary go" bind:this={go} onclick={done}>{L("Loslegen")}<I.ArrowRight size={15} strokeWidth={2} /></button>
      </footer>
    </section>
  </div>
</div>

<style>
  .welcome { position: fixed; inset: 0; z-index: 900; display: grid; place-items: center; padding: 24px;
    background: color-mix(in srgb, var(--win) 55%, transparent); backdrop-filter: blur(14px) saturate(1.1); -webkit-backdrop-filter: blur(14px) saturate(1.1);
    animation: wl-fade 0.4s 0.12s var(--ease) both; }
  @keyframes wl-fade { from { opacity: 0; } }
  .sheet { display: flex; flex-direction: column; width: min(620px, 100%); max-height: calc(100vh - 48px); border-radius: 20px; overflow: hidden auto;
    background: var(--surface); box-shadow: 0 40px 90px -20px rgba(6, 28, 32, 0.45), 0 0 0 0.5px var(--line-strong); animation: wl-rise 0.55s 0.16s var(--ease) both; }
  @keyframes wl-rise { from { opacity: 0; transform: translateY(14px) scale(0.975); } }

  /* Oben: die Werkbank-Fläche mit Lineal – wie auf dem Startbildschirm */
  .bench { background: color-mix(in srgb, var(--text) 6%, var(--bar)); }
  .ruler { display: block; height: 14px;
    background:
      repeating-linear-gradient(90deg, var(--line-strong) 0 1px, transparent 1px 12px) top / 100% 6px no-repeat,
      repeating-linear-gradient(90deg, color-mix(in srgb, var(--text) 30%, transparent) 0 1px, transparent 1px 60px) top / 100% 12px no-repeat; }
  .bench-body { padding: 22px 40px 28px; display: flex; flex-direction: column; gap: 10px; }
  .brand { display: flex; align-items: center; gap: 9px; margin-bottom: 8px; font: 650 14px var(--font-brand); letter-spacing: -0.01em; color: var(--text-2); }
  .brand img { width: 24px; height: 24px; }
  h2 { margin: 0; font: 620 38px/1.04 var(--font-brand); letter-spacing: -0.03em; color: var(--text); text-wrap: balance; }
  .lead { margin: 0; font-size: 14px; color: var(--text-2); line-height: 1.5; max-width: 48ch; }

  .main { display: flex; flex-direction: column; gap: 22px; padding: 28px 40px 26px; min-width: 0; }
  .field { display: flex; flex-direction: column; gap: 9px; }
  .lbl { font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-2); }
  .seg.lang { align-self: flex-start; }
  .seg.busy { opacity: 0.55; pointer-events: none; }

  .themes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .th { display: flex; flex-direction: column; gap: 8px; border: 0; background: none; padding: 0; color: var(--text-2); font-size: 12px; text-align: left; }
  .mock { position: relative; display: block; height: 62px; border-radius: 10px; overflow: hidden; box-shadow: 0 0 0 0.5px var(--line-strong), 0 1px 3px rgba(14, 28, 30, 0.08);
    transition: box-shadow 0.15s, transform 0.18s var(--ease); --m-win: #E9ECEB; --m-bar: #F5F7F6; --m-page: #FFFFFF; --m-line: #D5DBDA; background: var(--m-win); }
  .mock.dark { --m-win: #111415; --m-bar: #1D2122; --m-page: #2A3031; --m-line: #3A4243; }
  .mock .tb { position: absolute; left: 6px; right: 6px; top: 6px; height: 9px; border-radius: 3px; background: var(--m-bar); }
  .mock .sb { position: absolute; left: 6px; top: 19px; bottom: 6px; width: 18px; border-radius: 3px; background: var(--m-bar); }
  .mock .pg { position: absolute; left: 30px; right: 6px; top: 19px; bottom: 6px; border-radius: 3px; background: var(--m-page);
    background-image: linear-gradient(var(--m-line) 0 0), linear-gradient(var(--m-line) 0 0), linear-gradient(var(--m-line) 0 0);
    background-size: 46% 3px, 64% 2px, 56% 2px; background-position: 8px 8px, 8px 16px, 8px 22px; background-repeat: no-repeat; }
  .mock.system::after { content: ''; position: absolute; inset: 0; clip-path: polygon(62% 0, 100% 0, 100% 100%, 38% 100%);
    background: #111415; }
  .mock.system { overflow: hidden; }
  .th:hover .mock { transform: translateY(-1px); }
  .th[aria-pressed='true'] .mock { box-shadow: 0 0 0 2px var(--accent), 0 4px 12px -4px color-mix(in srgb, var(--accent) 50%, transparent); }
  .tn { display: inline-flex; align-items: center; gap: 5px; padding-left: 2px; }
  .th[aria-pressed='true'] .tn { color: var(--accent-text); font-weight: 600; }

  .points { list-style: none; margin: 0; padding: 18px 0 0; border-top: 0.5px solid var(--line); display: flex; flex-direction: column; gap: 12px; }
  .points li { display: grid; grid-template-columns: 26px minmax(0, 1fr); gap: 10px; align-items: baseline; }
  .pn { font: 500 11.5px var(--mono); color: var(--accent-text); }
  .points b { display: block; font-size: 13px; font-weight: 600; color: var(--text); margin-bottom: 1px; }
  .points small { display: block; font-size: 12.25px; line-height: 1.45; color: var(--text-2); }

  footer { margin-top: auto; display: flex; align-items: center; justify-content: flex-end; gap: 10px; padding-top: 6px; }
  .kbd { font-size: 11px; color: var(--text-3); padding: 2px 6px; border-radius: 5px; box-shadow: inset 0 0 0 0.5px var(--line-strong); }
  .go { height: 38px; padding: 0 18px 0 20px; font-size: 13.5px; gap: 8px; border-radius: 10px; }

  @media (max-width: 560px) { .bench-body, .main { padding-left: 24px; padding-right: 24px; } h2 { font-size: 30px; } }
  @media (prefers-reduced-motion: reduce) { .welcome, .sheet { animation: none; } }
</style>
