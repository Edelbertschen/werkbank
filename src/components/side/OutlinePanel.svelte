<script lang="ts">
  import Empty from '../Empty.svelte';
  import { L } from '../../lib/i18n';
  import type { Doc } from '../../lib/doc.svelte';
  import { viewer } from '../../lib/viewer.svelte';
  import { pyRun } from '../../lib/engines';
  import { withBusy, applyResult } from '../../lib/actions';
  import { showMenu } from '../../lib/menu.svelte';
  import { toast } from '../../lib/app.svelte';
  import * as I from '../../lib/icons';

  let { doc }: { doc: Doc } = $props();
  interface Entry { level: number; title: string; page: number; open: boolean }
  let entries = $state<Entry[]>([]);
  let dirty = $state(false);
  let editing = $state<number | null>(null);
  let loading = $state(true);

  async function load() {
    loading = true;
    const out: Entry[] = [];
    const pdf = doc.pdf!;
    const walk = async (items: any[], lvl: number) => {
      for (const it of items || []) {
        let page = 1;
        try { let d = it.dest; if (typeof d === 'string') d = await pdf.getDestination(d); if (d) page = (typeof d[0] === 'object' ? await pdf.getPageIndex(d[0]) : d[0]) + 1; } catch { /* ohne Ziel */ }
        out.push({ level: lvl, title: it.title || L("(ohne Titel)"), page, open: lvl < 2 });
        if (it.items?.length) await walk(it.items, lvl + 1);
      }
    };
    try { await walk((await pdf.getOutline()) || [], 1); } catch { /* keine */ }
    entries = out; dirty = false; loading = false;
  }
  $effect(() => { doc.rev; load(); });

  let q = $state('');
  /** Suche: Treffer samt ihrer Eltern, unabhängig vom Auf- und Zuklappen */
  const found = $derived.by(() => {
    const t = q.trim().toLowerCase();
    if (!t) return null;
    const keep = new Set<number>();
    entries.forEach((e, i) => {
      if (!e.title.toLowerCase().includes(t)) return;
      keep.add(i);
      let lvl = e.level;
      for (let j = i - 1; j >= 0 && lvl > 1; j--) if (entries[j].level < lvl) { keep.add(j); lvl = entries[j].level; }
    });
    return [...keep].sort((a, b) => a - b);
  });
  // Sichtbarkeit: eingeklappte Eltern blenden Kinder aus
  const visible = $derived.by(() => {
    if (found) return found;
    const out: number[] = []; let hideBelow = Infinity;
    entries.forEach((e, i) => {
      if (e.level > hideBelow) return;
      hideBelow = Infinity;
      out.push(i);
      if (!e.open && entries[i + 1]?.level > e.level) hideBelow = e.level;
    });
    return out;
  });
  const hasKids = (i: number) => entries[i + 1]?.level > entries[i].level;

  function add() {
    const at = entries.length;
    entries.push({ level: 1, title: L("Seite {0}", doc.current), page: doc.current, open: true });
    dirty = true; editing = at;
  }
  function move(i: number, d: -1 | 1) {
    const j = i + d; if (j < 0 || j >= entries.length) return;
    [entries[i], entries[j]] = [entries[j], entries[i]]; dirty = true;
  }
  function indent(i: number, d: -1 | 1) {
    const e = entries[i]; const max = i > 0 ? entries[i - 1].level + 1 : 1;
    e.level = Math.max(1, Math.min(max, e.level + d)); dirty = true;
  }
  function remove(i: number) { entries.splice(i, 1); dirty = true; }
  function normalize(): [number, string, number][] {
    let prev = 0;
    return entries.map(e => { const l = Math.max(1, Math.min(e.level, prev + 1)); prev = l; return [l, e.title, Math.max(1, Math.min(doc.numPages, e.page))]; });
  }
  async function apply() {
    const toc = normalize();
    const r = await withBusy(L("Lesezeichen werden gespeichert"), async () => pyRun(`doc = open_in()\ndoc.set_toc(json.loads(ARGS['toc']))\nsave_out(doc)`, { files: { 'in.pdf': await doc.baked() }, outputs: ['out.pdf'], vars: { toc: JSON.stringify(toc) } }));
    await applyResult({ bytes: r.files['out.pdf'], label: L("Lesezeichen geändert") });
  }
  async function fromHeadings() {
    const r = await withBusy(L("Überschriften werden gesucht"), () => pyRun<any[]>(`
doc = open_in()
sizes = {}
for page in doc:
    for b in page.get_text('dict')['blocks']:
        for l in b.get('lines', []):
            for s in l['spans']:
                t = s['text'].strip()
                if t: sizes[round(s['size'], 1)] = sizes.get(round(s['size'], 1), 0) + len(t)
body = max(sizes, key=sizes.get) if sizes else 10
levels = sorted([s for s in sizes if s >= body * 1.18], reverse=True)[:3]
out = []
for page in doc:
    for b in page.get_text('dict')['blocks']:
        for l in b.get('lines', []):
            txt = ''.join(s['text'] for s in l['spans']).strip()
            sz = max((round(s['size'], 1) for s in l['spans']), default=0)
            if sz in levels and 2 < len(txt) < 120:
                out.append([levels.index(sz) + 1, txt, page.number + 1])
out`, { files: { 'in.pdf': doc.bytes } }));
    if (!r.result.length) { toast(L("Keine Überschriften erkannt")); return; }
    entries = r.result.map(([level, title, page]: any) => ({ level, title, page, open: true })); dirty = true;
    toast(L("{0} Lesezeichen aus Überschriften vorgeschlagen – prüfen und übernehmen", r.result.length));
  }
  function ctx(e: MouseEvent, i: number) {
    showMenu(e, [
      { label: L("Umbenennen"), icon: I.Type, run: () => (editing = i) },
      { label: L("Auf aktuelle Seite setzen"), icon: I.Pin, run: () => { entries[i].page = doc.current; dirty = true; } },
      { label: L("Nach oben"), icon: I.ChevronUp, run: () => move(i, -1) },
      { label: L("Nach unten"), icon: I.ChevronDown, run: () => move(i, 1) },
      { label: L("Einrücken"), icon: I.ChevronRight, run: () => indent(i, 1) },
      { label: L("Ausrücken"), icon: I.ChevronLeft, run: () => indent(i, -1) },
      { sep: true, label: '' },
      { label: L("Löschen"), icon: I.Trash2, danger: true, run: () => remove(i) },
    ]);
  }
