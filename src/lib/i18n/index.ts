// Übersetzung: Der deutsche Quelltext ist zugleich der Schlüssel (wie bei gettext).
// Fehlt eine Übersetzung, erscheint der deutsche Text – nie ein leerer oder technischer Schlüssel.
// Die Sprache wird beim Start festgelegt (main.ts), bevor Werkzeuge und Bandleiste geladen werden;
// ein Wechsel wird deshalb mit dem nächsten Start wirksam.

export type Locale = 'de' | 'en';
export type LocalePref = 'system' | Locale;

let current: Locale = 'de';
let dict: Record<string, string> = {};

export function setLocale(l: Locale, dictionary: Record<string, string> = {}) {
  current = l;
  dict = l === 'de' ? {} : dictionary;
  if (typeof document !== 'undefined') document.documentElement.lang = l;
}
export const getLocale = () => current;

/** Systemsprache auswerten: Deutsch für de-*, sonst Englisch */
export function resolveLocale(pref: LocalePref | undefined, system: string | undefined): Locale {
  if (pref === 'de' || pref === 'en') return pref;
  return /^de\b/i.test(system || '') ? 'de' : 'en';
}

/** Text übersetzen; {0}, {1} … werden durch die weiteren Argumente ersetzt */
export function L(source: string, ...args: unknown[]): string {
  const text = dict[source] ?? source;
  if (!args.length) return text;
  return text.replace(/\{(\d+)\}/g, (m, i) => (+i < args.length ? String(args[+i]) : m));
}

/** Für Tests und das Extraktionsskript: alle bekannten Übersetzungen */
export const dictionary = () => dict;

/** Gebietsschema für Datums- und Zahlenformate passend zur Oberflächensprache */
export function intlLocale(): string {
  if (current === 'de') return 'de-DE';
  const sys = typeof navigator !== 'undefined' ? navigator.language : '';
  return /^en\b/i.test(sys) ? sys : 'en-GB';
}
