import { describe, it, expect } from 'vitest';
import { makePdf, loadDoc, textBoxes, texts } from './helpers';
import { addItem, applyOverlay, itemsOf } from '../../src/lib/overlay.svelte';

describe('Eingefügter Text landet dort, wo er auf dem Bildschirm stand', () => {
  for (const rot of [0, 90, 180, 270]) {
    it(`oben links auf einer um ${rot}° gedrehten Seite`, async () => {
      const doc = await loadDoc(await makePdf([{ rot }]));
      addItem(doc, { page: 0, kind: 'text', x: 0.1, y: 0.1, w: 0.5, text: 'Hallo Werkbank', size: 14, color: '#000000', bold: false } as any);
      await applyOverlay(doc);
      const b = (await textBoxes(doc.bytes, 0)).find(t => t.str.includes('Hallo'));
      expect(b, 'Text fehlt').toBeTruthy();
      expect(b!.x).toBeGreaterThan(0.05); expect(b!.x).toBeLessThan(0.2);
      expect(b!.y).toBeGreaterThan(0.08); expect(b!.y).toBeLessThan(0.2);
    });
  }
});

describe('Übernehmen', () => {
  it('schreibt alle offenen Elemente in einen einzigen neuen Stand', async () => {
    const doc = await loadDoc(await makePdf(1));
    addItem(doc, { page: 0, kind: 'text', x: 0.1, y: 0.5, w: 0.5, text: 'Eins', size: 12, color: '#000000', bold: false } as any);
    addItem(doc, { page: 0, kind: 'text', x: 0.1, y: 0.6, w: 0.5, text: 'Zwei', size: 12, color: '#000000', bold: true } as any);
    await applyOverlay(doc);
    expect(doc.versions().length).toBe(2);
    expect(itemsOf(doc).length).toBe(0);
    expect((await texts(doc.bytes))[0]).toMatch(/Eins.*Zwei/);
  });
  it('ignoriert leere Textfelder', async () => {
    const doc = await loadDoc(await makePdf(1));
    addItem(doc, { page: 0, kind: 'text', x: 0.1, y: 0.5, w: 0.5, text: '   ', size: 12, color: '#000000', bold: false } as any);
    await applyOverlay(doc);
    expect(doc.versions().length).toBe(1);
  });
  it('setzt Umlaute und Sonderzeichen korrekt', async () => {
    const doc = await loadDoc(await makePdf(1));
    addItem(doc, { page: 0, kind: 'text', x: 0.1, y: 0.5, w: 0.8, text: 'Grüße aus Öhringen – 25 € für Maß', size: 12, color: '#000000', bold: false } as any);
    await applyOverlay(doc);
    expect((await texts(doc.bytes))[0]).toContain('Grüße aus Öhringen – 25 € für Maß');
  });
  it('setzt auch osteuropäische Zeichen (eingebettete Schrift statt Helvetica)', async () => {
    const doc = await loadDoc(await makePdf(1));
    addItem(doc, { page: 0, kind: 'text', x: 0.1, y: 0.5, w: 0.8, text: 'Łódź, Šumava, Ősz', size: 12, color: '#000000', bold: false } as any);
    await applyOverlay(doc);
    expect((await texts(doc.bytes))[0]).toContain('Łódź, Šumava, Ősz');
  });
  it('bricht lange Texte innerhalb der Breite um', async () => {
    const doc = await loadDoc(await makePdf(1));
    const long = 'Dies ist ein langer Satz, der garantiert nicht in eine schmale Spalte passt und deshalb umbrechen muss.';
    addItem(doc, { page: 0, kind: 'text', x: 0.1, y: 0.4, w: 0.25, text: long, size: 12, color: '#000000', bold: false } as any);
    await applyOverlay(doc);
    const parts = (await textBoxes(doc.bytes, 0)).filter(t => !t.str.startsWith('Seite'));
    expect(new Set(parts.map(p => p.y.toFixed(3))).size).toBeGreaterThan(2);
    expect(Math.max(...parts.map(p => p.x))).toBeLessThan(0.36);
  });
});
