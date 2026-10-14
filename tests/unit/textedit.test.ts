import { describe, it, expect } from 'vitest';
import { groupLines, paragraphAt, joinLines, classifyFont, type Box } from '../../src/lib/textedit';

// Textstücke einer Seite in Bildschirmpixeln (wie sie die Textebene von pdf.js liefert)
const span = (text: string, left: number, top: number, width = text.length * 6, height = 14): Box => ({ text, left, top, right: left + width, bottom: top + height });

const page: Box[] = [
  span('Kapitel 1: Testdokument', 72, 60, 300, 26),
  span('Werkbank ist eine PDF-', 72, 120), span('Anwendung für Suche,', 210, 120),
  span('Markierung und Schwärzung. Kontakt:', 72, 137),
  span('max@example.com, IBAN DE89.', 72, 154),
  span('Tabelle 1', 90, 260),
  span('Rechte Spalte oben', 400, 120),
];

describe('Zeilen und Absätze erkennen', () => {
  it('fasst Textstücke derselben Grundlinie zu einer Zeile zusammen', () => {
    const lines = groupLines(page);
    const l = lines.find(x => x.text.startsWith('Werkbank'))!;
    expect(l.text).toBe('Werkbank ist eine PDF- Anwendung für Suche,');
  });
  it('trennt weit auseinanderliegende Spalten', () => {
    const lines = groupLines(page);
    expect(lines.some(l => l.text === 'Rechte Spalte oben')).toBe(true);
  });
  it('findet den Absatz um eine angeklickte Zeile', () => {
    const lines = groupLines(page);
    const i = lines.findIndex(l => l.text.startsWith('Markierung'));
    const p = paragraphAt(lines, i);
    expect(p.lines.map(l => l.text.split(' ')[0])).toEqual(['Werkbank', 'Markierung', 'max@example.com,']);
    expect(p.box.left).toBe(72);
    expect(p.box.top).toBe(120);
    expect(p.box.bottom).toBe(168);
  });
  it('nimmt Überschriften und entfernte Blöcke nicht in den Absatz auf', () => {
    const lines = groupLines(page);
    const p = paragraphAt(lines, lines.findIndex(l => l.text.startsWith('Werkbank')));
    expect(p.lines.some(l => l.text.startsWith('Kapitel'))).toBe(false);
    expect(p.lines.some(l => l.text.startsWith('Tabelle'))).toBe(false);
  });
  it('Tabellenspalte: kurze Zelleninhalte untereinander sind keine Absatzzeilen', () => {
    // Anzahl-Spalte wie in einer Geräteliste: Zeilenabstand eng genug für einen Absatz, aber jede Zelle ist eigenständig
    const col = ['1', '1', '1', '3', '2', '5'].map((t, k) => span(t, 320, 400 + k * 22, 7, 14));
    const lines = groupLines([...col, span('Vertex V', 60, 400, 50), span('Vertex V Laser Geo', 60, 422, 110)]);
    const i = lines.findIndex(l => l.text === '3');
    const p = paragraphAt(lines, i);
    expect(p.lines.map(l => l.text)).toEqual(['3']);
    expect(p.box.top).toBe(466);
  });
  it('umbrochener Text in einer schmalen Zelle bleibt ein Absatz', () => {
    const lines = groupLines([span('Vertex IV (einer permanent', 60, 300, 170), span('im Einsatz)', 60, 317, 70)]);
    expect(paragraphAt(lines, 1).lines.map(l => l.text)).toEqual(['Vertex IV (einer permanent', 'im Einsatz)']);
  });
  it('liefert für eine Einzelzeile genau diese Zeile', () => {
    const lines = groupLines(page);
    const p = paragraphAt(lines, lines.findIndex(l => l.text.startsWith('Kapitel')));
    expect(p.lines.length).toBe(1);
  });
});

describe('Zeilen zu Fließtext verbinden', () => {
  it('verbindet mit Leerzeichen und erhält Bindestriche am Zeilenende', () => {
    expect(joinLines(['Werkbank ist eine PDF-', 'Anwendung für alle', 'Fälle.'])).toBe('Werkbank ist eine PDF-Anwendung für alle Fälle.');
  });
  it('entfernt Silbentrennung bei kleingeschriebener Fortsetzung', () => {
    expect(joinLines(['Die Forst-', 'einrichtung beginnt'])).toBe('Die Forsteinrichtung beginnt');
  });
});

describe('Schriftart erkennen (für Vorschau und Ersatzschrift)', () => {
  it.each([
    ['BAAAAA+LiberationSans-Bold', { family: 'sans', bold: true, italic: false }],
    ['ArialMT', { family: 'sans', bold: false, italic: false }],
    ['Arial-BoldItalicMT', { family: 'sans', bold: true, italic: true }],
    ['TimesNewRomanPSMT', { family: 'serif', bold: false, italic: false }],
    ['DAAAAA+LiberationSerif', { family: 'serif', bold: false, italic: false }],
    ['Georgia-Italic', { family: 'serif', bold: false, italic: true }],
    ['CourierNewPSMT', { family: 'mono', bold: false, italic: false }],
    ['Consolas-Bold', { family: 'mono', bold: true, italic: false }],
    ['Calibri-Light', { family: 'sans', bold: false, italic: false }],
    ['SourceSansPro-Semibold', { family: 'sans', bold: true, italic: false }],
    ['', { family: 'sans', bold: false, italic: false }],
  ])('%s', (name, want) => expect(classifyFont(name)).toEqual(want));
  it('Angaben des PDF-Renderers haben Vorrang vor dem Namen', () => {
    expect(classifyFont('F1', { bold: true, serif: true })).toEqual({ family: 'serif', bold: true, italic: false });
    expect(classifyFont('F2', { mono: true, italic: true })).toEqual({ family: 'mono', bold: false, italic: true });
  });
});
