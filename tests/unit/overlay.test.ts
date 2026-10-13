import { describe, it, expect } from 'vitest';
import { makePdf, loadDoc, textBoxes, texts } from './helpers';
import { addItem, removeItem, itemsOf } from '../../src/lib/overlay.svelte';

describe('Eingefügter Text landet dort, wo er auf dem Bildschirm stand', () => {
  for (const rot of [0, 90, 180, 270]) {
    it(`oben links auf einer um ${rot}° gedrehten Seite`, async () => {
      const doc = await loadDoc(await makePdf([{ rot }]));
      addItem(doc, { page: 0, kind: 'text', x: 0.1, y: 0.1, w: 0.5, text: 'Hallo Werkbank', size: 14, color: '#000000', bold: false } as any);
      const b = (await textBoxes(await doc.baked(), 0)).find(t => t.str.includes('Hallo'));
      expect(b, 'Text fehlt').toBeTruthy();
      expect(b!.x).toBeGreaterThan(0.05); expect(b!.x).toBeLessThan(0.2);
      expect(b!.y).toBeGreaterThan(0.08); expect(b!.y).toBeLessThan(0.2);
    });
  }
});

describe('Elemente im Verlauf (ohne Übernehmen)', () => {
  it('jedes Element ist sofort ein Stand; die Bytes bleiben, eingeschrieben wird beim Speichern', async () => {
    const doc = await loadDoc(await makePdf(1));
    const base = doc.bytes;
    addItem(doc, { page: 0, kind: 'text', x: 0.1, y: 0.5, w: 0.5, text: 'Eins', size: 12, color: '#000000', bold: false } as any);
    addItem(doc, { page: 0, kind: 'text', x: 0.1, y: 0.6, w: 0.5, text: 'Zwei', size: 12, color: '#000000', bold: true } as any);
    expect(doc.versions().map(v => v.label)).toEqual(['Geöffnet', 'Text eingefügt', 'Text eingefügt']);
    expect(doc.bytes).toBe(base);
    expect(doc.dirty).toBe(true);
    expect((await texts(await doc.baked()))[0]).toMatch(/Eins.*Zwei/);
  });
  it('Rückgängig und Wiederholen stellen die Elemente wieder her', async () => {
    const doc = await loadDoc(await makePdf(1));
    addItem(doc, { page: 0, kind: 'rect', x: 0.1, y: 0.1, w: 0.2, h: 0.1, stroke: '#ff0000', fill: 'transparent', width: 1, opacity: 1 } as any);
    const id = itemsOf(doc)[0].id;
    removeItem(doc, id);
    expect(itemsOf(doc)).toHaveLength(0);
    await doc.undo();
    expect(itemsOf(doc).map(i => i.id)).toEqual([id]);
    await doc.undo();
    expect(itemsOf(doc)).toHaveLength(0);
    expect(doc.dirty).toBe(false);
    await doc.redo();
    expect(itemsOf(doc)).toHaveLength(1);
    expect(doc.versions().map(v => v.label)).toEqual(['Geöffnet', 'Rechteck eingefügt', 'Rechteck entfernt']);
  });
  it('Rückgängig liefert Kopien: spätere Änderungen verändern den Verlauf nicht', async () => {
    const doc = await loadDoc(await makePdf(1));
    addItem(doc, { page: 0, kind: 'rect', x: 0.1, y: 0.1, w: 0.2, h: 0.1, stroke: '#ff0000', fill: 'transparent', width: 1, opacity: 1 } as any);
    (itemsOf(doc)[0] as any).x = 0.5;
    expect((doc.history[1].objects[0] as any).x).toBe(0.1);
  });
  it('leere Textfelder ergeben keinen Stand', async () => {
    const doc = await loadDoc(await makePdf(1));
    addItem(doc, { page: 0, kind: 'text', x: 0.1, y: 0.5, w: 0.5, text: '   ', size: 12, color: '#000000', bold: false } as any);
    expect(doc.versions().length).toBe(1);
  });
  it('ein Werkzeug-Stand schreibt die Elemente ein und leert die Elementliste', async () => {
    const doc = await loadDoc(await makePdf(1));
    addItem(doc, { page: 0, kind: 'text', x: 0.1, y: 0.5, w: 0.5, text: 'Bleibt', size: 12, color: '#000000', bold: false } as any);
    await doc.commit(await doc.baked(), 'Werkzeug');
    expect(itemsOf(doc)).toHaveLength(0);
    expect((await texts(doc.bytes))[0]).toContain('Bleibt');
    await doc.undo();
    expect(itemsOf(doc)).toHaveLength(1);
  });
  it('setzt Umlaute und Sonderzeichen korrekt', async () => {
    const doc = await loadDoc(await makePdf(1));
    addItem(doc, { page: 0, kind: 'text', x: 0.1, y: 0.5, w: 0.8, text: 'Grüße aus Öhringen – 25 € für Maß', size: 12, color: '#000000', bold: false } as any);
    expect((await texts(await doc.baked()))[0]).toContain('Grüße aus Öhringen – 25 € für Maß');
  });
  it('setzt auch osteuropäische Zeichen (eingebettete Schrift statt Helvetica)', async () => {
    const doc = await loadDoc(await makePdf(1));
    addItem(doc, { page: 0, kind: 'text', x: 0.1, y: 0.5, w: 0.8, text: 'Łódź, Šumava, Ősz', size: 12, color: '#000000', bold: false } as any);
    expect((await texts(await doc.baked()))[0]).toContain('Łódź, Šumava, Ősz');
  });
  it('bricht lange Texte innerhalb der Breite um', async () => {
    const doc = await loadDoc(await makePdf(1));
    const long = 'Dies ist ein langer Satz, der garantiert nicht in eine schmale Spalte passt und deshalb umbrechen muss.';
    addItem(doc, { page: 0, kind: 'text', x: 0.1, y: 0.4, w: 0.25, text: long, size: 12, color: '#000000', bold: false } as any);
    const parts = (await textBoxes(await doc.baked(), 0)).filter(t => !t.str.startsWith('Seite'));
    expect(new Set(parts.map(p => p.y.toFixed(3))).size).toBeGreaterThan(2);
    expect(Math.max(...parts.map(p => p.x))).toBeLessThan(0.36);
  });
});
