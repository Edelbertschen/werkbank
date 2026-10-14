import { describe, it, expect } from 'vitest';
import { makePdf, loadDoc, run, texts, pageInfo, textBoxes } from './helpers';

describe('Seiten drehen und löschen', () => {
  it('dreht nur die aktuelle Seite nach rechts', async () => {
    const doc = await loadDoc(await makePdf(3));
    const r = await run('rotate-right', doc, {}, { current: 1 });
    expect((await pageInfo(r.bytes!)).map(p => p.rot)).toEqual([0, 90, 0]);
  });
  it('dreht eine ausgewählte Mehrfachauswahl', async () => {
    const doc = await loadDoc(await makePdf(4));
    const r = await run('rotate-left', doc, {}, { selection: [0, 3] });
    expect((await pageInfo(r.bytes!)).map(p => p.rot)).toEqual([270, 0, 0, 270]);
  });
  it('löscht ausgewählte Seiten und behält die Reihenfolge der übrigen', async () => {
    const doc = await loadDoc(await makePdf(5));
    const r = await run('delete-pages', doc, {}, { selection: [1, 3] });
    expect(await texts(r.bytes!)).toEqual(['Seite 1', 'Seite 3', 'Seite 5']);
  });
  it('verweigert das Löschen aller Seiten', async () => {
    const doc = await loadDoc(await makePdf(2));
    await expect(run('delete-pages', doc, {}, { selection: [0, 1] })).rejects.toThrow();
  });
  it('löscht einen Seitenbereich', async () => {
    const doc = await loadDoc(await makePdf(6));
    const r = await run('delete-range', doc, { pages: { mode: 'range', range: '2-3, 6' } });
    expect(await texts(r.bytes!)).toEqual(['Seite 1', 'Seite 4', 'Seite 5']);
  });
});

describe('Seiten anordnen', () => {
  it('kehrt die Reihenfolge um', async () => {
    const doc = await loadDoc(await makePdf(3));
    const r = await run('reverse', doc);
    expect(await texts(r.bytes!)).toEqual(['Seite 3', 'Seite 2', 'Seite 1']);
  });
  it('dupliziert die aktuelle Seite direkt dahinter', async () => {
    const doc = await loadDoc(await makePdf(3));
    const r = await run('duplicate', doc, {}, { current: 1 });
    expect(await texts(r.bytes!)).toEqual(['Seite 1', 'Seite 2', 'Seite 2', 'Seite 3']);
  });
  it('fügt eine leere Seite im Format der Nachbarseite ein', async () => {
    const doc = await loadDoc(await makePdf([{ w: 842, h: 595 }, {}]));
    const r = await run('insert-blank', doc, {}, { current: 0 });
    const info = await pageInfo(r.bytes!);
    expect(info.length).toBe(3);
    expect(info[1]).toMatchObject({ w: 842, h: 595 });
  });
  it('mischt Vorder- und Rückseiten aus zwei Dokumenten', async () => {
    const doc = await loadDoc(await makePdf([{ text: 'V1' }, { text: 'V2' }]));
    const back = { id: 'x', name: 'r.pdf', bytes: await makePdf([{ text: 'R2' }, { text: 'R1' }]) };
    const r = await run('alternate', doc, { src: back });
    expect(await texts(r.bytes!)).toEqual(['V1', 'R1', 'V2', 'R2']);
  });
  it('mischt einen Duplex-Scan, der in einem Dokument liegt', async () => {
    const doc = await loadDoc(await makePdf([{ text: 'V1' }, { text: 'V2' }, { text: 'V3' }, { text: 'R3' }, { text: 'R2' }, { text: 'R1' }]));
    const r = await run('alternate', doc);
    expect(await texts(r.bytes!)).toEqual(['V1', 'R1', 'V2', 'R2', 'V3', 'R3']);
  });
});

describe('Teilen', () => {
});

// Extrahieren und Aufteilen laufen über PyMuPDF (Links, Felder, Ebenen bleiben): geprüft in tests/e2e/preserve.spec.ts

describe('Kennzeichnen auf gedrehten Seiten', () => {
  // Seitenzahlen müssen in der Anzeige unten stehen – auch wenn die Seite intern gedreht ist.
  for (const rot of [0, 90, 180, 270]) {
    it(`setzt die Seitenzahl unten mittig bei ${rot}°`, async () => {
      const doc = await loadDoc(await makePdf([{ rot }, { rot }]));
      const r = await run('page-numbers', doc, { pos: 'bc', fmt: '{n}' });
      const boxes = await textBoxes(r.bytes!, 0);
      const num = boxes.find(b => b.str.trim() === '1');
      expect(num, JSON.stringify(boxes)).toBeTruthy();
      expect(num!.y).toBeGreaterThan(0.85);
      expect(num!.x).toBeGreaterThan(0.35);
      expect(num!.x).toBeLessThan(0.65);
    });
  }
  it('schreibt einen Text-Wasserzeichen auf jede Seite', async () => {
    const doc = await loadDoc(await makePdf(2));
    const r = await run('watermark', doc, { kind: 'text', text: 'ENTWURF' });
    expect((await texts(r.bytes!)).every(t => t.includes('ENTWURF'))).toBe(true);
  });
});

describe('Layout', () => {
  it('setzt 2 Seiten pro Blatt auf A4 quer', async () => {
    const doc = await loadDoc(await makePdf(4));
    const r = await run('nup', doc, { n: '2' });
    const out = (r.bytes || r.doc?.bytes)!;
    const info = await pageInfo(out);
    expect(info.length).toBe(2);
    expect(info[0].w).toBeGreaterThan(info[0].h);
  });
  it('ordnet eine Broschüre so, dass gefaltet die Reihenfolge stimmt', async () => {
    const doc = await loadDoc(await makePdf(8));
    const r = await run('booklet', doc);
    const out = (r.bytes || r.doc?.bytes)!;
    expect((await pageInfo(out)).length).toBe(4);
    const t = await texts(out);
    expect(t[0]).toMatch(/Seite 8.*Seite 1|Seite 1.*Seite 8/);
  });
});

describe('Zuschneiden folgt der Anzeige', () => {
  for (const rot of [0, 90, 180, 270]) {
    it(`schneidet oben ab, was oben zu sehen ist (${rot}°)`, async () => {
      const doc = await loadDoc(await makePdf([{ rot }]));
      const before = (await textBoxes(doc.bytes, 0)).find(b => b.str === 'Seite 1')!;
      const r = await run('crop', doc, { mode: 'mm', m: { t: 20, r: 0, b: 0, l: 0 } });
      const after = (await textBoxes(r.bytes!, 0)).find(b => b.str === 'Seite 1')!;
      const info = (await pageInfo(r.bytes!))[0];
      // Die Anzeige wird um 20 mm niedriger; Inhalt rückt in der Anzeige nach oben
      const dispH = rot % 180 ? 595 : 842;
      expect(Math.round((rot % 180 ? info.w : info.h))).toBeLessThan(dispH);
      expect(after.y * (dispH - 20 * 72 / 25.4)).toBeCloseTo(before.y * dispH - 20 * 72 / 25.4, 0);
    });
  }
});
