import { describe, it, expect, beforeEach } from 'vitest';
import { L, setLocale, getLocale, resolveLocale } from '../../src/lib/i18n';

describe('Übersetzen', () => {
  beforeEach(() => setLocale('de'));

  it('gibt auf Deutsch den Quelltext zurück und setzt Platzhalter ein', () => {
    expect(L('Speichern')).toBe('Speichern');
    expect(L('Seite {0} von {1}', 2, 9)).toBe('Seite 2 von 9');
  });

  it('übersetzt ins Englische, auch mit Platzhaltern in anderer Reihenfolge', () => {
    setLocale('en', { 'Speichern': 'Save', 'Seite {0} von {1}': 'Page {0} of {1}', '{0} von {1} Seiten': '{0} of {1} pages' });
    expect(L('Speichern')).toBe('Save');
    expect(L('Seite {0} von {1}', 2, 9)).toBe('Page 2 of 9');
    expect(L('{0} von {1} Seiten', 3, 7)).toBe('3 of 7 pages');
  });

  it('fällt bei fehlender Übersetzung auf Deutsch zurück statt leer zu bleiben', () => {
    setLocale('en', {});
    expect(L('Unbekannter Text {0}', 5)).toBe('Unbekannter Text 5');
  });

  it('lässt Platzhalter ohne Wert stehen und behandelt geschweifte Klammern im Wert korrekt', () => {
    expect(L('A {0} B {1}', '{1}')).toBe('A {1} B {1}');
  });

  it('wählt die Sprache aus Einstellung und System', () => {
    expect(resolveLocale('system', 'de-AT')).toBe('de');
    expect(resolveLocale('system', 'en-GB')).toBe('en');
    expect(resolveLocale('system', 'fr-FR')).toBe('en');
    expect(resolveLocale('de', 'en-US')).toBe('de');
    expect(resolveLocale('en', 'de-DE')).toBe('en');
  });

  it('merkt sich die gewählte Sprache', () => {
    setLocale('en', {});
    expect(getLocale()).toBe('en');
  });
});
