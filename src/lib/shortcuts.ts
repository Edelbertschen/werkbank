// Tastenkürzel: "Mod" = ⌘ auf dem Mac, Strg sonst
import { isMac } from './platform';

export function matches(e: KeyboardEvent, sc: string) {
  const parts = sc.split('+');
  const key = parts.pop()!.toLowerCase();
  const want = { mod: parts.includes('Mod'), shift: parts.includes('Shift'), alt: parts.includes('Alt'), ctrl: parts.includes('Ctrl') };
  const mac = isMac();
  const mod = mac ? e.metaKey : e.ctrlKey;
  const ctrl = mac ? e.ctrlKey : false;
  if (mod !== want.mod || e.shiftKey !== want.shift || e.altKey !== want.alt || ctrl !== want.ctrl) return false;
  const k = e.key.toLowerCase();
  if (key === '=' ) return k === '=' || k === '+';
  if (key === 'enter') return k === 'enter';
  return k === key || e.code.toLowerCase() === 'key' + key || e.code.toLowerCase() === 'digit' + key;
}

export function label(sc?: string) {
  if (!sc) return '';
  const mac = isMac();
  return sc.split('+').map(p => {
    if (p === 'Mod') return mac ? '⌘' : 'Strg';
    if (p === 'Shift') return mac ? '⇧' : 'Umschalt';
    if (p === 'Alt') return mac ? '⌥' : 'Alt';
    if (p === 'Ctrl') return mac ? '⌃' : 'Strg';
    if (p === 'Enter') return mac ? '↩' : 'Enter';
    return p.length === 1 ? p.toUpperCase() : p;
  }).join(mac ? '' : '+');
}
