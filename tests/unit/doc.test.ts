import { describe, it, expect } from 'vitest';
import { makePdf, loadDoc, texts } from './helpers';

describe('Versionsverlauf eines Dokuments', () => {
  it('ist nach dem Öffnen unverändert und ohne Rückgängig', async () => {
    const doc = await loadDoc(await makePdf(2));
    expect(doc.dirty).toBe(false);
    expect(doc.canUndo).toBe(false);
    expect(doc.numPages).toBe(2);
  });
  it('macht Änderungen rückgängig und wiederholt sie', async () => {
    const doc = await loadDoc(await makePdf(1));
    await doc.commit(await makePdf(2), 'Seite eingefügt');
    await doc.commit(await makePdf(3), 'Noch eine');
    expect(doc.numPages).toBe(3);
    expect(await doc.undo()).toBe('Noch eine');
    expect(doc.numPages).toBe(2);
    expect(await doc.undo()).toBe('Seite eingefügt');
    expect(doc.numPages).toBe(1);
    expect(doc.dirty).toBe(false);
    expect(await doc.redo()).toBe('Seite eingefügt');
    expect(doc.numPages).toBe(2);
    expect(doc.dirty).toBe(true);
  });
  it('verwirft den Wiederholen-Zweig nach einer neuen Änderung', async () => {
    const doc = await loadDoc(await makePdf(1));
    await doc.commit(await makePdf(2), 'A');
    await doc.undo();
    await doc.commit(await makePdf(5), 'B');
    expect(doc.canRedo).toBe(false);
    expect(doc.versions().map(v => v.label)).toEqual(['Geöffnet', 'B']);
  });
  it('merkt sich den gespeicherten Stand', async () => {
    const doc = await loadDoc(await makePdf(1));
    await doc.commit(await makePdf(2), 'A');
    doc.markSaved('/tmp/x.pdf');
    expect(doc.dirty).toBe(false);
    await doc.undo();
    expect(doc.dirty).toBe(true);
    await doc.redo();
    expect(doc.dirty).toBe(false);
  });
  it('begrenzt den Verlauf, ohne den aktuellen Stand zu verlieren', async () => {
    const doc = await loadDoc(await makePdf(1));
    for (let i = 0; i < 40; i++) await doc.commit(await makePdf(1 + (i % 3)), `Schritt ${i}`);
    expect(doc.versions().length).toBeLessThanOrEqual(30);
    expect(doc.versions().at(-1)!.label).toBe('Schritt 39');
    expect((await texts(doc.bytes)).length).toBe(1 + (39 % 3));
  });
  it('hält Aktuelle Seite und Auswahl im gültigen Bereich', async () => {
    const doc = await loadDoc(await makePdf(5));
    doc.current = 5; doc.selection = [3, 4];
    await doc.commit(await makePdf(2), 'gekürzt');
    expect(doc.current).toBe(2);
    expect(doc.selection).toEqual([]);
  });
});
