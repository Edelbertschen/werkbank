// Signaturinhalt aus dem Platzhalter lösen: Nullen der Auffüllung weg, Nullbytes der Signatur selbst bleiben
import { describe, it, expect } from 'vitest';
import { extractSignatures } from '../../src/lib/vendor/validate-signature';

const pdf = (hex: string) => new TextEncoder().encode(`1 0 obj << /Type /Sig /ByteRange [0 10 30 5] /Contents <${hex}> >> endobj`);

describe('Signatur auslesen', () => {
  it('DER, das auf 0x00 endet, wird nicht abgeschnitten', () => {
    const s = extractSignatures(pdf('3005020100' + '0400' + '00000000'));
    expect(Array.from(s[0].contents)).toEqual([0x30, 0x05, 0x02, 0x01, 0x00, 0x04, 0x00]);
  });
  it('lange Längenangabe (0x82) wird gelesen', () => {
    const body = '04820100' + '00'.repeat(0x100);
    const s = extractSignatures(pdf('30820104' + body + '0000'));
    expect(s[0].contents.length).toBe(4 + 0x104);
  });
});
