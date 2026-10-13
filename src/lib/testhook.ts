// Nur in Testbuilds (VITE_WB_TEST=1): interne Module für automatisierte Oberflächentests freigeben
import * as engines from './engines';
import * as tools from './tools';
import * as actions from './actions';
import * as overlay from './overlay.svelte';
import * as sign from './sign';
import { app, active } from './app.svelte';
(window as any).__wb = { ...engines, ...tools, actions, overlay, sign, app, active };
