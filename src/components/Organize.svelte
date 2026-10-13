<script lang="ts">
  import type { Doc } from '../lib/doc.svelte';
  import Thumb from './Thumb.svelte';
  import Sortable from 'sortablejs';
  import { onMount } from 'svelte';
  import { app } from '../lib/app.svelte';
  import { viewer } from '../lib/viewer.svelte';
  import { runTool, applyResult, withBusy } from '../lib/actions';
  import { tool } from '../lib/tools';
  import { movePages } from '../lib/tools/pages';
  import { openTool } from '../lib/ui.svelte';
  import { showMenu } from '../lib/menu.svelte';
  import { paperName } from '../lib/util';
  import * as I from '../lib/icons';

  let { doc }: { doc: Doc } = $props();
  let grid: HTMLDivElement;
  let size = $state(170);
  let anchor: number | null = null;
  const sel = $derived(doc.selection);
  const ctx = () => ({ doc, bytes: doc.bytes, current: doc.current - 1, selection: doc.selection, progress: () => {} });

  function select(i: number, e: MouseEvent) {
    const mod = e.metaKey || e.ctrlKey;
    if (e.shiftKey && anchor != null) {
      const [a, b] = [Math.min(anchor, i), Math.max(anchor, i)];
      const r = [...Array(b - a + 1).keys()].map(k => k + a);
      doc.selection = mod ? [...new Set([...doc.selection, ...r])] : r;
    } else if (mod) { doc.selection = doc.selection.includes(i) ? doc.selection.filter(x => x !== i) : [...doc.selection, i]; anchor = i; }
    else { doc.selection = [i]; anchor = i; }
    doc.current = i + 1;
  }
  function open(i: number) { app.organize = false; setTimeout(() => viewer.goto(i + 1), 50); }

  onMount(() => {
    const s = Sortable.create(grid, {
      animation: 160, ghostClass: 'ghost', chosenClass: 'chosen', delay: 120, delayOnTouchOnly: true,
      onEnd: async ev => {
        if (ev.oldIndex == null || ev.newIndex == null || ev.oldIndex === ev.newIndex) return;
        const n = doc.numPages;
        const moving = doc.selection.length > 1 && doc.selection.includes(ev.oldIndex) ? [...doc.selection].sort((a, b) => a - b) : [ev.oldIndex];
        const rest = [...Array(n).keys()].filter(i => !moving.includes(i));
        const target = ev.newIndex > ev.oldIndex ? ev.newIndex - moving.length + 1 : ev.newIndex;
        rest.splice(Math.max(0, Math.min(rest.length, target)), 0, ...moving);
        const r = await withBusy('Seiten werden verschoben', () => movePages(ctx(), rest));
        await applyResult(r);
      },
    });
    return () => s.destroy();
  });

  function key(e: KeyboardEvent) {
    if ((e.target as HTMLElement).closest('input,textarea')) return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); doc.selection = [...Array(doc.numPages).keys()]; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel.length) { e.preventDefault(); runTool(tool('delete-pages')); }
  }
  async function moveTo(where: 'start' | 'end') {
    const s = [...doc.selection].sort((a, b) => a - b);
    const rest = [...Array(doc.numPages).keys()].filter(i => !s.includes(i));
    const order = where === 'start' ? [...s, ...rest] : [...rest, ...s];
    await applyResult(await withBusy('Seiten werden verschoben', () => movePages(ctx(), order)));
  }
  function ctxMenu(e: MouseEvent, i: number) {
    if (!doc.selection.includes(i)) doc.selection = [i];
    const n = doc.selection.length;
    showMenu(e, [
      { label: 'Öffnen', icon: I.BookOpen, run: () => open(i) },
      { sep: true, label: '' },
      { label: 'Nach links drehen', icon: I.RotateCcw, run: () => runTool(tool('rotate-left')) },
      { label: 'Nach rechts drehen', icon: I.RotateCw, run: () => runTool(tool('rotate-right')) },
      { label: 'An den Anfang', icon: I.ChevronUp, run: () => moveTo('start') },
      { label: 'Ans Ende', icon: I.ChevronDown, run: () => moveTo('end') },
      { label: 'Duplizieren', icon: I.Copy, run: () => runTool(tool('duplicate'), { pages: { mode: 'sel', range: '' }, times: 1 }) },
      { label: 'Extrahieren', icon: I.FileOutput, run: () => runTool(tool('extract'), { pages: { mode: 'sel', range: '' }, each: false, remove: false }) },
      { sep: true, label: '' },
      { label: n > 1 ? `${n} Seiten löschen` : 'Löschen', icon: I.Trash2, danger: true, disabled: n >= doc.numPages, run: () => runTool(tool('delete-pages')) },
    ]);
  }
</script>

<svelte:window onkeydown={key} />

