<script lang="ts">
  import { L } from '../lib/i18n';
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
      // Maus statt nativer Drag-Sitzung: Die Desktop-Hülle hielte die native Sitzung für eine Datei von außen
      forceFallback: true, fallbackTolerance: 4,
      onEnd: async ev => {
        if (ev.oldIndex == null || ev.newIndex == null || ev.oldIndex === ev.newIndex) return;
        const n = doc.numPages;
        const moving = doc.selection.length > 1 && doc.selection.includes(ev.oldIndex) ? [...doc.selection].sort((a, b) => a - b) : [ev.oldIndex];
        const rest = [...Array(n).keys()].filter(i => !moving.includes(i));
        const target = ev.newIndex > ev.oldIndex ? ev.newIndex - moving.length + 1 : ev.newIndex;
        rest.splice(Math.max(0, Math.min(rest.length, target)), 0, ...moving);
        const r = await withBusy(L("Seiten werden verschoben"), async () => movePages({ ...ctx(), bytes: await doc.baked() }, rest));
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
    await applyResult(await withBusy(L("Seiten werden verschoben"), async () => movePages({ ...ctx(), bytes: await doc.baked() }, order)));
  }
  function ctxMenu(e: MouseEvent, i: number) {
    if (!doc.selection.includes(i)) doc.selection = [i];
    const n = doc.selection.length;
    showMenu(e, [
      { label: L("Öffnen"), icon: I.BookOpen, run: () => open(i) },
      { sep: true, label: '' },
      { label: L("Nach links drehen"), icon: I.RotateCcw, run: () => runTool(tool('rotate-left')) },
      { label: L("Nach rechts drehen"), icon: I.RotateCw, run: () => runTool(tool('rotate-right')) },
      { label: L("An den Anfang"), icon: I.ChevronUp, run: () => moveTo('start') },
      { label: L("Ans Ende"), icon: I.ChevronDown, run: () => moveTo('end') },
      { label: L("Duplizieren"), icon: I.Copy, run: () => runTool(tool('duplicate'), { pages: { mode: 'sel', range: '' }, times: 1 }) },
      { label: L("Extrahieren"), icon: I.FileOutput, run: () => runTool(tool('extract'), { pages: { mode: 'sel', range: '' }, each: false, remove: false }) },
      { sep: true, label: '' },
      { label: n > 1 ? L("{0} Seiten löschen", n) : L("Löschen"), icon: I.Trash2, danger: true, disabled: n >= doc.numPages, run: () => runTool(tool('delete-pages')) },
    ]);
  }
</script>

<svelte:window onkeydown={key} />

