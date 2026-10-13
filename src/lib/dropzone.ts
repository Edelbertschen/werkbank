// Einfügeposition beim Ablegen von Dateien zwischen Seitenminiaturen.
// Container markieren sich mit data-drop-insert="vertical" (Seitenleiste) oder "grid" (Organisieren);
// ihre Kinder mit role="option" sind die Seiten.

export interface Box { left: number; top: number; right: number; bottom: number }
export type Layout = 'vertical' | 'grid';

/** Anzahl der Seiten, die vor dem Mauszeiger liegen = Einfügeindex */
export function insertionIndex(boxes: Box[], x: number, y: number, layout: Layout): number {
  if (layout === 'vertical') return boxes.filter(b => (b.top + b.bottom) / 2 < y).length;
  return boxes.filter(b => y > b.bottom || (y >= b.top && x > (b.left + b.right) / 2)).length;
}

export interface DropTarget { at: number; layout: Layout; line: { x: number; y: number; w: number; h: number } }

/** Ziel unter dem Mauszeiger (Bildschirmkoordinaten in CSS-Pixeln) oder null */
export function dropTargetAt(x: number, y: number): DropTarget | null {
  const host = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop-insert]');
  if (!host) return null;
  const layout = (host.dataset.dropInsert === 'grid' ? 'grid' : 'vertical') as Layout;
  const rects = [...host.querySelectorAll<HTMLElement>(':scope > [role="option"]')].map(e => e.getBoundingClientRect());
  const at = insertionIndex(rects, x, y, layout);
  const c = host.getBoundingClientRect();
  const n = rects.length, gap = 5;
  if (!n) return { at: 0, layout, line: { x: c.left + 8, y: c.top + 8, w: c.width - 16, h: 0 } };
  const prev = rects[at - 1], next = rects[at];
  if (layout === 'vertical') {
    const ly = prev && next ? (prev.bottom + next.top) / 2 : next ? next.top - gap : prev.bottom + gap;
    return { at, layout, line: { x: c.left + 10, y: ly, w: c.width - 20, h: 0 } };
  }
  // Raster: senkrechte Linie in der Mitte des Zwischenraums; am Reihenende hinter der vorigen Seite
  const sameRow = prev && next && Math.abs(prev.top - next.top) < 2;
  if (sameRow) return { at, layout, line: { x: (prev.right + next.left) / 2, y: prev.top, w: 0, h: prev.height } };
  const afterPrev = prev && (!next || y <= prev.bottom);
  const r = afterPrev ? prev : next;
  return { at, layout, line: { x: afterPrev ? r.right + gap * 2 : r.left - gap * 2, y: r.top, w: 0, h: r.height } };
}
