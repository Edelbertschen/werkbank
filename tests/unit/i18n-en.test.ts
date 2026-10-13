// Englische Oberfläche: Werkzeuge, Bandleiste und Suche – mit dem echten Wörterbuch.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { setLocale } from '../../src/lib/i18n';
import en from '../../src/lib/i18n/en';

// Hinweis: Werkzeuge und Bandleiste übersetzen sich beim Laden des Moduls.
// Deshalb wird die Sprache vor dem dynamischen Import gesetzt.
let TOOLS: any[], RIBBON: any[], searchTools: (q: string) => any[];
beforeAll(async () => {
  vi.resetModules();
  const i18n = await import('../../src/lib/i18n');
  i18n.setLocale('en', en);
  ({ TOOLS } = await import('../../src/lib/tools'));
  ({ RIBBON } = await import('../../src/lib/ribbon'));
  ({ searchTools } = await import('../../src/lib/search'));
});

const GERMAN = /[äöüÄÖÜß„]|\b(und|oder|der|die|das|mit|für|nicht|Seite|Seiten|Datei|Dateien|Dokument|wird|werden)\b/;

describe('Englische Oberfläche', () => {
  it('jede Übersetzung behält die Platzhalter des Originals', () => {
    for (const [de, tr] of Object.entries(en)) {
      const ph = (s: string) => (s.match(/\{\d+\}/g) || []).sort().join();
      expect(ph(tr), de).toBe(ph(de));
    }
  });
  it('Werkzeuge sind vollständig englisch beschriftet', () => {
    const offenders: string[] = [];
    for (const t of TOOLS) {
      for (const s of [t.label, t.short, t.desc, t.action, ...(t.fields || []).flatMap((f: any) => [f.label, f.hint, f.ph, ...(f.opts || []).map((o: any) => o[1])])]) {
        if (typeof s === 'string' && GERMAN.test(s)) offenders.push(`${t.id}: ${s}`);
      }
    }
    expect(offenders).toEqual([]);
  });
  it('Bandleiste ist englisch', () => {
    const labels = RIBBON.flatMap((t: any) => [t.label, ...t.groups.map((g: any) => g.label)]);
    expect(labels.filter((l: string) => GERMAN.test(l))).toEqual([]);
    expect(labels).toContain('Pages');
  });
  it.each([['compress', 'compress'], ['make smaller', 'compress'], ['merge files', 'merge'], ['pdf to word', 'to-word'], ['redact', 'redact'], ['rotate', 'rotate-right'], ['page numbers', 'page-numbers'], ['sign', 'sign'], ['password', 'protect'], ['ocr', 'ocr']])('Suche „%s“ findet %s', (q, id) => {
    expect(searchTools(q).slice(0, 3).map(t => t.id)).toContain(id);
  });
});

describe('Quelltext', () => {
  it('enthält keine deutschen Oberflächentexte außerhalb des Wörterbuchs', () => {
    const r = require('node:child_process').spawnSync('node', ['scripts/i18n.mjs', 'check'], { encoding: 'utf8' });
    expect(r.stdout.trim().split('\n').slice(-1)[0]).toBe('Alle Texte übersetzt');
  });
});