</script>

<div class="bar">
  <button class="btn sm" onclick={add} title={L("Lesezeichen für die aktuelle Seite")}><I.Plus size={13} />{L("Neu")}</button>
  <button class="btn sm" onclick={fromHeadings} title={L("Aus Überschriften erzeugen")}><I.WandSparkles size={13} />{L("Automatisch")}</button>
</div>
{#if entries.length > 1}
  <div class="find"><I.Search size={13} strokeWidth={2} /><input class="input" type="search" placeholder={L("Lesezeichen durchsuchen")} bind:value={q} /></div>
{/if}
<div class="tree scroll">
  {#if found && !found.length}<p class="none">{L("Kein Lesezeichen passt.")}</p>{/if}
  {#if loading}<p class="empty">{L("Lädt …")}</p>
  {:else if !entries.length}<Empty icon={I.Bookmark} title={L("Keine Lesezeichen")} text={L("Lege eines für die aktuelle Seite an oder lass sie aus den Überschriften erzeugen.")}><button class="btn sm" onclick={fromHeadings}><I.WandSparkles size={13} />{L("Automatisch")}</button></Empty>
  {:else}
    {#each visible as i (i)}
      {@const e = entries[i]}
      <div class="row" style:padding-left={(e.level - 1) * 14 + 4 + 'px'} oncontextmenu={ev => ctx(ev, i)} role="treeitem" aria-level={e.level} aria-selected="false" tabindex="-1">
        {#if hasKids(i)}<button class="tw" aria-label={e.open ? L("Zuklappen") : L("Aufklappen")} onclick={() => (e.open = !e.open)}>{#if e.open}<I.ChevronDown size={12} />{:else}<I.ChevronRight size={12} />{/if}</button>{:else}<span class="tw"></span>{/if}
        {#if editing === i}
          <!-- svelte-ignore a11y_autofocus -->
          <input class="input" value={e.title} autofocus onblur={ev => { e.title = (ev.target as HTMLInputElement).value || e.title; editing = null; dirty = true; }} onkeydown={ev => { if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur(); if (ev.key === 'Escape') editing = null; }} />
        {:else}
          <button class="t" onclick={() => viewer.goto(e.page)} ondblclick={() => (editing = i)} title={e.title}>{e.title}</button>
          <span class="pg num">{e.page}</span>
        {/if}
      </div>
    {/each}
  {/if}
</div>
{#if dirty}
  <div class="apply"><span>{L("Geänderte Lesezeichen")}</span><button class="btn sm" onclick={load}>{L("Verwerfen")}</button><button class="btn sm primary" onclick={apply}>{L("Übernehmen")}</button></div>
{/if}

<style>
  .bar { display: flex; gap: 6px; padding: 0 12px 8px; }
  .find { position: relative; display: flex; align-items: center; padding: 0 12px 8px; }
  .find :global(svg) { position: absolute; left: 21px; color: var(--text-3); }
  .find .input { padding-left: 27px; }
  .none { margin: 6px 8px; font-size: 12px; color: var(--text-3); }
  .tree { flex: 1; padding: 0 8px 12px; }
  .empty { color: var(--text-3); font-size: 12px; padding: 6px 6px; line-height: 1.5; }
  .row { display: flex; align-items: center; gap: 2px; height: 26px; border-radius: 6px; }
  .row:hover { background: var(--hover); }
  .tw { width: 16px; height: 16px; border: 0; background: none; padding: 0; display: grid; place-items: center; color: var(--text-3); flex: none; }
  .t { flex: 1; min-width: 0; text-align: left; border: 0; background: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 0 4px; }
  .pg { font-size: 11px; color: var(--text-3); padding-right: 6px; }
  .row .input { height: 22px; }
  .apply { display: flex; align-items: center; gap: 6px; padding: 8px 10px; border-top: 0.5px solid var(--line); background: var(--surface); font-size: 12px; }
  .apply span { flex: 1; color: var(--text-2); }
</style>
