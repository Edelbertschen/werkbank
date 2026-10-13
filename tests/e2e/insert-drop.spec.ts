// Dateien aus dem Finder/Explorer zwischen die Seiten ziehen – Seitenleiste und Organisieren.
import { test, expect, FX } from './app';
import { readFileSync } from 'node:fs';

const label = (t: string) => t.match(/Kapitel \d|Format [^ ]+|Antrag/)?.[0];

/** Ziehen einer Datei von außen nachstellen: dragenter/dragover an Position, dann drop */
async function dropFile(page: any, name: string, x: number, y: number, phase: 'over' | 'drop' = 'drop') {
  const b64 = readFileSync(FX(name)).toString('base64');
  await page.evaluate(([n, d, x, y, phase]: any) => {
    const bytes = Uint8Array.from(atob(d), c => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], n, { type: 'application/pdf' }));
    const at = document.elementFromPoint(x, y) || document.body;
    const fire = (type: string) => at.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer: dt }));
    fire('dragenter'); fire('dragover');
    if (phase === 'drop') fire('drop');
  }, [name, b64, x, y, phase]);
}

test('Seitenleiste: PDF zwischen Seite 1 und 2 ablegen', async ({ app }) => {
  await app.open('outline.pdf');
  const items = app.page.locator('.thumbs .item');
  const b = (await items.nth(1).boundingBox())!;
  // Während des Ziehens: Einfügelinie statt „Zum Öffnen loslassen“
  await dropFile(app.page, 'mixed-sizes.pdf', b.x + b.width / 2, b.y + 4, 'over');
  await expect(app.page.locator('.insert-line')).toBeVisible();
  await expect(app.page.locator('.drop-veil')).toHaveCount(0);
  await dropFile(app.page, 'mixed-sizes.pdf', b.x + b.width / 2, b.y + 4);
  await app.idle();
  await expect(app.page.locator('.insert-line')).toHaveCount(0);
  const info = (await app.docInfo())!;
  expect(info.docs).toBe(1); // nicht als eigenes Dokument geöffnet
  expect(info.texts.map(label)).toEqual(['Kapitel 1', 'Format A4', 'Format A5', 'Format Letter', 'Format A3', 'Kapitel 2', 'Kapitel 3', 'Kapitel 4', 'Kapitel 5']);
  expect(info.history.at(-1)).toBe('4 Seite(n) eingefügt');
});

test('Organisieren: PDF vor der ersten Seite ablegen', async ({ app }) => {
  await app.open('outline.pdf');
  await app.page.keyboard.press('Control+Shift+o');
  const cells = app.page.locator('.org .cell');
  await expect(cells).toHaveCount(5);
  const b = (await cells.nth(0).boundingBox())!;
  await dropFile(app.page, 'form.pdf', b.x + 6, b.y + b.height / 2);
  await app.idle();
  const info = (await app.docInfo())!;
  expect(info.docs).toBe(1);
  expect(info.texts.map(label)).toEqual(['Antrag', 'Kapitel 1', 'Kapitel 2', 'Kapitel 3', 'Kapitel 4', 'Kapitel 5']);
  await expect(cells).toHaveCount(6);
});

test('außerhalb der Miniaturen öffnet eine abgelegte Datei weiterhin als neues Dokument', async ({ app }) => {
  await app.open('outline.pdf');
  const v = (await app.page.locator('.vc').boundingBox())!;
  await dropFile(app.page, 'form.pdf', v.x + v.width / 2, v.y + v.height / 2);
  await app.idle();
  const info = (await app.docInfo())!;
  expect(info.docs).toBe(2);
  expect(info.name).toBe('form.pdf');
});
