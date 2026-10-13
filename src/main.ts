import './app.css';
import 'pdfjs-dist/legacy/web/pdf_viewer.css';
import './viewer.css';
import { mount } from 'svelte';
import { initPlatform, stateLoad } from './lib/platform';
import { setLocale, resolveLocale, type LocalePref } from './lib/i18n';

// Fehler der Oberfläche an die App melden (sichtbar mit WERKBANK_DEBUG=1 im Terminal)
if (location.hostname === '127.0.0.1') {
  const send = (kind: string, msg: unknown) => { try { fetch('/__log', { method: 'POST', body: `${kind}: ${msg instanceof Error ? msg.stack || msg.message : String(msg)}`.slice(0, 8000), keepalive: true }); } catch { /* egal */ } };
  addEventListener('error', e => send('error', e.error || e.message));
  addEventListener('unhandledrejection', e => send('unhandled', e.reason));
  const orig = console.error.bind(console);
  console.error = (...a: unknown[]) => { orig(...a); send('console', a.map(x => (x instanceof Error ? x.stack : typeof x === 'object' ? (() => { try { return JSON.stringify(x); } catch { return String(x); } })() : String(x))).join(' ')); };
  send('start', `${navigator.userAgent} isolated=${crossOriginIsolated} tauri=${'__TAURI_INTERNALS__' in window}`);
}

await initPlatform();
// Sprache vor allen Oberflächenmodulen festlegen – Werkzeuge und Bandleiste übersetzen sich beim Laden
{
  const prefs = await stateLoad<{ lang?: LocalePref }>('prefs', {});
  const forced = new URLSearchParams(location.search).get('lang') as LocalePref | null;
  const locale = resolveLocale(forced || prefs.lang || 'system', navigator.language);
  setLocale(locale, locale === 'en' ? (await import('./lib/i18n/en')).default : {});
}
const { default: App } = await import('./components/App.svelte');
mount(App, { target: document.getElementById('app')! });
