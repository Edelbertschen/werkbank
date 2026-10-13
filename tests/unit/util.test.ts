import { describe, it, expect } from 'vitest';
import { parseRange, rangeLabel, baseName, extOf, withExt, paperName, hexToRgb01, fmtSize, isPdf, MM, bytesToDataUrl, dataUrlToBytes } from '../../src/lib/util';

describe('Seitenangaben', () => {
  it('versteht Einzelseiten, Bereiche und offene Bereiche', () => {
    expect(parseRange('1-3, 5, 8-', 10)).toEqual([0, 1, 2, 4, 7, 8, 9]);
    expect(parseRange('-2', 5)).toEqual([0, 1]);
  });
  it('erlaubt Leerzeichen, Semikolons, Gedankenstriche und umgekehrte Bereiche', () => {
    expect(parseRange('1 - 2; 4–5', 6)).toEqual([0, 1, 3, 4]);
    expect(parseRange('4-2', 6)).toEqual([1, 2, 3]);
  });
  it('kennt gerade, ungerade und „letzte“', () => {
    expect(parseRange('ungerade', 5)).toEqual([0, 2, 4]);
    expect(parseRange('gerade', 5)).toEqual([1, 3]);
    expect(parseRange('letzte', 7)).toEqual([6]);
    expect(parseRange('3-letzte', 5)).toEqual([2, 3, 4]);
  });
  it('entfernt Doppelte und sortiert', () => {
    expect(parseRange('3,1,3,2-3', 5)).toEqual([0, 1, 2]);
  });
  it('kappt Bereiche, die über das Dokument hinausgehen', () => {
    expect(parseRange('5-10', 6)).toEqual([4, 5]);
  });
  it('meldet Seiten, die es gar nicht gibt, statt sie stillschweigend zu ignorieren', () => {
    expect(() => parseRange('9', 6)).toThrow(/6 Seiten/);
    expect(() => parseRange('0', 6)).toThrow();
    expect(() => parseRange('8-9', 6)).toThrow(/6 Seiten/);
  });
  it('meldet unverständliche Angaben', () => {
    expect(() => parseRange('drei', 6)).toThrow(/keine gültige Seitenangabe/);
  });
  it('fasst Indizes lesbar zusammen', () => {
    expect(rangeLabel([0, 1, 2, 4, 6, 7])).toBe('1–3, 5, 7–8');
    expect(rangeLabel([])).toBe('');
  });
});

describe('Dateinamen', () => {
  it('trennt Endungen ab, auch bei Punkten im Namen', () => {
    expect(baseName('Bericht v1.2.pdf')).toBe('Bericht v1.2');
    expect(extOf('Scan.JPEG')).toBe('jpeg');
    expect(withExt('Brief.docx', 'pdf')).toBe('Brief.pdf');
  });
  it('lässt Namen ohne echte Endung unverändert', () => {
    expect(baseName('Protokoll 2026.10')).toBe('Protokoll 2026.10');
    expect(baseName('Version 1.2')).toBe('Version 1.2');
    expect(extOf('Version 1.2')).toBe('');
  });
});

describe('Papierformate', () => {
  it('erkennt A4 hoch und quer sowie Letter', () => {
    expect(paperName(210 * MM, 297 * MM)).toBe('A4');
    expect(paperName(297 * MM, 210 * MM)).toBe('A4 quer');
    expect(paperName(612, 792)).toBe('Letter');
    expect(paperName(500, 500)).toBe('');
  });
});

describe('Farben und Bytes', () => {
  it('wandelt sechs- und dreistellige Hex-Farben um', () => {
    expect(hexToRgb01('#ff0000')).toEqual([1, 0, 0]);
    expect(hexToRgb01('#fff')).toEqual([1, 1, 1]);
    expect(hexToRgb01('0a6cff')[2]).toBe(1);
  });
  it('formatiert Größen deutsch', () => {
    expect(fmtSize(512)).toBe('512 B');
    expect(fmtSize(2048)).toBe('2 KB');
    expect(fmtSize(5.5 * 1048576)).toBe('5,5 MB');
  });
  it('erkennt PDFs am Kopf und übersteht große Data-URLs', () => {
    expect(isPdf(new TextEncoder().encode('%PDF-1.7'))).toBe(true);
    expect(isPdf(new TextEncoder().encode('PK..'))).toBe(false);
    const big = new Uint8Array(300_000).map((_, i) => i % 256);
    expect(dataUrlToBytes(bytesToDataUrl(big, 'application/octet-stream'))).toEqual(big);
  });
});
