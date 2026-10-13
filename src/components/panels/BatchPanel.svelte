<script lang="ts">
  import { L } from '../../lib/i18n';
  import { app, toast } from '../../lib/app.svelte';
  import { TOOLS } from '../../lib/tools';
  import { defaults, type Field } from '../../lib/fields';
  import { pickFiles, pickFolder, joinPath, writePath, isTauri, FILTERS, type PickedFile } from '../../lib/platform';
  import { saveFiles } from '../../lib/actions';
  import { Doc } from '../../lib/doc.svelte';
  import { hasPdfHeader, anyToPdf } from '../../lib/convert';
  import { encryptBytes } from '../../lib/tools/protect';
  import type { OutFile, Tool, ToolCtx } from '../../lib/tools/types';
  import { fmtSize, baseName, withExt } from '../../lib/util';
  import Fields from '../Fields.svelte';
  import * as I from '../../lib/icons';

  // Werkzeuge, die ohne Eingriff im Dokument laufen
  const BATCH_IDS = ['ocr', 'deskew', 'compress', 'grayscale', 'outline-fonts', 'adjust-colors', 'scan-look', 'rasterize', 'linearize', 'repair',
    'rotate', 'remove-blank', 'crop', 'resize', 'nup', 'page-numbers', 'header-footer', 'bates', 'watermark', 'background',
    'form-flatten', 'flatten-annots', 'remove-annots', 'sanitize', 'strip-metadata', 'protect', 'to-pdfa',
    'to-word', 'to-excel', 'to-images', 'to-text', 'to-markdown', 'to-html'];
  const blocked = (f: Field) => f.type === 'doc' || f.type === 'docs' || f.type === 'quad';
  const available = BATCH_IDS.map(id => TOOLS.find(t => t.id === id)).filter((t): t is Tool => !!t && !!t.run && !(t.fields || []).some(blocked));

  interface Step { key: number; tool: Tool; values: Record<string, any>; open: boolean }
  interface Item { file: PickedFile; state: 'wait' | 'run' | 'ok' | 'error'; msg?: string; out?: number }

  let items = $state<Item[]>([]);
  let steps = $state<Step[]>([]);
  let adding = $state('');
  let target = $state<'folder' | 'zip'>(isTauri ? 'folder' : 'zip');
  let suffix = $state('');
  let running = $state(false);
  let cancel = false;
  let seq = 0;

  const done = $derived(items.filter(i => i.state === 'ok' || i.state === 'error').length);
  const failed = $derived(items.filter(i => i.state === 'error').length);

  async function addFiles() {
    const picked = await pickFiles({ multiple: true, filters: FILTERS.openable, title: L("Dateien für die Stapelverarbeitung") });
    const known = new Set(items.map(i => i.file.path || i.file.name));
    for (const f of picked) if (!known.has(f.path || f.name)) items.push({ file: f, state: 'wait' });
  }
  async function addOpenDocs() {
    for (const d of app.docs) {
      if (items.some(i => i.file.name === d.name && !i.file.path)) continue;
      const bytes = await d.baked();
      items.push({ file: { name: d.name, path: null, bytes, size: bytes.length }, state: 'wait' });
    }
  }
  function addStep() {
    const t = available.find(x => x.id === adding);
    if (!t) return;
    for (const s of steps) s.open = false;
    steps.push({ key: ++seq, tool: t, values: defaults(t.fields), open: true });
    adding = '';
  }
  function move(i: number, d: number) { const j = i + d; if (j < 0 || j >= steps.length) return; const [s] = steps.splice(i, 1); steps.splice(j, 0, s); }
  // Ausgabe-Schritte (Dateien statt PDF) sind nur am Ende sinnvoll
  const producesFiles = (t: Tool) => t.id.startsWith('to-') && t.id !== 'to-pdfa';
  const orderWarning = $derived(steps.slice(0, -1).some(s => producesFiles(s.tool)));

  async function processOne(item: Item, onProgress: (p: number, m?: string) => void): Promise<OutFile[]> {
    let bytes = hasPdfHeader(item.file.bytes) ? item.file.bytes : await anyToPdf(item.file.name, item.file.bytes);
    const name = withExt(item.file.name, 'pdf');
    let outFiles: OutFile[] | null = null;
    const tmp = new Doc(name, bytes, null, 'stapel');
    await tmp.load();
    try {
      for (let k = 0; k < steps.length; k++) {
        if (cancel) throw new Error('abgebrochen');
        const s = steps[k];
        const ctx: ToolCtx = { doc: tmp, bytes, current: 0, selection: [], progress: (p, m) => onProgress(p < 0 ? -1 : (k + Math.max(0, p)) / steps.length, `${s.tool.short || s.tool.label}${m ? ' · ' + m : ''}`) };
        onProgress(k / steps.length, s.tool.short || s.tool.label);
        const r = await s.tool.run!($state.snapshot(s.values), ctx);
        if (!r) continue;
        if (r.bytes) bytes = r.bytes;
        else if (r.doc) bytes = r.doc.bytes;
        else if (r.docs?.length) bytes = r.docs[0].bytes;
        if (r.files?.length) { outFiles = r.files; break; }
        if (k < steps.length - 1 && (r.bytes || r.doc)) await tmp.load(bytes);
      }
      if (outFiles) return outFiles;
      if (tmp.protection) bytes = await encryptBytes(bytes, tmp.protection);
      const stem = baseName(name);
      return [{ name: `${stem}${suffix ? '-' + suffix.trim() : ''}.pdf`, data: bytes }];
    } finally { tmp.destroy(); }
  }

  async function start() {
    if (!items.length || !steps.length) return;
    let folder: string | null = null;
    if (target === 'folder') { folder = await pickFolder(L("Zielordner wählen")); if (!folder) return; }
    running = true; cancel = false;
    for (const it of items) { it.state = 'wait'; it.msg = undefined; it.out = undefined; }
    const collected: OutFile[] = [];
    const used = new Set<string>();
    const unique = (n: string) => { let c = n, i = 2; while (used.has(c.toLowerCase())) c = n.replace(/(\.[^.]+)?$/, ` (${i++})$1`); used.add(c.toLowerCase()); return c; };
    for (let n = 0; n < items.length; n++) {
      if (cancel) break;
      const it = items[n];
      it.state = 'run';
      app.busy = { label: L("Stapel · Datei {0} von {1}", n + 1, items.length), progress: n / items.length, detail: it.file.name, cancel: () => { cancel = true; } };
      try {
        const outs = await processOne(it, (p, m) => { if (app.busy) { app.busy.progress = p < 0 ? -1 : (n + p) / items.length; app.busy.detail = `${it.file.name} · ${m || ''}`; } });
        let size = 0;
        for (const o of outs) {
          const nm = unique(o.name);
          const data = o.data instanceof Blob ? new Uint8Array(await o.data.arrayBuffer()) : o.data;
          size += data.length;
          if (folder) await writePath(joinPath(folder, nm), data);
          else collected.push({ name: nm, data });
        }
        it.state = 'ok'; it.out = size; it.msg = outs.length > 1 ? L("{0} Dateien", outs.length) : undefined;
      } catch (e: any) {
        it.state = 'error'; it.msg = String(e?.message || e);
      }
    }
    app.busy = null;
    running = false;
    if (!folder && collected.length) await saveFiles(collected, L("Stapel.zip"));
    const ok = items.filter(i => i.state === 'ok').length;
    if (cancel) toast(L("Abgebrochen – {0} Datei(en) fertig", ok));
    else toast(failed ? L("{0} fertig, {1} mit Fehler", ok, failed) : L("Alle {0} Dateien verarbeitet", ok), { kind: failed ? 'error' : 'ok' });
  }
