#!/usr/bin/env node
// Übersetzungswerkzeug
//   node scripts/i18n.mjs extract   → listet alle Oberflächentexte (scripts/i18n-strings.json)
//   node scripts/i18n.mjs wrap      → wickelt übersetzte Texte im Code in L('…') ein
//   node scripts/i18n.mjs check     → meldet Texte ohne Übersetzung (für Tests/CI)
//
// Arbeitet auf dem Syntaxbaum (TypeScript-Compiler bzw. Svelte-Parser), nicht mit Suchen/Ersetzen.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { parse as parseSvelte } from 'svelte/compiler';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'src');
const SKIP_FILES = [/src\/lib\/i18n\//, /src\/lib\/testhook\.ts$/, /src\/lib\/vendor\//, /\.d\.ts$/];

// ---------------------------------------------------------------------------
// Was ist ein Oberflächentext?
// ---------------------------------------------------------------------------
export function isUiText(s) {
  const t = s.trim();
  if (t.length < 2 || !/\p{L}/u.test(t)) return false;
  if (/\n/.test(s) && /(^|\n)\s*(doc|page|for|if|import|def|return|save_out|out|r)\b/.test(s)) return false; // Python
  if (/^(\.{0,2}\/|https?:|data:|blob:|#[0-9a-f]{3,8}$|[a-z]+\/[a-z0-9.+-]+$)/i.test(t)) return false;  // Pfade, URLs, Farben, MIME
  if (/^[a-z0-9_:.\-*]+$/.test(t)) return false;            // Kennungen, Modi, Endungen
  if (/^[A-Za-z]+[A-Z][A-Za-z0-9]*$/.test(t)) return false;  // camelCase / Bezeichner
  if (/^--|[{};]\s*$|^\s*[.#]?[a-z-]+\s*:/.test(t)) return false; // CSS
  if (/[äöüÄÖÜß„“…–]/.test(t)) return true;
  if (/\s/.test(t) && /[a-zäöü]{2,}/.test(t)) return true;
  if (/^[A-ZÄÖÜ][a-zäöüß]{2,}\b/.test(t)) return true;
  if (/^[A-Z0-9]{2,}[-/][A-ZÄÖÜ]?[a-zäöüß]{3,}/.test(t)) return true; // „JSON-Datei“, „PDF-Engine“
  return false;
}

// ---------------------------------------------------------------------------
// Dateien
// ---------------------------------------------------------------------------
function files(dir) {
  const out = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (/\.(ts|svelte)$/.test(f) && !SKIP_FILES.some(r => r.test(p))) out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Fundstellen sammeln: { start, end, key, args: [{start,end}], kind }
// ---------------------------------------------------------------------------
const COMPARE = new Set(['===', '!==', '==', '!=']);

/** TypeScript-Dateien */
function scanTs(src, file) {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true);
  const hits = [];
  const skip = (node) => {
    const p = node.parent;
    if (!p) return true;
    if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isImportTypeNode?.(p) || ts.isExternalModuleReference(p)) return true;
    if (ts.isLiteralTypeNode(p)) return true;
    if (ts.isPropertyAssignment(p) && p.name === node) return true;
    if (ts.isPropertySignature?.(p)) return true;
    if (ts.isBinaryExpression(p) && COMPARE.has(p.operatorToken.getText())) return true;
    if (ts.isCaseClause(p)) return true;
    if (ts.isElementAccessExpression(p) && p.argumentExpression === node) return true;
    if (ts.isCallExpression(p) && p.arguments.includes(node)) {
      const callee = p.expression.getText(sf);
      if (/(^|\.)(L|pyRun|py|gs|qpdf|log|warn|error|info|debug|querySelector(All)?|closest|getAttribute|setAttribute|addEventListener|removeEventListener|invoke|listen|emit|stateLoad|stateSave|blobSave|blobLoad|blobDelete|getElementById|createElement|startsWith|endsWith|includes|split|replace|match|test|indexOf|get|has|set|delete)$/.test(callee)) return true;
    }
    return false;
  };
  const visit = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (!skip(node) && isUiText(node.text)) hits.push({ start: node.getStart(sf), end: node.getEnd(), key: node.text, args: [], kind: 'str' });
      return;
    }
    if (ts.isTemplateExpression(node)) {
      let key = node.head.text; const args = [];
      node.templateSpans.forEach((sp, i) => { key += `{${i}}` + sp.literal.text; args.push({ start: sp.expression.getStart(sf), end: sp.expression.getEnd() }); });
      if (!skip(node) && isUiText(key.replace(/\{\d+\}/g, ''))) hits.push({ start: node.getStart(sf), end: node.getEnd(), key, args, kind: 'tpl' });
      node.templateSpans.forEach(sp => visit(sp.expression));
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
}

/** estree-Knoten (Svelte-Skripte und Ausdrücke) */
function scanEstree(node, hits, parent = null, src = '') {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach(n => scanEstree(n, hits, parent, src)); return; }
  const isCompare = parent && parent.type === 'BinaryExpression' && COMPARE.has(parent.operator);
  const isKey = parent && (parent.type === 'Property' && parent.key === node && !parent.computed);
  const calleeText = parent && parent.type === 'CallExpression' ? src.slice(parent.callee.start, parent.callee.end) : '';
  const skipCall = /(^|\.)(L|pyRun|py|gs|qpdf|log|warn|error|info|debug|querySelector(All)?|closest|getAttribute|setAttribute|addEventListener|removeEventListener|invoke|getElementById|createElement|startsWith|endsWith|includes|split|replace|match|test|indexOf|get|has|set|delete)$/.test(calleeText);
  const skipParent = parent && (parent.type === 'ImportDeclaration' || parent.type === 'ExportNamedDeclaration' || parent.type === 'ExportAllDeclaration' || parent.type === 'TSLiteralType' || parent.type === 'SwitchCase' || (parent.type === 'MemberExpression' && parent.property === node && parent.computed));
  if (node.type === 'Literal' && typeof node.value === 'string') {
    if (!isCompare && !isKey && !skipCall && !skipParent && isUiText(node.value)) hits.push({ start: node.start, end: node.end, key: node.value, args: [], kind: 'str' });
    return;
  }
  if (node.type === 'TemplateLiteral') {
    let key = ''; const args = [];
    node.quasis.forEach((q, i) => { key += q.value.cooked ?? q.value.raw; if (i < node.expressions.length) { key += `{${i}}`; args.push({ start: node.expressions[i].start, end: node.expressions[i].end }); } });
    if (!isCompare && !skipCall && !skipParent && isUiText(key.replace(/\{\d+\}/g, ''))) hits.push({ start: node.start, end: node.end, key, args, kind: 'tpl' });
    node.expressions.forEach(e => scanEstree(e, hits, node, src));
    return;
  }
  for (const k of Object.keys(node)) {
    if (k === 'parent' || k === 'loc' || k === 'metadata' || k === 'leadingComments' || k === 'trailingComments') continue;
    const v = node[k];
    if (v && typeof v === 'object') scanEstree(v, hits, node, src);
  }
}

const TEXT_ATTRS_SKIP = /^(class|style|id|role|type|name|for|href|src|rel|target|method|action|accept|autocomplete|inputmode|lang|dir|tabindex|xmlns|viewBox|d|fill|stroke|transform|width|height|x|y|cx|cy|r|points|kind|size|variant|mode|icon|key|data-.*|aria-(hidden|pressed|selected|expanded|checked|live|modal|busy|controls|haspopup|current|orientation)|on.*|bind:.*|use:.*|transition:.*|in:.*|out:.*|animate:.*)$/i;

/** Svelte-Dateien */
function scanSvelte(src, file) {
  const ast = parseSvelte(src, { modern: true, filename: file });
  const hits = [];
  if (ast.instance) scanEstree(ast.instance.content, hits, null, src);
  if (ast.module) scanEstree(ast.module.content, hits, null, src);

  const runOf = (nodes, makeHit) => {
    // Folgen aus Text und {Ausdruck} zu einem Satz zusammenfassen
    let run = [];
    const flush = () => {
      if (!run.length) return;
      const texts = run.filter(n => n.type === 'Text');
      const joined = run.map(n => (n.type === 'Text' ? n.data : '\u0000')).join('');
      if (texts.length && isUiText(joined.replace(/\u0000/g, ''))) {
        // Rand-Leerraum bleibt außerhalb
        let first = 0, last = run.length - 1;
        const lead = run[first].type === 'Text' ? run[first].data.match(/^\s*/)[0].length : 0;
        const trail = run[last].type === 'Text' ? run[last].data.match(/\s*$/)[0].length : 0;
        const start = run[first].start + lead, end = run[last].end - trail;
        let key = ''; const args = [];
        run.forEach((n, i) => {
          if (n.type === 'Text') {
            let d = n.data;
            if (i === 0) d = d.slice(lead);
            if (i === run.length - 1) d = d.slice(0, d.length - trail);
            key += d.replace(/\s+/g, ' ');
          } else { key += `{${args.length}}`; args.push({ start: n.expression.start, end: n.expression.end }); }
        });
        if (key.trim()) makeHit({ start, end, key, args });
      }
      run = [];
    };
    for (const n of nodes) {
      if (n.type === 'Text' || n.type === 'ExpressionTag') run.push(n);
      else flush();
    }
    flush();
  };

  const walk = (node, inStyle = false) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(n => walk(n, inStyle)); return; }
    if (node.type === 'Fragment') {
      runOf(node.nodes, h => hits.push({ ...h, kind: 'markup' }));
      node.nodes.forEach(n => { if (n.type === 'ExpressionTag') scanEstree(n.expression, hits, null, src); else walk(n); });
      return;
    }
    if (node.type === 'RegularElement' || node.type === 'Component' || node.type === 'SvelteElement' || node.type === 'SlotElement' || node.type === 'SvelteComponent' || node.type === 'SvelteSelf') {
      if (node.name === 'style' || node.name === 'script') return;
      for (const a of node.attributes || []) {
        if (a.type === 'Attribute') {
          if (a.value === true) continue;
          const vals = Array.isArray(a.value) ? a.value : [a.value];
          if (!TEXT_ATTRS_SKIP.test(a.name) && vals.some(v => v.type === 'Text')) {
            runOf(vals, h => hits.push({ ...h, kind: 'attr', attr: a, quoted: true }));
          }
          vals.forEach(v => { if (v.type === 'ExpressionTag') scanEstree(v.expression, hits, null, src); });
        } else if (a.expression) scanEstree(a.expression, hits, null, src);
      }
      walk(node.fragment);
      return;
    }
    // Blöcke: Bedingungen/Ausdrücke und Unterfragmente
    for (const k of Object.keys(node)) {
      if (k === 'metadata' || k === 'parent') continue;
      const v = node[k];
      if (!v || typeof v !== 'object') continue;
      if (['expression', 'test', 'key', 'context', 'index'].includes(k) && v.type && v.type !== 'Fragment') scanEstree(v, hits, null, src);
      else walk(v);
    }
  };
  walk(ast.fragment);
  // Attribut-Werte: Fundstelle umfasst die Anführungszeichen
  for (const h of hits) if (h.kind === 'attr') {
    const a = h.attr; const valStart = a.value[0].start, valEnd = a.value[a.value.length - 1].end;
    const q = src[valStart - 1];
    h.start = q === '"' || q === "'" ? valStart - 1 : valStart;
    h.end = q === '"' || q === "'" ? valEnd + 1 : valEnd;
    delete h.attr;
  }
  return hits;
}

function scanFile(file) {
  const src = readFileSync(file, 'utf8');
  const hits = file.endsWith('.svelte') ? scanSvelte(src, file) : scanTs(src, file);
  // Verschachtelte Fundstellen (Ausdrücke in Sätzen) bleiben erhalten; Duplikate entfernen
  const seen = new Set();
  return { src, hits: hits.filter(h => { const k = h.start + ':' + h.end; if (seen.has(k)) return false; seen.add(k); return true; }) };
}

// ---------------------------------------------------------------------------
// Ersetzen
// ---------------------------------------------------------------------------
function rewrite(src, hits, approved, range = [0, src.length]) {
  // äußere Fundstellen im Bereich, innere werden rekursiv in Argumenten ersetzt
  const inRange = hits.filter(h => h.start >= range[0] && h.end <= range[1] && approved.has(h.key));
  const outer = inRange.filter(h => !inRange.some(o => o !== h && o.start <= h.start && o.end >= h.end && (o.start < h.start || o.end > h.end)));
  outer.sort((a, b) => a.start - b.start);
  let out = '', pos = range[0];
  for (const h of outer) {
    out += src.slice(pos, h.start);
    const args = h.args.map(a => rewrite(src, hits, approved, [a.start, a.end]));
    const call = `L(${JSON.stringify(h.key)}${args.map(a => ', ' + a).join('')})`;
    out += h.kind === 'markup' ? `{${call}}` : h.kind === 'attr' ? `{${call}}` : call;
    pos = h.end;
  }
  return out + src.slice(pos, range[1]);
}

function addImport(src, file) {
  const rel = relative(dirname(file), join(SRC, 'lib', 'i18n')).replace(/\\/g, '/');
  const spec = rel.startsWith('.') ? rel : './' + rel;
  const line = `import { L } from '${spec}';`;
  if (src.includes(line) || /import \{[^}]*\bL\b[^}]*\} from '[^']*i18n'/.test(src)) return src;
  if (file.endsWith('.svelte')) {
    if (/<script(?![^>]*context=)(?![^>]*module)[^>]*>/.test(src)) return src.replace(/(<script(?![^>]*context=)(?![^>]*module)[^>]*>)/, `$1\n  ${line}`);
    return `<script lang="ts">\n  ${line}\n</script>\n\n` + src;
  }
  // nach dem letzten Import
  const imports = [...src.matchAll(/^import[^;]*;\s*$/gm)];
  if (imports.length) { const last = imports[imports.length - 1]; const at = last.index + last[0].length; return src.slice(0, at) + '\n' + line + src.slice(at); }
  return line + '\n' + src;
}

