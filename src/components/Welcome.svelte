<script lang="ts">
  // Willkommensfenster beim ersten Start: Sprache und Erscheinungsbild wählen, drei Hinweise, los.
  import { L, getLocale } from '../lib/i18n';
  import { app, savePrefs, applyTheme } from '../lib/app.svelte';
  import { stateSaveNow } from '../lib/platform';
  import { onMount } from 'svelte';
  import wordmark from '../wordmark.svg?raw';
  import * as I from '../lib/icons';

  const p = app.prefs;
  const mod = navigator.platform.includes('Mac') ? '⌘' : L("Strg");
  let switching = $state(false);
  let go: HTMLButtonElement;

  const points: [any, string, string][] = [
    [I.HardDrive, L("Alles bleibt auf diesem Rechner"), L("Umwandeln, Texterkennung und Komprimieren laufen lokal. Es wird nichts hochgeladen.")],
    [I.MousePointer2, L("Direkt auf der Seite arbeiten"), L("Text, Bilder und Anmerkungen anklicken und ändern. Jede Änderung lässt sich mit {0}+Z zurücknehmen.", mod)],
    [I.Command, L("Jedes Werkzeug mit {0}+K", mod), L("Die Befehlssuche findet alles, auch was in der Bandleiste ausgeblendet ist.")],
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
    <aside class="hero" aria-hidden="true">
      <div class="mat"></div>
      <div class="brand">
        <img src="/icon.png" alt="" />
        <div class="wm">{@html wordmark}</div>
        <p>{L("PDFs lesen, bearbeiten, umwandeln und schützen – alles auf diesem Rechner.")}</p>
      </div>
      <div class="ruler"><span class="num">0</span><span class="num">10</span><span class="num">20</span><span class="num">30</span><span class="num">40</span><span class="num">50</span></div>
    </aside>

    <section class="main">
      <header>
        <h2 id="wl-h">{L("Willkommen in der Werkbank")}</h2>
        <p class="lead">{L("Zwei Dinge vorab – beides lässt sich später in den Einstellungen ändern.")}</p>
      </header>

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

      <ul class="points">
        {#each points as [Icon, t, d], k (k)}
          <li><span class="pi"><Icon size={15} strokeWidth={1.8} /></span><span><b>{t}</b><small>{d}</small></span></li>
        {/each}
      </ul>

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
  .sheet { display: grid; grid-template-columns: 300px minmax(0, 1fr); width: min(860px, 100%); min-height: 540px; border-radius: 20px; overflow: hidden;
    background: var(--surface); box-shadow: 0 40px 90px -20px rgba(6, 28, 32, 0.45), 0 0 0 0.5px var(--line-strong); animation: wl-rise 0.55s 0.16s var(--ease) both; }
  @keyframes wl-rise { from { opacity: 0; transform: translateY(14px) scale(0.975); } }

  /* Linke Seite: Schneidematte in Petrol – Raster wie auf der Werkbank */
  .hero { position: relative; display: flex; flex-direction: column; justify-content: center; padding: 40px 34px 64px; color: #EAF6F7; overflow: hidden;
    background: radial-gradient(120% 80% at 20% 0%, #1A8C9B 0%, #0B6E7B 42%, #07444C 100%); }
  .mat { position: absolute; inset: 0; opacity: 0.55;
    background-image:
      linear-gradient(rgba(255, 255, 255, 0.09) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.09) 1px, transparent 1px),
      linear-gradient(rgba(255, 255, 255, 0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.035) 1px, transparent 1px);
    background-size: 50px 50px, 50px 50px, 10px 10px, 10px 10px; background-position: -1px -1px;
    mask-image: radial-gradient(130% 100% at 30% 30%, #000 30%, transparent 85%); -webkit-mask-image: radial-gradient(130% 100% at 30% 30%, #000 30%, transparent 85%); }
  .brand { position: relative; display: flex; flex-direction: column; gap: 18px; }
  .brand img { width: 64px; height: 64px; filter: drop-shadow(0 10px 22px rgba(0, 20, 24, 0.4)); }
  .wm { color: #fff; line-height: 0; }
  .wm :global(svg) { height: 30px; width: auto; }
  .brand p { margin: 0; font-size: 13.5px; line-height: 1.55; color: rgba(234, 246, 247, 0.78); max-width: 24ch; }
  .ruler { position: absolute; left: 0; right: 0; bottom: 0; height: 34px; display: flex; justify-content: space-between; padding: 0 0 0 0; border-top: 1px solid rgba(255, 255, 255, 0.14);
    background:
      repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.5) 0 1px, transparent 1px 50px) top left / 100% 12px no-repeat,
      repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.28) 0 1px, transparent 1px 10px) top left / 100% 6px no-repeat; }
  .ruler span { font-size: 9.5px; color: rgba(234, 246, 247, 0.55); padding-top: 15px; width: 50px; text-indent: 4px; }
  .ruler span:first-child { text-indent: 5px; }

  /* Rechte Seite */
  .main { display: flex; flex-direction: column; gap: 22px; padding: 38px 40px 28px; min-width: 0; }
  h2 { margin: 0 0 6px; font: 650 24px/1.15 var(--font-display); letter-spacing: -0.025em; color: var(--text); text-wrap: balance; }
  .lead { margin: 0; font-size: 13px; color: var(--text-2); line-height: 1.5; }
  .field { display: flex; flex-direction: column; gap: 9px; }
  .lbl { font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-3); }
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

  .points { list-style: none; margin: 2px 0 0; padding: 16px 0 0; border-top: 0.5px solid var(--line); display: flex; flex-direction: column; gap: 12px; }
  .points li { display: grid; grid-template-columns: 28px minmax(0, 1fr); gap: 12px; align-items: start; }
  .pi { width: 28px; height: 28px; border-radius: 8px; display: grid; place-items: center; background: var(--accent-soft); color: var(--accent); }
  .points b { display: block; font-size: 12.75px; font-weight: 600; color: var(--text); margin: 1px 0 1px; }
  .points small { display: block; font-size: 12px; line-height: 1.45; color: var(--text-2); }

  footer { margin-top: auto; display: flex; align-items: center; justify-content: flex-end; gap: 10px; padding-top: 6px; }
  .kbd { font-size: 11px; color: var(--text-3); padding: 2px 6px; border-radius: 5px; box-shadow: inset 0 0 0 0.5px var(--line-strong); }
  .go { height: 38px; padding: 0 18px 0 20px; font-size: 13.5px; gap: 8px; border-radius: 10px; }

  @media (max-width: 760px) { .sheet { grid-template-columns: 1fr; } .hero { display: none; } }
  @media (prefers-reduced-motion: reduce) { .welcome, .sheet { animation: none; } }
</style>
