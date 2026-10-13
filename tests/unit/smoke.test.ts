import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { openPdf } from '../../src/lib/pdf';

describe('Testumgebung', () => {
  it('öffnet ein mit pdf-lib erzeugtes PDF über pdf.js', async () => {
    const d = await PDFDocument.create(); d.addPage([595, 842]); d.addPage([842, 595]);
    const pdf = await openPdf(await d.save());
    expect(pdf.numPages).toBe(2);
  });
});