// ---------------------------------------------------------------------------
async function loadDict() {
  const en = readFileSync(join(SRC, 'lib', 'i18n', 'en.ts'), 'utf8');
  const json = en.slice(en.indexOf('{'), en.lastIndexOf('}') + 1);
  return Function(`return (${json})`)();
}
function loadKeep() {
  try { return new Set(JSON.parse(readFileSync(join(root, 'scripts', 'i18n-keep.json'), 'utf8'))); } catch { return new Set(); }
}

const cmd = process.argv[2] || 'extract';
const all = files(SRC);

if (cmd === 'extract') {
  const map = new Map();
  for (const f of all) for (const h of scanFile(f).hits) {
    const e = map.get(h.key) || { key: h.key, files: [] };
    const rf = relative(root, f); if (!e.files.includes(rf)) e.files.push(rf);
    map.set(h.key, e);
  }
  const list = [...map.values()].sort((a, b) => a.key.localeCompare(b.key, 'de'));
  writeFileSync(join(root, 'scripts', 'i18n-strings.json'), JSON.stringify(list, null, 1));
  console.log(`${list.length} Texte → scripts/i18n-strings.json`);
} else if (cmd === 'wrap') {
  const dict = await loadDict();
  const approved = new Set(Object.keys(dict));
  let changed = 0;
  for (const f of all) {
    const { src, hits } = scanFile(f);
    if (!hits.some(h => approved.has(h.key))) continue;
    let out = rewrite(src, hits, approved);
    if (out !== src) { out = addImport(out, f); writeFileSync(f, out); changed++; }
  }
  console.log(`${changed} Dateien angepasst`);
} else if (cmd === 'check') {
  const dict = await loadDict(); const keep = loadKeep();
  const missing = new Set();
  for (const f of all) for (const h of scanFile(f).hits) if (!(h.key in dict) && !keep.has(h.key)) missing.add(`${relative(root, f)}: ${h.key}`);
  // eingewickelte Texte ohne Übersetzung
  for (const f of all) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\bL\(\s*("(?:[^"\\]|\\.)*")/g)) { const k = JSON.parse(m[1]); if (!(k in dict) && !keep.has(k)) missing.add(`${relative(root, f)}: ${k}`); }
  }
  if (missing.size) { console.log([...missing].join('\n')); console.log(`\n${missing.size} Texte ohne Übersetzung`); process.exit(1); }
  console.log('Alle Texte übersetzt');
}
