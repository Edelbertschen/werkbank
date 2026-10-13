import './app.css';
import 'pdfjs-dist/legacy/web/pdf_viewer.css';
import './viewer.css';
import { mount } from 'svelte';
import App from './components/App.svelte';
import { initPlatform } from './lib/platform';

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
mount(App, { target: document.getElementById('app')! });
