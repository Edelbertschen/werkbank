// Werkzeuge gegen den Korpus schwieriger PDFs (tests/fixtures, erzeugt mit scripts/make-corpus.py)
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadDoc, run, texts, textBoxes, pageInfo } from './helpers';
import { addItem, applyOverlay } from '../../src/lib/overlay.svelte';

const fx = (n: string) => new Uint8Array(readFileSync(`tests/fixtures/${n}`));
const PDFS = ['text.pdf', 'rotated.pdf', 'mixed-sizes.pdf', 'form.pdf', 'annotated.pdf', 'scan.pdf', 'damaged.pdf', 'long.pdf', 'outline.pdf', 'offset-box.pdf', 'unicode.pdf'];

describe.each(PDFS)('%s', name => {
  it('lässt sich öffnen', async () => {
    const doc = await loadDoc(fx(name), name);
    expect(doc.numPages).toBeGreaterThan(0);
  });
  it.each(['rotate-right', 'duplicate', 'reverse', 'page-numbers', 'header-footer', 'bates', 'watermark', 'crop', 'resize', 'nup', 'booklet', 'insert-blank'])('übersteht %s', async id => {
    const doc = await loadDoc(fx(name), name);
    // Automatisches Zuschneiden rendert die Seite (Canvas) – das prüft der Oberflächentest
    const r = await run(id, doc, id === 'crop' ? { mode: 'mm', m: { t: 10, r: 10, b: 10, l: 10 } } : id === 'watermark' ? { text: 'ENTWURF' } : id === 'header-footer' ? { header: 'Kopf {n}', footer: 'Fuß' } : {});
    const out = r.bytes || r.doc?.bytes;
    expect(out, 'kein Ergebnis').toBeTruthy();
    expect((await pageInfo(out!)).length).toBeGreaterThan(0);
  });
});

describe('Geometrie bei versetzter Seitenbox', () => {
  it('setzt die Seitenzahl in den sichtbaren Bereich unten mittig', async () => {
    const doc = await loadDoc(fx('offset-box.pdf'));
    const r = await run('page-numbers', doc, { pos: 'bc', fmt: '{n}' });
    const n = (await textBoxes(r.bytes!, 0)).find(b => b.str.trim() === '1');
    expect(n, 'Seitenzahl nicht sichtbar').toBeTruthy();
    expect(n!.y).toBeGreaterThan(0.85); expect(n!.y).toBeLessThan(1);
    expect(n!.x).toBeGreaterThan(0.35); expect(n!.x).toBeLessThan(0.65);
  });
  it('platziert eingefügten Text dort, wo er gezeichnet wurde', async () => {
    const doc = await loadDoc(fx('offset-box.pdf'));
    addItem(doc, { page: 0, kind: 'text', x: 0.5, y: 0.5, w: 0.4, text: 'Mitte', size: 12, color: '#000000', bold: false } as any);
    await applyOverlay(doc);
    const b = (await textBoxes(doc.bytes, 0)).find(t => t.str.includes('Mitte'));
    expect(b, 'Text fehlt').toBeTruthy();
    expect(b!.x).toBeGreaterThan(0.45); expect(b!.x).toBeLessThan(0.6);
    expect(b!.y).toBeGreaterThan(0.48); expect(b!.y).toBeLessThan(0.58);
  });
  it('zeichnet das Wasserzeichen sichtbar auf die Seite', async () => {
    const doc = await loadDoc(fx('offset-box.pdf'));
    const r = await run('watermark', doc, { text: 'ENTWURF' });
    const b = (await textBoxes(r.bytes!, 0)).find(t => t.str.includes('ENTWURF'));
    expect(b).toBeTruthy();
    expect(b!.x).toBeGreaterThan(0); expect(b!.x).toBeLessThan(1);
    expect(b!.y).toBeGreaterThan(0); expect(b!.y).toBeLessThan(1);
  });
});

describe('Inhalte bleiben erhalten', () => {
  it('behält Formularfelder beim Drehen', async () => {
    const doc = await loadDoc(fx('form.pdf'));
    const r = await run('rotate-right', doc);
    const { PDFDocument } = await import('pdf-lib');
    expect((await PDFDocument.load(r.bytes!)).getForm().getFields().map(f => f.getName()).sort()).toEqual(['Baumart', 'Eilig', 'Name', 'Revier']);
  });
  it('behält Lesezeichen beim Seitenzahlen-Setzen', async () => {
    const doc = await loadDoc(fx('outline.pdf'));
    const r = await run('page-numbers', doc);
    const nd = await loadDoc(r.bytes!);
    const outline = await nd.pdf!.getOutline();
    expect(outline.map((o: any) => o.title)).toEqual(['Einleitung', 'Methoden', 'Ergebnisse', 'Anhang']);
  });
  it('liest den Text der beschädigten Datei', async () => {
    const doc = await loadDoc(fx('damaged.pdf'));
    expect((await texts(doc.bytes))[0]).toContain('Kapitel 1');
  });
  it('setzt Seitenzahlen im 120-Seiten-Dokument zügig', async () => {
    const doc = await loadDoc(fx('long.pdf'));
    const t0 = Date.now();
    const r = await run('page-numbers', doc, { fmt: '{n} / {N}' });
    expect(Date.now() - t0).toBeLessThan(5000);
    expect((await texts(r.bytes!))[119]).toContain('120 / 120');
  });
});

describe('Verschlüsselung erkennen', () => {
  it.each([['encrypted.pdf', true], ['restricted.pdf', true], ['text.pdf', false], ['damaged.pdf', false]])('%s → %s', async (n, exp) => {
    const { isEncryptedPdf } = await import('../../src/lib/ops');
    expect(await isEncryptedPdf(fx(n))).toBe(exp);
  });
});
