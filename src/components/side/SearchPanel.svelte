<script lang="ts">
  import Empty from '../Empty.svelte';
  import { openTool } from '../../lib/ui.svelte';
  import { L } from '../../lib/i18n';
  import type { Doc } from '../../lib/doc.svelte';
  import { viewer } from '../../lib/viewer.svelte';
  import { pageTexts } from '../../lib/pdf';
  import { app } from '../../lib/app.svelte';
  import * as I from '../../lib/icons';

  let { doc }: { doc: Doc } = $props();
  let q = $state(app.findQuery);
  let caseS = $state(false);
  let word = $state(false);
  let texts: string[] | null = null;
  let textsRev = -1;
  let results = $state<{ page: number; snippet: string; at: number }[]>([]);
  let total = $state(0);
  let timer: any;

  async function run() {
    app.findQuery = q;
    if (q.trim().length < 2) { results = []; total = 0; viewer.clearSearch(); return; }
    viewer.search(q, { caseSensitive: caseS, entireWord: word });
    if (!texts || textsRev !== doc.rev) { texts = await pageTexts(doc.pdf!); textsRev = doc.rev; }
    const out: typeof results = []; let n = 0;
    const flags = caseS ? 'g' : 'gi';
    const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(word ? `(?<![\\p{L}\\p{N}])${esc}(?![\\p{L}\\p{N}])` : esc, flags + 'u');
    texts.forEach((t, i) => {
      const flat = t.replace(/\s+/g, ' ');
      for (const m of flat.matchAll(re)) {
        n++;
        if (out.length < 400) {
          const a = Math.max(0, m.index! - 40), b = Math.min(flat.length, m.index! + m[0].length + 60);
          out.push({ page: i + 1, at: m.index! - a, snippet: (a > 0 ? '…' : '') + flat.slice(a, b) + (b < flat.length ? '…' : '') });
        }
      }
    });
    results = out; total = n;
  }
  function onInput() { clearTimeout(timer); timer = setTimeout(run, 220); }
  function key(e: KeyboardEvent) { if (e.key === 'Enter') { e.preventDefault(); viewer.search(q, { again: true, previous: e.shiftKey, caseSensitive: caseS, entireWord: word }); } }
  $effect(() => () => { clearTimeout(timer); });
  $effect(() => { doc.rev; if (q) setTimeout(run, 50); });

  function mark(s: string) {
    const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const html = s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
    return html.replace(new RegExp(esc.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!)), caseS ? 'g' : 'gi'), m => `<mark>${m}</mark>`);
  }
</script>

<div class="box">
  <div class="field">
    <I.Search size={14} strokeWidth={2} />
    <input id="find-input" class="input" type="search" placeholder={L("Im Dokument suchen")} bind:value={q} oninput={onInput} onkeydown={key} />
  </div>
  <div class="opts">
    <label><input type="checkbox" bind:checked={caseS} onchange={run} /> {L("Groß/klein")}</label>
    <label><input type="checkbox" bind:checked={word} onchange={run} /> {L("Ganzes Wort")}</label>
  </div>
  {#if q.trim().length >= 2}
    <div class="nav">
      <span class="count num">{total ? `${viewer.findCurrent || 1} von ${total}` : viewer.findPending ? L("Suche …") : L("Keine Treffer")}</span>
      <button class="btn sm icon" aria-label={L("Vorheriger Treffer")} title={L("Vorheriger (⇧↩)")} disabled={!total} onclick={() => viewer.search(q, { again: true, previous: true, caseSensitive: caseS, entireWord: word })}><I.ChevronUp size={14} /></button>
      <button class="btn sm icon" aria-label={L("Nächster Treffer")} title={L("Nächster (↩)")} disabled={!total} onclick={() => viewer.search(q, { again: true, caseSensitive: caseS, entireWord: word })}><I.ChevronDown size={14} /></button>
    </div>
    {#if total}
      <button class="btn sm redact" onclick={() => (app.pane = { tool: 'find-redact', nonce: Date.now(), values: { terms: q } } as any)}><I.SquareX size={13} />{L("Alle Treffer schwärzen …")}</button>
    {/if}
  {/if}
</div>
<div class="results scroll">
  {#if q.trim().length < 2}
    <Empty icon={I.Search} title={L("Im ganzen Dokument suchen")} text={L("Treffer erscheinen hier mit Textauszug. Enter springt zum nächsten, Umschalt+Enter zurück.")} />
  {:else if !total && !viewer.findPending}
    <Empty icon={I.SearchX} title={L("Nichts gefunden")} text={L("Prüfe die Schreibweise. Gescannte Seiten werden erst nach einer Texterkennung durchsuchbar.")}><button class="btn sm" onclick={() => openTool('ocr')}><I.ScanText size={13} />{L("Text erkennen")}</button></Empty>
  {/if}
  {#each results as r, k (k)}
    <button class="res" onclick={() => viewer.goto(r.page)}>
      <span class="pg">{L("Seite {0}", r.page)}</span>
      <!-- eslint-disable-next-line svelte/no-at-html-tags -->
      <span class="sn">{@html mark(r.snippet)}</span>
    </button>
  {/each}
  {#if total > results.length}<p class="more">{L("… und {0} weitere", total - results.length)}</p>{/if}
</div>

<style>
  .box { padding: 0 12px 10px; display: flex; flex-direction: column; gap: 8px; border-bottom: 0.5px solid var(--line); }
  .field { position: relative; display: flex; align-items: center; }
  .field :global(svg) { position: absolute; left: 8px; color: var(--text-3); }
  .field .input { padding-left: 28px; }
  .opts { display: flex; gap: 12px; font-size: 12px; color: var(--text-2); }
  .opts label { display: flex; gap: 5px; align-items: center; }
  .nav { display: flex; align-items: center; gap: 4px; }
  .count { flex: 1; font-size: 12px; color: var(--text-2); }
  .redact { align-self: flex-start; }
  .results { flex: 1; padding: 6px 8px 12px; }
  .res { width: 100%; border: 0; background: none; text-align: left; padding: 7px 8px; border-radius: 7px; display: flex; flex-direction: column; gap: 2px; }
  .res:hover { background: var(--hover); }
  .pg { font-size: 11px; font-weight: 600; color: var(--text-3); }
  .sn { font-size: 12px; line-height: 1.4; color: var(--text-2); }
  .sn :global(mark) { background: #FFE58A; color: #111; border-radius: 2px; padding: 0 1px; }
  .more { font-size: 11.5px; color: var(--text-3); padding: 4px 8px; }
</style>
