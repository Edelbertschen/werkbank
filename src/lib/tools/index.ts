// Verzeichnis aller Werkzeuge und Befehle
import type { Tool } from './types';
import { pageTools } from './pages';
import { editTools } from './edit';
import { convertTools } from './convert';
import { optimizeTools } from './optimize';
import { protectTools } from './protect';
import { analyzeTools } from './analyze';
import { appTools } from './app';

export const TOOLS: Tool[] = [...appTools, ...pageTools, ...editTools, ...convertTools, ...optimizeTools, ...protectTools, ...analyzeTools];
const byId = new Map(TOOLS.map(t => [t.id, t]));
export const tool = (id: string) => {
  const t = byId.get(id);
  if (!t) throw new Error('Unbekanntes Werkzeug ' + id);
  return t;
};
export const hasTool = (id: string) => byId.has(id);
export type { Tool };
