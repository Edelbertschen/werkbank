// KI-Assistenten (MCP): Werkzeugaufrufe, die von außen über die Desktop-App hereinkommen.
// Die Tabelle der Werkzeuge (Namen, Beschreibungen, Parameter) steht in mcp-tools.json und wird
// auch vom Rust-Teil (werkbank mcp) gelesen. Jede Änderung ist ein eigener Stand im Verlauf;
// gespeichert wird nur auf ausdrücklichen Aufruf.
import TOOL_DEFS from './mcp-tools.json';
import { app, active } from './app.svelte';
import type { Doc } from './doc.svelte';
import { activate, openPaths, applyResult, outputBytes, undo as undoDoc, withBusy } from './actions';
import { TOOLS, tool as toolById } from './tools';
import { defaults, type Field } from './fields';
import { addItem } from './overlay.svelte';
import { pyRun } from './engines';
import { renderPage, canvasBlob } from './pdf';
import { parseRange } from './util';
import * as P from './platform';

export const MCP_TOOLS = TOOL_DEFS as { name: string; description: string; inputSchema: any }[];

export type McpContent = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string };
export interface McpResult { content: McpContent[]; isError?: boolean }

const text = (v: unknown): McpResult => ({ content: [{ type: 'text', text: typeof v === 'string' ? v : JSON.stringify(v, null, 1) }] });
class McpError extends Error {}

function docOf(args: any): Doc {
  const id = args?.document;
  const d = id ? app.docs.find(x => x.id === id || x.name === id) : active();
  if (!d) throw new McpError(id ? `No open document "${id}". Use list_documents.` : 'No document is open. Use open_document first.');
  if (d !== active()) activate(d);
  return d;
}
const pagesArg = (s: string | undefined, n: number) => (s ? parseRange(s, n) : [...Array(n).keys()]);

