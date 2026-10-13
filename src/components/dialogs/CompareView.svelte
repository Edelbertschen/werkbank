<script lang="ts">
  import { onMount } from 'svelte';
  import { openPdf, renderPage, pageTexts, type PDFDocumentProxy } from '../../lib/pdf';
  import { diffWordsWithSpace } from 'diff';
  import * as I from '../../lib/icons';

  let { a, b, done }: { a: { name: string; bytes: Uint8Array }; b: { name: string; bytes: Uint8Array }; done: (r: any) => void; title?: string } = $props();
  let A: PDFDocumentProxy | null = null, B: PDFDocumentProxy | null = null;
  let mode = $state<'side' | 'diff' | 'text'>('side');
  let page = $state(0);
  let max = $state(1);
  let summary = $state<number[]>([]);
  let left: HTMLDivElement | undefined = $state(), right: HTMLDivElement | undefined = $state(), single: HTMLDivElement | undefined = $state();
  let textHtml = $state('');
  let changedPct = $state(0);
  let loading = $state(true);
  let textsA: string[] = [], textsB: string[] = [];

  onMount(() => {
    (async () => {
      A = await openPdf(a.bytes); B = await openPdf(b.bytes);
      max = Math.max(A.numPages, B.numPages);
      textsA = await pageTexts(A); textsB = await pageTexts(B);
      // Grobe Übersicht je Seite: Textabweichung
      summary = [...Array(max).keys()].map(i => {
        const x = (textsA[i] || '').replace(/\s+/g, ' ').trim(), y = (textsB[i] || '').replace(/\s+/g, ' ').trim();
        if (x === y) return 0;
        const d = diffWordsWithSpace(x, y); let ch = 0, all = 0;
        for (const p of d) { all += p.value.length; if (p.added || p.removed) ch += p.value.length; }
        return all ? Math.max(1, Math.round((ch / all) * 100)) : 100;
      });
      loading = false;
      draw();
    })();
    return () => { A?.destroy(); B?.destroy(); };
  });

  async function canvasFor(doc: PDFDocumentProxy | null, n: number, w: number) {
    if (!doc || n >= doc.numPages) return null;
    return renderPage(doc, n + 1, { width: w });
  }
  async function draw() {
    if (loading) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    if (mode === 'side') {
      const w = Math.max(300, (left?.clientWidth || 500) - 8) * dpr;
      const [ca, cb] = await Promise.all([canvasFor(A, page, w), canvasFor(B, page, w)]);
      left!.replaceChildren(ca || note('Seite fehlt in dieser Fassung'));
      right!.replaceChildren(cb || note('Seite fehlt in dieser Fassung'));
    } else if (mode === 'diff') {
      const w = Math.max(400, Math.min(1100, (single?.clientWidth || 800) - 8)) * dpr;
      const [ca, cb] = await Promise.all([canvasFor(A, page, w), canvasFor(B, page, w)]);
      if (!ca || !cb) { single!.replaceChildren(note('Diese Seite gibt es nur in einer Fassung.')); changedPct = 100; return; }
      const out = document.createElement('canvas'); out.width = ca.width; out.height = ca.height;
      const o = out.getContext('2d', { willReadFrequently: true })!;
      o.drawImage(ca, 0, 0); const da = o.getImageData(0, 0, out.width, out.height);
      o.clearRect(0, 0, out.width, out.height); o.drawImage(cb, 0, 0, out.width, out.height); const db = o.getImageData(0, 0, out.width, out.height);
      const r = o.createImageData(out.width, out.height); let diff = 0;
      for (let k = 0; k < da.data.length; k += 4) {
        const d = Math.abs(da.data[k] - db.data[k]) + Math.abs(da.data[k + 1] - db.data[k + 1]) + Math.abs(da.data[k + 2] - db.data[k + 2]);
        const ga = da.data[k] * 0.3 + da.data[k + 1] * 0.59 + da.data[k + 2] * 0.11, gb = db.data[k] * 0.3 + db.data[k + 1] * 0.59 + db.data[k + 2] * 0.11;
        if (d > 60) { diff++; const removed = ga < gb; r.data[k] = removed ? 222 : 28; r.data[k + 1] = removed ? 46 : 100; r.data[k + 2] = removed ? 46 : 230; r.data[k + 3] = 255; }
        else { const l = 255 - (255 - Math.min(ga, gb)) * 0.25; r.data[k] = r.data[k + 1] = r.data[k + 2] = l; r.data[k + 3] = 255; }
      }
      o.putImageData(r, 0, 0);
      changedPct = (diff / (da.data.length / 4)) * 100;
      single!.replaceChildren(out);
    } else {
      const x = textsA[page] || '', y = textsB[page] || '';
      const esc = (s: string) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
      textHtml = diffWordsWithSpace(x, y).map(p => p.added ? `<ins>${esc(p.value)}</ins>` : p.removed ? `<del>${esc(p.value)}</del>` : esc(p.value)).join('') || '<em>Kein Text auf dieser Seite.</em>';
    }
  }
  function note(t: string) { const d = document.createElement('div'); d.className = 'miss'; d.textContent = t; return d; }
  $effect(() => { mode; page; draw(); });
  const changedPages = $derived(summary.map((s, i) => [i, s] as const).filter(([, s]) => s > 0));
  function key(e: KeyboardEvent) { if (e.key === 'ArrowRight' || e.key === 'PageDown') page = Math.min(max - 1, page + 1); if (e.key === 'ArrowLeft' || e.key === 'PageUp') page = Math.max(0, page - 1); }
