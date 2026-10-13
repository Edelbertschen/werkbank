import { describe, it, expect } from 'vitest';
import { RIBBON, visibleTabs, ESSENTIAL_HIDDEN, effectiveTab } from '../../src/lib/ribbon';
import { hasTool } from '../../src/lib/tools';

describe('Bandleiste', () => {
  it('verweist nur auf vorhandene Werkzeuge', () => {
    const missing: string[] = [];
    for (const t of RIBBON) for (const g of t.groups) for (const it of g.items) {
      const id = typeof it === 'string' ? it : 'id' in it ? it.id : '';
      if (id && !hasTool(id)) missing.push(`${t.id}/${id}`);
    }
    expect(missing).toEqual([]);
  });
  it('zeigt ohne Einstellung alle Registerkarten', () => {
    expect(visibleTabs([]).map(t => t.id)).toEqual(RIBBON.map(t => t.id));
  });
  it('blendet gewählte Registerkarten aus, Start bleibt immer', () => {
    expect(visibleTabs(['forms', 'analyze', 'start']).map(t => t.id)).toEqual(['start', 'pages', 'edit', 'comment', 'convert', 'optimize', 'protect', 'view']);
  });
  it('„Nur das Wichtigste“ lässt die Alltagskarten stehen', () => {
    const ids = visibleTabs(ESSENTIAL_HIDDEN).map(t => t.id);
    expect(ids).toEqual(expect.arrayContaining(['start', 'pages', 'edit', 'comment', 'convert', 'view']));
    expect(ids.length).toBeLessThan(RIBBON.length);
  });
  it('springt auf Start, wenn die aktive Karte ausgeblendet wird', () => {
    expect(effectiveTab('forms', ['forms'])).toBe('start');
    expect(effectiveTab('pages', ['forms'])).toBe('pages');
  });
});
