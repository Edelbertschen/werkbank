// Bilddateien einlesen – gemeinsam für „Bild einfügen“ und Unterschrift aus Bild

/** Dateiendungen, die Werkbank als Bild einlesen kann */
export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'heic', 'heif'];

/** Bild dekodieren (Drehung aus EXIF, HEIC, SVG) – liefert etwas, das sich auf einen Canvas zeichnen lässt */
export async function decodeImage(bytes: Uint8Array, name: string): Promise<{ img: ImageBitmap | HTMLImageElement; width: number; height: number }> {
  let blob = new Blob([bytes as BlobPart]);
  if (/\.(heic|heif)$/i.test(name)) { const h = (await import('heic2any')).default as any; const r = await h({ blob, toType: 'image/jpeg', quality: 0.92 }); blob = Array.isArray(r) ? r[0] : r; }
  if (/\.svg$/i.test(name)) blob = new Blob([bytes as BlobPart], { type: 'image/svg+xml' });
  let img: any;
  try { img = await createImageBitmap(blob, { imageOrientation: 'from-image' } as any); }
  catch { const u = URL.createObjectURL(blob); img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = u; }); }
  return { img, width: img.width, height: img.height };
}
