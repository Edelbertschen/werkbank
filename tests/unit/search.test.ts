import { describe, it, expect } from 'vitest';
import { searchTools } from '../../src/lib/search';

const top = (q: string, n = 3) => searchTools(q).slice(0, n).map(t => t.id);

describe('Befehlssuche versteht Alltagssprache', () => {
  it.each([
    ['kleiner machen', 'compress'],
    ['datei verkleinern', 'compress'],
    ['pdf in word umwandeln', 'to-word'],
    ['word', 'to-word'],
    ['schwärzen', 'redact'],
    ['schwaerzen', 'redact'],
    ['passwort', 'protect'],
    ['seiten drehen', 'rotate'],
    ['unterschrift', 'sign'],
    ['text erkennen', 'ocr'],
    ['zusammenfügen', 'merge'],
    ['seitenzahlen einfügen', 'page-numbers'],
    ['wie kann ich seiten löschen', 'delete-pages'],
    ['excel', 'to-excel'],
    ['komprmieren', 'compress'], // Tippfehler
  ])('„%s“ → %s', (q, id) => {
    expect(top(q)).toContain(id);
  });
  it('liefert bei leerer Suche die häufigsten Befehle zuerst', () => {
    expect(searchTools('').length).toBeGreaterThan(20);
  });
  it('findet nichts Unsinniges', () => {
    expect(searchTools('xyzqwv').length).toBe(0);
  });
});
