<script lang="ts">
  import Empty from '../Empty.svelte';
  import { L, intlLocale } from '../../lib/i18n';
  import type { Doc } from '../../lib/doc.svelte';
  import { viewer } from '../../lib/viewer.svelte';
  import { plLoad, plSave } from '../../lib/ops';
  import { applyResult, withBusy } from '../../lib/actions';
  import { openTool } from '../../lib/ui.svelte';
  import * as I from '../../lib/icons';
  import { itemsOf, removeItem } from '../../lib/overlay.svelte';
  import { app } from '../../lib/app.svelte';

  let { doc }: { doc: Doc } = $props();
  interface C { id: string; page: number; type: string; author: string; text: string; date: string; color?: string; obj?: string }
  let items = $state<C[]>([]);
  let filter = $state('');
  let loading = $state(true);

  const TYPES: Record<string, string> = { Text: L("Notiz"), FreeText: L("Textkommentar"), Highlight: L("Markierung"), Underline: L("Unterstreichung"), StrikeOut: L("Durchstreichung"), Squiggly: L("Wellenlinie"), Ink: L("Freihand"), Square: L("Rechteck"), Circle: L("Ellipse"), Line: L("Linie"), Polygon: 'Polygon', PolyLine: L("Linienzug"), Stamp: L("Stempel"), Caret: L("Einfügemarke"), FileAttachment: L("Dateianhang") };

  async function load() {
    loading = true;
    const out: C[] = [];
    const pdf = doc.pdf!;
    for (let i = 1; i <= pdf.numPages; i++) {
      const anns = await (await pdf.getPage(i)).getAnnotations();
      for (const a of anns as any[]) {
        const t = a.subtype as string;
        if (!TYPES[t]) continue;
        const col = a.color ? `rgb(${a.color[0]},${a.color[1]},${a.color[2]})` : undefined;
        out.push({ id: a.id, page: i, type: t, author: a.titleObj?.str || '', text: a.contentsObj?.str || a.textContent?.join(' ') || '', date: fmtDate(a.modificationDate || a.creationDate), color: col });
      }
    }
    items = out; loading = false;
  }
  function fmtDate(d?: string) {
    const m = d && d.match(/D:(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?/);
    if (!m) return '';
    const dt = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
    return dt.toLocaleString(intlLocale(), { dateStyle: 'short', timeStyle: 'short' });
  }
  $effect(() => { doc.rev; load(); });

  // Elemente auf den Seiten, die beim Speichern zu Anmerkungen werden – sofort in der Liste
  const OBJ_TYPE: Record<string, string> = { note: 'Text', comment: 'FreeText', highlight: 'Highlight', underline: 'Underline', strike: 'StrikeOut', ink: 'Ink', rect: 'Square', ellipse: 'Circle', line: 'Line', arrow: 'Line' };
  const live = $derived(itemsOf(doc).filter(o => OBJ_TYPE[o.kind]).map((o: any): C => ({
    id: 'obj:' + o.id, obj: o.id, page: o.page + 1, type: OBJ_TYPE[o.kind], author: app.prefs.author || '', text: o.text || '', date: '', color: o.color || o.stroke,
  })));
  const all = $derived([...items, ...live].sort((a, b) => a.page - b.page));
  const shown = $derived(all.filter(c => !filter || (c.text + ' ' + c.author + ' ' + TYPES[c.type]).toLowerCase().includes(filter.toLowerCase())));

  async function remove(c: C) {
    if (c.obj) { removeItem(doc, c.obj); return; }
    const r = await withBusy(L("Kommentar wird gelöscht"), async () => {
      const pl = await plLoad(await doc.baked());
      const page = pl.getPage(c.page - 1); const arr = page.node.Annots();
      const num = parseInt(c.id, 10);
      if (arr) for (let k = arr.size() - 1; k >= 0; k--) { const ref: any = arr.get(k); if (ref?.objectNumber === num) arr.remove(k); }
      return plSave(pl);
    });
    await applyResult({ bytes: r, label: L("{0} gelöscht", TYPES[c.type]) });
  }
</script>

<div class="box">
  <input class="input" type="search" placeholder={L("Kommentare filtern")} bind:value={filter} />
</div>
<div class="list scroll">
  {#if loading}<p class="empty">{L("Lädt …")}</p>
  {:else if !shown.length}
    {#if all.length}<Empty icon={I.SearchX} title={L("Keine Treffer")} text={L("Kein Kommentar passt zum Filter.")} />
    {:else}<Empty icon={I.MessagesSquare} title={L("Noch keine Kommentare")} text={L("Markierungen, Notizen und Textkommentare erscheinen hier – mit Seite und Autor.")}><button class="btn sm" onclick={() => openTool('highlight')}><I.Highlighter size={13} />{L("Markieren")}</button><button class="btn sm" onclick={() => openTool('note')}><I.StickyNote size={13} />{L("Notiz")}</button></Empty>{/if}
  {:else}
    {#each shown as c (c.id + c.page)}
      <div class="c" role="button" tabindex="0" onclick={() => viewer.goto(c.page)} onkeydown={e => e.key === 'Enter' && viewer.goto(c.page)}>
        <div class="head">
          <span class="sw" style:background={c.color || 'var(--text-3)'}></span>
          <span class="type">{TYPES[c.type]}</span>
          <span class="pg num">S. {c.page}</span>
          <button class="del" aria-label={L("Kommentar löschen")} title={L("Löschen")} onclick={e => { e.stopPropagation(); remove(c); }}><I.Trash2 size={12} /></button>
        </div>
        {#if c.text}<p class="text">{c.text}</p>{/if}
        {#if c.author || c.date}<p class="meta">{c.author}{c.author && c.date ? ' · ' : ''}{c.date}</p>{/if}
      </div>
    {/each}
  {/if}
</div>

<style>
  .box { padding: 0 12px 8px; }
  .list { flex: 1; padding: 0 10px 12px; display: flex; flex-direction: column; gap: 6px; }
  .c { background: var(--surface); border-radius: 8px; padding: 8px 10px; box-shadow: var(--shadow-1); display: flex; flex-direction: column; gap: 4px; }
  .c:hover { box-shadow: var(--shadow-1), 0 0 0 1px var(--accent-soft); }
  .head { display: flex; align-items: center; gap: 7px; }
  .sw { width: 8px; height: 8px; border-radius: 2px; flex: none; }
  .type { font-weight: 600; font-size: 12px; flex: 1; }
  .pg { font-size: 11px; color: var(--text-3); }
  .del { border: 0; background: none; width: 20px; height: 20px; border-radius: 4px; display: grid; place-items: center; color: var(--text-3); opacity: 0; }
  .c:hover .del { opacity: 1; }
  .del:hover { color: var(--danger); background: var(--hover); }
  .text { margin: 0; font-size: 12.5px; line-height: 1.45; white-space: pre-wrap; overflow-wrap: anywhere; user-select: text; }
  .meta { margin: 0; font-size: 11px; color: var(--text-3); }
</style>
