import { describe, it, expect } from 'vitest';
import { openPdf, isPdfDamage } from '../../src/lib/pdf';

// Nur echte Dateifehler sollen eine Reparatur auslösen und als „beschädigt“ gemeldet werden.
describe('Fehler beim Öffnen einordnen', () => {
  it('erkennt eine kaputte Datei als beschädigt', async () => {
    const junk = new TextEncoder().encode('Das ist keine PDF-Datei, nur Text.');
    const err = await openPdf(junk).then(() => null, e => e);
    expect(err).not.toBeNull();
    expect(isPdfDamage(err)).toBe(true);
  });
  it('hält Fehler im Umfeld nicht für einen Dateischaden', () => {
    expect(isPdfDamage(new Error('Setting up fake worker failed: "Failed to fetch".'))).toBe(false);
    expect(isPdfDamage(new TypeError('Failed to fetch'))).toBe(false);
    expect(isPdfDamage(null)).toBe(false);
  });
});