<div class="org">
  <div class="bar">
    <span class="info num">{sel.length ? `${sel.length} von ${doc.numPages} ausgewählt` : `${doc.numPages} Seiten`}</span>
    <div class="grp">
      <button class="btn sm" onclick={() => (doc.selection = [...Array(doc.numPages).keys()])}>Alle</button>
      <button class="btn sm" onclick={() => (doc.selection = [...Array(doc.numPages).keys()].filter(i => i % 2 === 0))}>Ungerade</button>
      <button class="btn sm" onclick={() => (doc.selection = [...Array(doc.numPages).keys()].filter(i => i % 2 === 1))}>Gerade</button>
      <button class="btn sm" disabled={!sel.length} onclick={() => (doc.selection = [])}>Keine</button>
    </div>
    <span class="sep"></span>
    <div class="grp">
      <button class="btn sm icon" title="Nach links drehen" aria-label="Nach links drehen" disabled={!sel.length} onclick={() => runTool(tool('rotate-left'))}><I.RotateCcw size={14} /></button>
      <button class="btn sm icon" title="Nach rechts drehen" aria-label="Nach rechts drehen" disabled={!sel.length} onclick={() => runTool(tool('rotate-right'))}><I.RotateCw size={14} /></button>
      <button class="btn sm" disabled={!sel.length} onclick={() => runTool(tool('duplicate'), { pages: { mode: 'sel', range: '' }, times: 1 })}><I.Copy size={13} />Duplizieren</button>
      <button class="btn sm" disabled={!sel.length} onclick={() => runTool(tool('extract'), { pages: { mode: 'sel', range: '' }, each: false, remove: false })}><I.FileOutput size={13} />Extrahieren</button>
      <button class="btn sm" onclick={() => runTool(tool('insert-blank'), { where: 'after', count: 1, size: 'same' })}><I.FilePlus2 size={13} />Leere Seite</button>
      <button class="btn sm" onclick={() => openTool('insert-file')}><I.FileUp size={13} />Einfügen</button>
      <button class="btn sm danger" disabled={!sel.length || sel.length >= doc.numPages} onclick={() => runTool(tool('delete-pages'))}><I.Trash2 size={13} />Löschen</button>
    </div>
    <span class="grow"></span>
    <label class="zoom" title="Vorschaugröße"><I.ZoomOut size={13} /><input type="range" min="100" max="320" bind:value={size} aria-label="Vorschaugröße" /><I.ZoomIn size={13} /></label>
    <button class="btn sm primary" onclick={() => (app.organize = false)}>Fertig</button>
  </div>
  <div class="grid scroll" bind:this={grid} style:--size={size + 'px'} role="listbox" aria-multiselectable="true" aria-label="Seiten">
    {#each doc.pages as p, i (doc.rev + ':' + i)}
      <div class="cell" class:sel={sel.includes(i)} role="option" aria-selected={sel.includes(i)} tabindex="-1"
        onclick={e => select(i, e)} ondblclick={() => open(i)} oncontextmenu={e => ctxMenu(e, i)} onkeydown={() => {}}>
        <div class="frame"><Thumb {doc} index={i} width={Math.max(size, 200)} /></div>
        <div class="cap"><span class="num">{i + 1}</span>{#if p.rot}<span class="rot">{p.rot}°</span>{/if}<span class="paper">{paperName(p.w, p.h)}</span></div>
      </div>
    {/each}
  </div>
  <p class="hint">Ziehen zum Umsortieren · {navigator.platform.includes('Mac') ? '⌘' : 'Strg'}-Klick oder Umschalt-Klick wählt mehrere · Doppelklick öffnet · Entf löscht</p>
</div>

<style>
  .org { position: absolute; inset: 0; display: flex; flex-direction: column; background: var(--canvas); }
  .bar { display: flex; align-items: center; gap: 10px; padding: 8px 14px; background: var(--bar); border-bottom: 0.5px solid var(--line); flex-wrap: wrap; }
  .info { font-size: 12px; color: var(--text-2); min-width: 130px; }
  .grp { display: flex; gap: 4px; flex-wrap: wrap; }
  .sep { width: 0.5px; height: 18px; background: var(--line-strong); }
  .grow { flex: 1; }
  .zoom { display: flex; align-items: center; gap: 6px; color: var(--text-3); }
  .zoom input { width: 100px; accent-color: var(--accent); }
  .grid { flex: 1; display: grid; grid-template-columns: repeat(auto-fill, minmax(var(--size), 1fr)); gap: 26px 20px; padding: 26px 28px 40px; align-content: start; }
  .cell { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 10px 8px 8px; border-radius: 10px; }
  .cell:hover { background: rgba(127, 127, 127, 0.08); }
  .frame { width: 100%; max-width: var(--size); outline: 2.5px solid transparent; outline-offset: 4px; border-radius: 3px; }
  .cell.sel { background: var(--accent-softer); }
  .cell.sel .frame { outline-color: var(--accent); }
  .cap { display: flex; gap: 6px; align-items: center; font-size: 11.5px; color: var(--text-2); }
  .num { font-weight: 600; font-variant-numeric: tabular-nums; }
  .cell.sel .num { color: var(--accent-text); }
  .rot { font-size: 10px; padding: 0 4px; border-radius: 3px; background: var(--selected); }
  .paper { color: var(--text-3); }
  .hint { margin: 0; padding: 6px 14px; font-size: 11.5px; color: var(--text-3); background: var(--bar); border-top: 0.5px solid var(--line); }
  :global(.grid .ghost) { opacity: 0.25; }
</style>