</script>

<svelte:window onkeydown={key} />

<div class="cv">
  <header>
    <h2>Vergleich</h2>
    <div class="seg"><button aria-pressed={mode === 'side'} onclick={() => (mode = 'side')}>Nebeneinander</button><button aria-pressed={mode === 'diff'} onclick={() => (mode = 'diff')}>Unterschiede</button><button aria-pressed={mode === 'text'} onclick={() => (mode = 'text')}>Text</button></div>
    <span class="grow"></span>
    <button class="btn sm icon" aria-label="Vorherige Seite" disabled={page <= 0} onclick={() => (page = Math.max(0, page - 1))}><I.ChevronLeft size={14} /></button>
    <span class="num pg">Seite {page + 1} von {max}</span>
    <button class="btn sm icon" aria-label="Nächste Seite" disabled={page >= max - 1} onclick={() => (page = Math.min(max - 1, page + 1))}><I.ChevronRight size={14} /></button>
    <button class="btn sm" onclick={() => done(null)}>Schließen</button>
  </header>
  <div class="main">
    <aside class="side scroll">
      <h3>Geänderte Seiten</h3>
      {#if loading}<p class="muted">Wird analysiert …</p>
      {:else if !changedPages.length}<p class="muted">Der Text ist auf allen Seiten gleich. Unterschiede in Bildern zeigt „Unterschiede“.</p>
      {:else}
        {#each changedPages as [i, s] (i)}<button class:on={i === page} onclick={() => (page = i)}><span>Seite {i + 1}</span><span class="bar"><i style:width={Math.min(100, s) + '%'}></i></span></button>{/each}
      {/if}
    </aside>
    <div class="stage scroll">
      {#if loading}<p class="muted center">Fassungen werden geladen …</p>
      {:else if mode === 'side'}
        <div class="two">
          <figure><figcaption title={a.name}>Älter · {a.name}</figcaption><div class="cvs" bind:this={left}></div></figure>
          <figure><figcaption title={b.name}>Neuer · {b.name}</figcaption><div class="cvs" bind:this={right}></div></figure>
        </div>
      {:else if mode === 'diff'}
        <figure><figcaption>{changedPct < 0.01 ? 'Keine sichtbaren Unterschiede' : `${changedPct.toLocaleString('de-DE', { maximumFractionDigits: 2 })} % der Fläche verändert`} · <span class="red">rot = entfernt</span> · <span class="blue">blau = neu</span></figcaption><div class="cvs" bind:this={single}></div></figure>
      {:else}
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        <div class="text">{@html textHtml}</div>
      {/if}
    </div>
  </div>
</div>

<style>
  .cv { display: flex; flex-direction: column; height: min(84vh, 900px); margin: -20px -20px -16px; }
  header { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-bottom: 0.5px solid var(--line); }
  h2 { margin: 0; font: 600 15px var(--font-display); }
  .grow { flex: 1; }
  .pg { font-size: 12px; color: var(--text-2); min-width: 100px; text-align: center; }
  .main { flex: 1; display: flex; min-height: 0; }
  .side { width: 190px; flex: none; border-right: 0.5px solid var(--line); padding: 10px; background: var(--panel); }
  h3 { margin: 0 0 8px; font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-3); }
  .side button { width: 100%; display: flex; flex-direction: column; gap: 4px; border: 0; background: none; padding: 6px 8px; border-radius: 6px; text-align: left; font-size: 12px; }
  .side button:hover { background: var(--hover); }
  .side button.on { background: var(--accent-soft); }
  .bar { height: 3px; border-radius: 2px; background: var(--selected); overflow: hidden; }
  .bar i { display: block; height: 100%; background: var(--brand); }
  .muted { color: var(--text-3); font-size: 12px; margin: 0; }
  .center { text-align: center; padding: 40px; }
  .stage { flex: 1; min-width: 0; background: var(--canvas); padding: 16px; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  figure { margin: 0; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  figcaption { font-size: 12px; color: var(--text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .red { color: #d23; } .blue { color: #26e; }
  .cvs { min-width: 0; }
  .cvs :global(canvas) { max-width: 100%; height: auto; display: block; background: #fff; box-shadow: var(--shadow-page); margin: 0 auto; }
  .cvs :global(.miss) { padding: 40px; text-align: center; color: var(--text-3); background: var(--surface); border-radius: 6px; }
  .text { background: var(--surface); padding: 18px 22px; border-radius: 8px; box-shadow: var(--shadow-1); white-space: pre-wrap; line-height: 1.6; font-size: 13px; max-width: 860px; margin: 0 auto; user-select: text; }
  .text :global(ins) { background: rgba(38, 102, 238, 0.16); color: #1747b8; text-decoration: none; border-radius: 2px; }
  .text :global(del) { background: rgba(222, 46, 46, 0.14); color: #b02020; border-radius: 2px; }
</style>
