// Markdown (aus der Strukturerkennung) → DokuWiki-Syntax
import { describe, it, expect } from 'vitest';
import { markdownToDokuwiki as dw } from '../../src/lib/dokuwiki';

describe('DokuWiki-Export', () => {
  it('Überschriften: Ebene 1 hat die meisten Gleichheitszeichen', () => {
    expect(dw('# Titel\n\n## Abschnitt\n\n### Unterabschnitt\n\n#### Vier\n\n##### Fünf\n\n###### Sechs')).toBe(
      '====== Titel ======\n\n===== Abschnitt =====\n\n==== Unterabschnitt ====\n\n=== Vier ===\n\n== Fünf ==\n\n== Sechs ==');
  });

  it('Überschriften ohne Formatierung (DokuWiki kennt dort keine)', () => {
    expect(dw('# **Briefkopf Forstbetrieb**')).toBe('====== Briefkopf Forstbetrieb ======');
    expect(dw('## *Kursiv* und `code`')).toBe('===== Kursiv und code =====');
  });

  it('fett, kursiv, durchgestrichen, Code im Text', () => {
    expect(dw('Das ist **fett**, *kursiv*, _auch kursiv_, ~~weg~~ und `code`.')).toBe(
      "Das ist **fett**, //kursiv//, //auch kursiv//, <del>weg</del> und ''code''.");
    expect(dw('***beides***')).toBe('**//beides//**');
    expect(dw('__doppelt__ heißt in Markdown fett')).toBe('**doppelt** heißt in Markdown fett');
  });

  it('Unterstriche in Wörtern und Dateinamen bleiben stehen', () => {
    expect(dw('Datei mein_bericht_2026.pdf und snake_case')).toBe('Datei mein_bericht_2026.pdf und snake_case');
  });

  it('Links und Bilder', () => {
    expect(dw('Siehe [Webseite](https://example.com/a?b=1) und <https://werkbank.de>.')).toBe(
      'Siehe [[https://example.com/a?b=1|Webseite]] und https://werkbank.de.');
    expect(dw('![Logo der Firma](bild-1.png)')).toBe('{{bild-1.png|Logo der Firma}}');
  });

  it('Aufzählungen und nummerierte Listen mit Einrückung', () => {
    expect(dw('- eins\n- zwei\n  - zwei a\n    - tief\n- drei')).toBe('  * eins\n  * zwei\n    * zwei a\n      * tief\n  * drei');
    expect(dw('1. erstens\n2. zweitens\n   1. unterpunkt')).toBe('  - erstens\n  - zweitens\n    - unterpunkt');
    expect(dw('* Stern\n+ Plus')).toBe('  * Stern\n  * Plus');
  });

  it('Tabellen: Kopfzeile mit ^, Trennzeile entfällt, Zeilenumbrüche in Zellen', () => {
    const md = '|Art|Menge|Hinweis|\n|---|--:|---|\n|Fichte|12|frisch<br>geschlagen|\n|Buche||trocken|';
    expect(dw(md)).toBe('^ Art ^ Menge ^ Hinweis ^\n| Fichte | 12 | frisch \\\\ geschlagen |\n| Buche |  | trocken |');
  });

  it('Codeblöcke bleiben unverändert, mit Sprache', () => {
    expect(dw('```python\nx = **2**  # nicht fett\n```')).toBe('<code python>\nx = **2**  # nicht fett\n</code>');
    expect(dw('```\n# keine Überschrift\n```')).toBe('<code>\n# keine Überschrift\n</code>');
  });

  it('Trennlinien, Zitate, harte Zeilenumbrüche', () => {
    expect(dw('oben\n\n---\n\nunten')).toBe('oben\n\n----\n\nunten');
    expect(dw('> Zitat\n> zweite Zeile')).toBe('> Zitat\n> zweite Zeile');
    expect(dw('Zeile eins  \nZeile zwei')).toBe('Zeile eins \\\\ \nZeile zwei'.replace(' \n', '\n'));
  });

  it('DokuWiki-Sonderzeichen im Fließtext werden geschützt', () => {
    expect(dw('Pfad C:\\\\daten und [[keinlink]] sowie {{kein bild}}')).toBe('Pfad C:\\\\daten und %%[[%%keinlink%%]]%% sowie %%{{%%kein bild%%}}%%');
  });

  it('Seitenumbrüche aus der Erkennung werden zu Trennlinien', () => {
    expect(dw('Seite eins\n\n-----\n\nSeite zwei')).toBe('Seite eins\n\n----\n\nSeite zwei');
  });
});