<div class="org">
  <header class="bar">
    <div class="title">
      <h2>{L("Seiten organisieren")}</h2>
      <span class="num">{L("{0} Seiten", doc.numPages)}</span>
    </div>
    <div class="pick" role="group" aria-label={L("Auswählen")}>
      <button onclick={() => (doc.selection = [...Array(doc.numPages).keys()])}>{L("Alle")}</button>
      <button onclick={() => (doc.selection = [...Array(doc.numPages).keys()].filter(i => i % 2 === 0))}>{L("Ungerade")}</button>
      <button onclick={() => (doc.selection = [...Array(doc.numPages).keys()].filter(i => i % 2 === 1))}>{L("Gerade")}</button>
    </div>
    <span class="grow"></span>
    <button class="btn sm ghost" onclick={() => runTool(tool('insert-blank'), { where: 'after', count: 1, size: 'same' })}><I.FilePlus2 size={14} />{L("Leere Seite")}</button>
    <button class="btn sm ghost" onclick={() => openTool('insert-file')}><I.FileUp size={14} />{L("Einfügen")}</button>
    <span class="sep"></span>
    <label class="zoom" title={L("Vorschaugröße")}><I.ZoomOut size={14} /><input type="range" min="100" max="320" bind:value={size} aria-label={L("Vorschaugröße")} /><I.ZoomIn size={14} /></label>
    <button class="btn sm primary" onclick={() => (app.organize = false)}>{L("Fertig")}</button>
  </header>
  <div class="grid scroll" bind:this={grid} data-drop-insert="grid" style:--size={size + 'px'} role="listbox" aria-multiselectable="true" aria-label={L("Seiten")}>
    {#each doc.pages as p, i (doc.rev + ':' + i)}
      <div class="cell" class:sel={sel.includes(i)} role="option" aria-selected={sel.includes(i)} tabindex="-1"
        onclick={e => select(i, e)} ondblclick={() => open(i)} oncontextmenu={e => ctxMenu(e, i)} onkeydown={() => {}}>
        <div class="frame">
          <Thumb {doc} index={i} width={Math.max(size, 200)} />
          {#if sel.includes(i)}<span class="tick"><I.Check size={12} strokeWidth={3} /></span>{/if}
        </div>
        <div class="cap"><span class="num">{i + 1}</span>{#if p.rot}<span class="rot num">{p.rot}°</span>{/if}<span class="paper">{paperName(p.w, p.h)}</span></div>
      </div>
    {/each}
  </div>
  <p class="hint">{L("Ziehen zum Umsortieren · {0}-Klick oder Umschalt-Klick wählt mehrere · Doppelklick öffnet · Entf löscht", navigator.platform.includes('Mac') ? '⌘' : L("Strg"))} · {L("PDFs von außen hineinziehen fügt ihre Seiten ein")}</p>

  {#if sel.length}
    <div class="selbar" role="toolbar" aria-label={L("Auswahl")}>
      <span class="count num">{L("{0} ausgewählt", sel.length)}</span>
      <span class="sep"></span>
      <button class="ib" title={L("Nach links drehen")} aria-label={L("Nach links drehen")} onclick={() => runTool(tool('rotate-left'))}><I.RotateCcw size={15} /></button>
      <button class="ib" title={L("Nach rechts drehen")} aria-label={L("Nach rechts drehen")} onclick={() => runTool(tool('rotate-right'))}><I.RotateCw size={15} /></button>
      <button class="ib" title={L("An den Anfang")} aria-label={L("An den Anfang")} onclick={() => moveTo('start')}><I.ChevronUp size={15} /></button>
      <button class="ib" title={L("Ans Ende")} aria-label={L("Ans Ende")} onclick={() => moveTo('end')}><I.ChevronDown size={15} /></button>
      <span class="sep"></span>
      <button class="tb" onclick={() => runTool(tool('duplicate'), { pages: { mode: 'sel', range: '' }, times: 1 })}><I.Copy size={14} />{L("Duplizieren")}</button>
      <button class="tb" onclick={() => runTool(tool('extract'), { pages: { mode: 'sel', range: '' }, each: false, remove: false })}><I.FileOutput size={14} />{L("Extrahieren")}</button>
      <button class="tb danger" disabled={sel.length >= doc.numPages} onclick={() => runTool(tool('delete-pages'))}><I.Trash2 size={14} />{L("Löschen")}</button>
      <span class="sep"></span>
      <button class="ib" title={L("Auswahl aufheben (Esc)")} aria-label={L("Auswahl aufheben")} onclick={() => (doc.selection = [])}><I.X size={15} /></button>
    </div>
  {/if}
</div>

<style>
  .org { position: absolute; inset: 0; display: flex; flex-direction: column; background: var(--canvas); }
  .bar { display: flex; align-items: center; gap: 8px; padding: 10px 16px 10px 22px; background: var(--bar); border-bottom: 0.5px solid var(--line); flex-wrap: wrap; }
  .title { display: flex; align-items: baseline; gap: 10px; margin-right: 14px; }
  h2 { margin: 0; font: 600 15px/1.2 var(--font-display); letter-spacing: -0.01em; }
  .title .num { font-size: 12px; color: var(--text-3); }
  .pick { display: flex; gap: 2px; padding: 2px; border-radius: 8px; background: var(--hover); }
  .pick button { border: 0; background: none; padding: 3px 10px; border-radius: 6px; font-size: 12px; color: var(--text-2); }
  .pick button:hover { background: var(--surface); color: var(--text); box-shadow: var(--shadow-1); }
  .sep { width: 0.5px; height: 18px; background: var(--line-strong); margin: 0 4px; }
  .grow { flex: 1; }
  .zoom { display: flex; align-items: center; gap: 6px; color: var(--text-3); margin-right: 6px; }
  .zoom input { width: 96px; accent-color: var(--accent); }

  .grid { flex: 1; display: grid; grid-template-columns: repeat(auto-fill, minmax(var(--size), 1fr)); gap: 30px 22px; padding: 30px 32px 120px; align-content: start; }
  .cell { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 6px; border-radius: 12px; cursor: default; }
  .frame { position: relative; width: 100%; max-width: var(--size); border-radius: 3px; box-shadow: 0 0 0 0.5px rgba(14, 28, 30, 0.14), 0 2px 6px rgba(14, 28, 30, 0.08); outline: 2px solid transparent; outline-offset: 5px;
    transition: transform 0.18s var(--ease), box-shadow 0.18s var(--ease), outline-color 0.12s; }
  .cell:hover .frame { transform: translateY(-2px); box-shadow: 0 0 0 0.5px rgba(14, 28, 30, 0.16), 0 8px 20px rgba(14, 28, 30, 0.14); }
  .cell.sel .frame { outline-color: var(--accent); }
  .tick { position: absolute; top: -11px; left: -11px; width: 22px; height: 22px; border-radius: 50%; background: var(--accent); color: var(--on-accent, #fff); display: grid; place-items: center; box-shadow: 0 0 0 2.5px var(--canvas); }
  .cap { display: flex; gap: 7px; align-items: center; font-size: 11.5px; color: var(--text-2); }
  .cap .num { font-weight: 600; min-width: 22px; text-align: center; padding: 1px 6px; border-radius: 999px; }
  .cell.sel .cap .num { background: var(--accent); color: var(--on-accent, #fff); }
  .rot { font-size: 10.5px; padding: 0 5px; border-radius: 4px; background: var(--selected); }
  .paper { color: var(--text-3); }
  .hint { margin: 0; padding: 7px 22px; font-size: 11.5px; color: var(--text-3); background: var(--bar); border-top: 0.5px solid var(--line); }

  /* Auswahlleiste: schwebt über dem Raster, solange etwas ausgewählt ist */
  .selbar { position: absolute; left: 50%; bottom: 52px; transform: translateX(-50%); display: flex; align-items: center; gap: 2px; padding: 5px 6px 5px 14px; border-radius: 14px;
    background: var(--raised); box-shadow: var(--shadow-2), 0 0 0 0.5px var(--line-strong); animation: rise 0.2s var(--ease); white-space: nowrap; z-index: 4; }
  @keyframes rise { from { opacity: 0; transform: translate(-50%, 8px); } }
  .count { font-size: 12.5px; font-weight: 600; color: var(--accent-text); padding-right: 4px; }
  .ib, .tb { border: 0; background: none; height: 30px; border-radius: 8px; color: var(--text-2); display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; }
  .ib { width: 30px; justify-content: center; }
  .tb { padding: 0 10px; }
  .ib:hover, .tb:hover:not(:disabled) { background: var(--hover); color: var(--text); }
  .tb.danger:hover:not(:disabled) { color: var(--danger, #d33); background: color-mix(in srgb, var(--danger, #d33) 10%, transparent); }
  .tb:disabled { opacity: 0.4; }
  :global(.grid .ghost) { opacity: 0.25; }
  :global(.grid .sortable-fallback .frame) { box-shadow: var(--shadow-pop); }
</style>