</script>

<div class="p">
  <section>
    <div class="head"><h3>{L("1 · Dateien")}</h3><span class="muted num">{items.length ? `${items.length} · ${fmtSize(items.reduce((a, i) => a + i.file.size, 0))}` : ''}</span></div>
    <div class="btns">
      <button class="btn sm" disabled={running} onclick={addFiles}><I.Plus size={13} /> {L("Dateien hinzufügen")}</button>
      {#if app.docs.length}<button class="btn sm ghost" disabled={running} onclick={addOpenDocs}>{L("Offene Dokumente")}</button>{/if}
      {#if items.length && !running}<button class="btn sm ghost" onclick={() => (items = [])}>{L("Leeren")}</button>{/if}
    </div>
    {#if items.length}
      <ul class="files scroll">
        {#each items as it, i (it.file.path || it.file.name + i)}
          <li class={it.state}>
            <span class="st">
              {#if it.state === 'ok'}<I.Check size={12} />{:else if it.state === 'error'}<I.AlertTriangle size={12} />{:else if it.state === 'run'}<span class="spin"></span>{:else}<I.FileText size={12} />{/if}
            </span>
            <span class="nm" title={it.msg || it.file.path || it.file.name}>{it.file.name}{#if it.msg}<small>{it.msg}</small>{/if}</span>
            <span class="sz num">{it.out ? fmtSize(it.out) : fmtSize(it.file.size)}</span>
            {#if !running}<button class="x" aria-label={L("Entfernen")} onclick={() => items.splice(i, 1)}><I.X size={11} /></button>{/if}
          </li>
        {/each}
      </ul>
    {:else}<p class="hint">{L("PDFs, Office-Dateien, Bilder – alles, was Werkbank öffnen kann. Nicht-PDFs werden zuerst umgewandelt.")}</p>{/if}
  </section>

  <section>
    <h3>{L("2 · Arbeitsschritte")}</h3>
    {#each steps as s, i (s.key)}
      <div class="step" class:open={s.open}>
        <div class="sh">
          <button class="tg" onclick={() => (s.open = !s.open)}><span class="n num">{i + 1}</span><s.tool.icon size={14} /><span>{s.tool.label}</span></button>
          <button class="btn sm icon ghost" aria-label={L("Nach oben")} disabled={i === 0 || running} onclick={() => move(i, -1)}><I.ChevronUp size={13} /></button>
          <button class="btn sm icon ghost" aria-label={L("Nach unten")} disabled={i === steps.length - 1 || running} onclick={() => move(i, 1)}><I.ChevronDown size={13} /></button>
          <button class="btn sm icon ghost" aria-label={L("Schritt entfernen")} disabled={running} onclick={() => steps.splice(i, 1)}><I.Trash2 size={13} /></button>
        </div>
        {#if s.open && s.tool.fields?.length}<div class="sf"><Fields fields={s.tool.fields} bind:values={s.values} /></div>{/if}
      </div>
    {/each}
    <div class="add">
      <select class="select" bind:value={adding} disabled={running}>
        <option value="">{L("Schritt hinzufügen …")}</option>
        {#each available as t (t.id)}<option value={t.id}>{t.label}</option>{/each}
      </select>
      <button class="btn sm" disabled={!adding} onclick={addStep}>{L("Hinzufügen")}</button>
    </div>
    {#if orderWarning}<p class="warn">{L("Umwandlungen in Word, Bilder usw. beenden die Kette – setze sie ans Ende.")}</p>{/if}
  </section>

  <section>
    <h3>{L("3 · Ausgabe")}</h3>
    <div class="seg">
      {#if isTauri}<button aria-pressed={target === 'folder'} onclick={() => (target = 'folder')}>{L("In Ordner")}</button>{/if}
      <button aria-pressed={target === 'zip'} onclick={() => (target = 'zip')}>{isTauri ? L("Als ZIP") : L("Herunterladen")}</button>
    </div>
    <label class="row"><span>{L("Namenszusatz")}</span><input class="input" placeholder={L("z. B. ocr – leer lassen für gleichen Namen")} bind:value={suffix} /></label>
    <p class="hint">{L("Die Originale bleiben unverändert.")}</p>
  </section>

  <button class="btn primary" disabled={running || !items.length || !steps.length} onclick={start}>
    {running ? L("Läuft … {0}/{1}", done, items.length) : `${items.length || ''} ${items.length === 1 ? L("Datei") : L("Dateien")} verarbeiten`}
  </button>
</div>

<style>
  .p { display: flex; flex-direction: column; gap: 18px; }
  section { display: flex; flex-direction: column; gap: 8px; }
  .head { display: flex; justify-content: space-between; align-items: baseline; }
  h3 { margin: 0; font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-3); }
  .muted { color: var(--text-3); font-size: 11px; }
  .hint { margin: 0; font-size: 12px; color: var(--text-3); line-height: 1.45; }
  .warn { margin: 0; font-size: 12px; line-height: 1.45; padding: 6px 9px; border-radius: 7px; background: color-mix(in srgb, var(--warn) 12%, transparent); }
  .btns { display: flex; flex-wrap: wrap; gap: 6px; }
  .files { list-style: none; margin: 0; padding: 4px; max-height: 220px; background: var(--surface); border-radius: 8px; box-shadow: var(--shadow-1); display: flex; flex-direction: column; gap: 1px; }
  .files li { display: grid; grid-template-columns: 16px minmax(0, 1fr) auto 16px; align-items: center; gap: 6px; padding: 4px 6px; border-radius: 5px; font-size: 12px; }
  .files li:hover { background: var(--hover); }
  .st { display: grid; place-items: center; color: var(--text-3); }
  li.ok .st { color: var(--ok, #2a9d55); }
  li.error .st { color: var(--danger); }
  .nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .nm small { display: block; color: var(--text-3); font-size: 10.5px; overflow: hidden; text-overflow: ellipsis; }
  li.error small { color: var(--danger); }
  .sz { color: var(--text-3); font-size: 11px; }
  .x { border: 0; background: none; padding: 0; color: var(--text-3); display: grid; place-items: center; opacity: 0; }
  li:hover .x { opacity: 1; }
  .spin { width: 10px; height: 10px; border-radius: 50%; border: 1.5px solid var(--accent); border-right-color: transparent; animation: spin 0.8s linear infinite; }
  .step { background: var(--surface); border-radius: 8px; box-shadow: var(--shadow-1); }
  .sh { display: flex; align-items: center; gap: 2px; padding: 3px 4px; }
  .tg { flex: 1; min-width: 0; display: flex; align-items: center; gap: 7px; border: 0; background: none; padding: 4px 4px; font-size: 12.5px; font-weight: 500; text-align: left; color: var(--text); }
  .tg span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .n { width: 17px; height: 17px; border-radius: 50%; background: var(--selected); display: grid; place-items: center; font-size: 10.5px; color: var(--text-2); flex: none; }
  .sf { padding: 4px 10px 12px; border-top: 0.5px solid var(--line); }
  .add { display: flex; gap: 6px; }
  .add .select { flex: 1; min-width: 0; }
  .row { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--text-2); }
</style>
