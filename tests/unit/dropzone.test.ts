// Einfügeposition beim Ablegen von Dateien zwischen Seitenminiaturen
import { describe, it, expect } from 'vitest';
import { insertionIndex, type Box } from '../../src/lib/dropzone';

const col = (n: number): Box[] => [...Array(n).keys()].map(i => ({ left: 0, top: i * 100, right: 80, bottom: i * 100 + 90 }));
// Raster mit drei Spalten, Zellen 100 breit, 120 hoch, 10 Abstand
const grid = (n: number): Box[] => [...Array(n).keys()].map(i => {
  const r = Math.floor(i / 3), c = i % 3;
  return { left: c * 110, top: r * 130, right: c * 110 + 100, bottom: r * 130 + 120 };
});

describe('Spalte (Seitenleiste)', () => {
  it('obere Hälfte der ersten Seite: davor', () => expect(insertionIndex(col(4), 40, 20, 'vertical')).toBe(0));
  it('untere Hälfte der ersten Seite: dahinter', () => expect(insertionIndex(col(4), 40, 70, 'vertical')).toBe(1));
  it('im Abstand zwischen Seite 2 und 3', () => expect(insertionIndex(col(4), 40, 195, 'vertical')).toBe(2));
  it('unter der letzten Seite: ans Ende', () => expect(insertionIndex(col(4), 40, 900, 'vertical')).toBe(4));
  it('leere Liste: an den Anfang', () => expect(insertionIndex([], 10, 10, 'vertical')).toBe(0));
});

describe('Raster (Organisieren)', () => {
  it('linke Hälfte der ersten Zelle: davor', () => expect(insertionIndex(grid(7), 20, 60, 'grid')).toBe(0));
  it('rechte Hälfte der zweiten Zelle: dahinter', () => expect(insertionIndex(grid(7), 190, 60, 'grid')).toBe(2));
  it('zweite Reihe, links der fünften Zelle', () => expect(insertionIndex(grid(7), 120, 190, 'grid')).toBe(4));
  it('rechts neben der letzten Zelle einer Reihe', () => expect(insertionIndex(grid(7), 340, 60, 'grid')).toBe(3));
  it('im Abstand zwischen zwei Reihen: Anfang der unteren Reihe', () => expect(insertionIndex(grid(7), 50, 125, 'grid')).toBe(3));
  it('unter allem: ans Ende', () => expect(insertionIndex(grid(7), 50, 900, 'grid')).toBe(7));
  it('rechts neben der unvollständigen letzten Reihe: ans Ende', () => expect(insertionIndex(grid(7), 300, 300, 'grid')).toBe(7));
});
