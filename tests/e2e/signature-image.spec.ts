// Unterschrift aus Bild: alle Formate, die Werkbank sonst als Bild einliest, lassen sich auch hier wählen und laden.
import { test, expect } from './app';

// Kleines Bild mit dunklem Strich auf Weiß im jeweiligen Format
const GIF = Buffer.from('R0lGODlhCAAIAPAAAAAAAP///yH5BAAAAAAALAAAAAAIAAgAAAIMhI8Qy+0Po5y02ohfADs=', 'base64');
function bmp() {
  const w = 8, h = 8, row = w * 3, size = 54 + row * h;
  const b = Buffer.alloc(size, 0);
  b.fill(0xff, 54); // weißer Grund
  b.write('BM', 0); b.writeUInt32LE(size, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(w, 18); b.writeInt32LE(h, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(row * h, 34);
  for (let x = 0; x < w; x++) b.fill(0, 54 + 3 * row + x * 3, 54 + 3 * row + x * 3 + 3); // schwarze Linie
  return b;
}
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60"><rect width="200" height="60" fill="#fff"/><path d="M10 40 C60 0 120 60 190 20" stroke="#1a3ea8" stroke-width="6" fill="none"/></svg>');

for (const [name, mimeType, buffer] of [['unterschrift.gif', 'image/gif', GIF], ['unterschrift.bmp', 'image/bmp', bmp()], ['unterschrift.svg', 'image/svg+xml', SVG]] as const) {
  test(`Unterschrift aus ${name.split('.').pop()!.toUpperCase()} laden`, async ({ app }) => {
    await app.open('text.pdf');
    await app.page.evaluate(() => { (window as any).__wb.app.palette = true; });
    await app.page.keyboard.type('Unterschreiben');
    await app.page.waitForTimeout(300);
    await app.page.keyboard.press('Enter');
    const dlg = app.page.locator('.dialog');
    await dlg.getByRole('tab', { name: 'Bild' }).click();
    const chooser = app.page.waitForEvent('filechooser');
    await dlg.getByRole('button', { name: 'Bild wählen …' }).click();
    const fc = await chooser;
    // Der Dateidialog bietet die Datei überhaupt an
    expect(await fc.element().getAttribute('accept')).toContain('.' + name.split('.').pop());
    await fc.setFiles({ name, mimeType, buffer });
    await expect(dlg.locator('.img img')).toBeVisible();
  });
}