// Werkzeuge, die ohne Oberfläche sinnvoll laufen: kein Bereich, kein Modus, keine Dateiauswahl
const SKIP = new Set(['open', 'save', 'save-as', 'close', 'print', 'present', 'fullscreen', 'palette', 'settings', 'undo', 'redo', 'reopen-closed', 'read-mode', 'organize', 'night', 'rotate-view', 'find', 'new', 'history']);
const HEADLESS_FIELDS = new Set(['text', 'textarea', 'password', 'number', 'select', 'seg', 'check', 'color', 'range', 'pages', 'position', 'quad', 'note', 'heading']);
function headless(t: (typeof TOOLS)[number]) {
  return !!t.run && !t.mode && !t.panel && !t.loadPanel && !t.noDoc && !SKIP.has(t.id) && !t.id.startsWith('zoom') && !t.id.startsWith('tool-')
    && (t.fields || []).every(f => HEADLESS_FIELDS.has(f.type));
}
function fieldSchema(f: Field) {
  const s: any = { description: f.label || f.key };
  if (f.type === 'number' || f.type === 'range') { s.type = 'number'; if (f.min != null) s.minimum = f.min; if (f.max != null) s.maximum = f.max; }
  else if (f.type === 'check') s.type = 'boolean';
  else if (f.type === 'select' || f.type === 'seg') { s.type = 'string'; s.enum = (f.opts || []).map(o => o[0]); s.description += ' – ' + (f.opts || []).map(o => `${o[0]} = ${o[1]}`).join(', '); }
  else if (f.type === 'pages') { s.type = 'string'; s.description = 'Pages, e.g. "1-3, 7"; "all" for every page'; }
  else if (f.type === 'position') { s.type = 'string'; s.enum = ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br']; }
  else if (f.type === 'quad') s.type = 'object';
  else s.type = 'string';
  if (f.def !== undefined && f.type !== 'pages') s.default = f.def;
  return s;
}
export function headlessTools(query = '') {
  const q = query.trim().toLowerCase();
  return TOOLS.filter(headless).filter(t => !q || `${t.id} ${t.label} ${t.desc || ''} ${t.keys || ''}`.toLowerCase().includes(q)).map(t => ({
    tool: t.id, label: t.label, description: t.desc || '',
    parameters: Object.fromEntries((t.fields || []).filter(f => f.type !== 'note' && f.type !== 'heading').map(f => [f.key, fieldSchema(f)])),
  }));
}
function toolValues(t: (typeof TOOLS)[number], given: Record<string, any> = {}) {
  const v = defaults(t.fields);
  for (const f of t.fields || []) {
    if (!(f.key in given)) continue;
    const g = given[f.key];
    if (f.type === 'pages') v[f.key] = !g || g === 'all' ? { mode: 'all', range: '' } : { mode: 'range', range: String(g) };
    else if (f.type === 'number' || f.type === 'range') v[f.key] = Number(g);
    else if (f.type === 'check') v[f.key] = g === true || g === 'true';
    else v[f.key] = g;
  }
  return v;
}

const handlers: Record<string, (a: any) => Promise<McpResult>> = {
  async list_documents() {
    return text(app.docs.map(d => ({ id: d.id, name: d.name, pages: d.numPages, path: d.path, unsaved: d.dirty, active: d.id === app.activeId })));
  },
  async open_document(a) {
    if (!P.isTauri) throw new McpError('Opening files by path needs the Werkbank desktop app.');
    await openPaths([a.path]);
    const d = active();
    if (!d) throw new McpError(`Could not open ${a.path}`);
    return text({ id: d.id, name: d.name, pages: d.numPages });
  },
  async get_info(a) {
    const d = docOf(a);
    const r = await pyRun(`
d = open_in()
m = d.metadata or {}
json.dumps({'pages': d.page_count, 'sizes_pt': sorted({(round(p.rect.width), round(p.rect.height)) for p in d}), 'title': m.get('title', ''), 'author': m.get('author', ''),
  'form_fields': sum(1 for p in d for w in p.widgets()), 'attachments': d.embfile_names(), 'bookmarks': len(d.get_toc()), 'encrypted': d.is_encrypted})`, { files: { 'in.pdf': await d.baked() } });
    const { countSignatures } = await import('./sign');
    return text({ id: d.id, name: d.name, path: d.path, unsaved: d.dirty, ...JSON.parse(r.result), signatures: countSignatures(d.openedBytes) });
  },
  async get_text(a) {
    const d = docOf(a);
    const out: { page: number; text: string }[] = [];
    for (const i of pagesArg(a.pages, d.numPages)) {
      const tc = await (await d.pdf!.getPage(i + 1)).getTextContent();
      let s = ''; for (const it of tc.items as any[]) s += it.str + (it.hasEOL ? '\n' : ' ');
      out.push({ page: i + 1, text: s.replace(/[ \t]+\n/g, '\n').trim() });
    }
    return text(out.map(p => `--- Page ${p.page} ---\n${p.text}`).join('\n\n'));
  },
  async find_text(a) {
    const d = docOf(a);
    const q = String(a.query || '').toLowerCase();
    if (!q) throw new McpError('query is empty');
    const hits: { page: number; context: string }[] = [];
    for (let i = 1; i <= d.numPages && hits.length < 200; i++) {
      const tc = await (await d.pdf!.getPage(i)).getTextContent();
      const s = (tc.items as any[]).map(x => x.str).join(' ');
      let k = s.toLowerCase().indexOf(q);
      while (k >= 0 && hits.length < 200) { hits.push({ page: i, context: s.slice(Math.max(0, k - 40), k + q.length + 40) }); k = s.toLowerCase().indexOf(q, k + q.length); }
    }
    return text({ matches: hits.length, hits });
  },
  async render_page(a) {
    const d = docOf(a);
    const n = Number(a.page);
    if (!(n >= 1 && n <= d.numPages)) throw new McpError(`page must be 1–${d.numPages}`);
    const c = await renderPage(d.pdf!, n, { scale: Math.min(4, Math.max(0.3, Number(a.scale) || 1.5)) });
    const b = new Uint8Array(await (await canvasBlob(c, 'image/png')).arrayBuffer());
    let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000) as any);
    return { content: [{ type: 'image', data: btoa(s), mimeType: 'image/png' }] };
  },
  async add_comment(a) {
    const d = docOf(a);
    const type = a.type as 'highlight' | 'underline' | 'strike' | 'note';
    const color = a.color || (type === 'highlight' ? app.style.highlight : type === 'note' ? '#FFD60A' : app.style.stroke);
    // Fundstellen als Rechtecke in Anzeige-Koordinaten (0..1, gedreht wie angezeigt)
    let found: { page: number; rects: [number, number, number, number][] }[] = [];
    if (a.find) {
      const r = await pyRun(`
d = open_in()
out = []
only = ARGS.get('page')
for p in d:
    if only and p.number != only - 1: continue
    W, H = p.rect.width, p.rect.height
    rs = []
    for q in p.search_for(ARGS['find']):
        q = q * p.rotation_matrix
        rs.append([q.x0 / W, q.y0 / H, q.width / W, q.height / H])
    if rs: out.append({'page': p.number, 'rects': rs})
json.dumps(out)`, { files: { 'in.pdf': d.bytes }, vars: { find: String(a.find), page: a.page || null } });
      found = JSON.parse(r.result);
      if (!found.length) throw new McpError(`"${a.find}" was not found${a.page ? ' on page ' + a.page : ''}.`);
    }
    if (type === 'note') {
      const page = found[0]?.page ?? ((Number(a.page) || 1) - 1);
      const at = found[0]?.rects[0];
      addItem(d, { kind: 'note', page, x: at ? Math.min(0.95, at[0] + at[2] + 0.005) : 0.05, y: at ? at[1] : 0.05, w: 0.03, h: 0.03, text: a.text || '', color } as any);
      return text({ added: 'note', page: page + 1 });
    }
    if (!found.length) throw new McpError('find is required for highlight, underline and strike');
    for (const f of found) addItem(d, { kind: type, page: f.page, rects: f.rects, color, ...(a.text ? { contents: a.text } : {}) } as any);
    return text({ added: type, matches: found.reduce((n, f) => n + f.rects.length, 0), pages: found.map(f => f.page + 1) });
  },
  async list_form_fields(a) {
    const d = docOf(a);
    const r = await pyRun(`
d = open_in()
json.dumps([{'name': w.field_name, 'type': w.field_type_string, 'value': w.field_value, 'options': w.choice_values or None, 'page': p.number + 1} for p in d for w in p.widgets()])`, { files: { 'in.pdf': await d.baked() } });
    return text(JSON.parse(r.result));
  },
  async fill_form(a) {
    const d = docOf(a);
    const r = await pyRun(`
d = open_in()
vals = json.loads(ARGS['values'])
done, missing = [], set(vals)
for p in d:
    for w in p.widgets():
        if w.field_name not in vals: continue
        v = vals[w.field_name]
        if w.field_type in (pymupdf.PDF_WIDGET_TYPE_CHECKBOX, pymupdf.PDF_WIDGET_TYPE_RADIOBUTTON):
            w.field_value = w.on_state() if v in (True, 'true', 'yes', 'Yes', 1, 'on') else 'Off'
        else:
            w.field_value = str(v)
        w.update()
        done.append(w.field_name); missing.discard(w.field_name)
save_out(d)
json.dumps({'filled': sorted(set(done)), 'unknown': sorted(missing)})`, { files: { 'in.pdf': await d.baked() }, outputs: ['out.pdf'], vars: { values: JSON.stringify(a.values || {}) } });
    const res = JSON.parse(r.result);
    if (!res.filled.length) throw new McpError(`No matching fields. Unknown: ${res.unknown.join(', ')}`);
    await d.commit(r.files['out.pdf'], 'Formular ausgefüllt (KI-Assistent)', { objects: [] });
    app.viewerRev++;
    return text(res);
  },
  async list_tools(a) { return text(headlessTools(a?.query)); },
  async run_tool(a) {
    const d = docOf(a);
    let t;
    try { t = toolById(a.tool); } catch { throw new McpError(`Unknown tool "${a.tool}". Use list_tools.`); }
    if (!headless(t)) throw new McpError(`"${a.tool}" needs the Werkbank window and cannot run here.`);
    const v = toolValues(t, a.values);
    const before = d.history.length;
    const r: any = await withBusy(t.label, async progress => (await t.run!({ ...v }, { doc: d, bytes: await d.baked(), current: d.current - 1, selection: [...d.selection], progress })) || {});
    const files = r.files; delete r.files;
    await applyResult(r, t);
    const out: any = { tool: t.id, pages: d.numPages, changed: d.history.length > before, label: r.label || t.label };
    const known = new Set((t.fields || []).map(f => f.key).concat('out_dir'));
    const ignored = Object.keys(a.values || {}).filter(k => !known.has(k));
    if (ignored.length) out.ignored = ignored;
    if (r.doc || r.docs) out.opened = (r.docs || [r.doc!]).map(x => x.name);
    if (files?.length) {
      if (!P.isTauri || !a.values?.out_dir) out.files = files.map(f => f.name), out.note = 'This tool produced files. Pass values.out_dir (a folder path) to write them.';
      else { for (const f of files) await P.writePath(P.joinPath(a.values.out_dir, f.name), f.data); out.written = files.map(f => P.joinPath(a.values.out_dir, f.name)); }
    }
    if (r.message) out.message = r.message;
    return text(out);
  },
  async undo(a) {
    const d = docOf(a);
    if (d.pos === 0 && !d.pendingEdits) throw new McpError('Nothing to undo.');
    await undoDoc();
    return text({ undone: true, now: d.history[d.pos].label });
  },
  async save_document(a) {
    const d = docOf(a);
    if (!P.isTauri) throw new McpError('Saving to disk needs the Werkbank desktop app.');
    const path = a.path || d.path;
    if (!path) throw new McpError('The document has no file yet. Pass path.');
    const bytes = await outputBytes(d);
    await P.writePath(path, bytes);
    d.markSaved(path, path.split(/[\\/]/).pop());
    return text({ saved: path, bytes: bytes.length, appended: d.canAppend });
  },
};

/** Einen Werkzeugaufruf ausführen. Fehler kommen als isError-Ergebnis zurück, nie als Ausnahme. */
export async function callTool(name: string, args: any = {}): Promise<McpResult> {
  const h = handlers[name];
  if (!h) return { isError: true, content: [{ type: 'text', text: `Unknown tool "${name}"` }] };
  app.mcpBusy++;
  try { return await h(args || {}); }
  catch (e: any) { return { isError: true, content: [{ type: 'text', text: e instanceof McpError ? e.message : `Werkbank error: ${e?.message || e}` }] }; }
  finally { app.mcpBusy--; }
}

/** Steuerkanal nach den Einstellungen öffnen oder schließen (nur Desktop-App) */
export async function applyMcpPref() {
  return P.mcpEnable(app.prefs.mcp, (tool, args) => callTool(tool, args));
}
