<script lang="ts">
  import type { Doc } from '../../lib/doc.svelte';
  import Thumb from '../Thumb.svelte';
  import Sortable from 'sortablejs';
  import { onMount, tick } from 'svelte';
  import { viewer } from '../../lib/viewer.svelte';
  import { runTool, applyResult, withBusy } from '../../lib/actions';
  import { tool } from '../../lib/tools';
  import { movePages } from '../../lib/tools/pages';
  import { showMenu } from '../../lib/menu.svelte';
  import { openTool } from '../../lib/ui.svelte';
  import { app } from '../../lib/app.svelte';
  import { paperName } from '../../lib/util';
  import * as I from '../../lib/icons';

  let { doc }: { doc: Doc } = $props();
  let list: HTMLDivElement;
  let anchor: number | null = null;

  function select(i: number, e: MouseEvent) {
    const mod = e.metaKey || e.ctrlKey;
    if (e.shiftKey && anchor != null) {
      const [a, b] = [Math.min(anchor, i), Math.max(anchor, i)];
      const r = [...Array(b - a + 1).keys()].map(k => k + a);
      doc.selection = mod ? [...new Set([...doc.selection, ...r])] : r;
    } else if (mod) {
      doc.selection = doc.selection.includes(i) ? doc.selection.filter(x => x !== i) : [...doc.selection, i];
      anchor = i;
    } else { doc.selection = []; anchor = i; viewer.goto(i + 1); }
  }

  onMount(() => {
    const s = Sortable.create(list, {
      animation: 140, ghostClass: 'ghost', chosenClass: 'chosen', delay: 120, delayOnTouchOnly: true, filter: '.nodrag',
      onEnd: async ev => {
        if (ev.oldIndex == null || ev.newIndex == null || ev.oldIndex === ev.newIndex) return;
        const n = doc.numPages; const order = [...Array(n).keys()];
        const moving = doc.selection.length > 1 && doc.selection.includes(ev.oldIndex) ? [...doc.selection].sort((a, b) => a - b) : [ev.oldIndex];
        const rest = order.filter(i => !moving.includes(i));
        // Zielposition in "rest" bestimmen
        const target = ev.newIndex > ev.oldIndex ? ev.newIndex - moving.length + 1 : ev.newIndex;
        rest.splice(Math.max(0, Math.min(rest.length, target)), 0, ...moving);
        // Sortable hat das DOM verändert – Svelte zeichnet nach dem neuen Stand ohnehin neu
        const bytes = await withBusy('Seiten werden verschoben', async () => movePages({ doc, bytes: doc.bytes, current: doc.current - 1, selection: doc.selection, progress: () => {} }, rest));
        await applyResult(bytes);
      },
    });
    return () => s.destroy();
  });

  // Aktuelle Seite sichtbar halten
  $effect(() => {
    const i = doc.current - 1;
    tick().then(() => list?.children[i]?.scrollIntoView({ block: 'nearest' }));
  });

  function ctx(e: MouseEvent, i: number) {
    if (!doc.selection.includes(i)) doc.selection = [i];
    const n = doc.selection.length;
    const t = (id: string) => () => runTool(tool(id));
    showMenu(e, [
      { label: n > 1 ? `${n} Seiten nach links drehen` : 'Nach links drehen', icon: I.RotateCcw, run: t('rotate-left') },
      { label: n > 1 ? `${n} Seiten nach rechts drehen` : 'Nach rechts drehen', icon: I.RotateCw, run: t('rotate-right') },
      { sep: true, label: '' },
      { label: 'Leere Seite danach einfügen', icon: I.FilePlus2, run: async () => { doc.current = Math.max(...doc.selection) + 1; await runTool(tool('insert-blank'), { where: 'after', count: 1, size: 'same' }); } },
      { label: 'Seiten aus Datei danach einfügen …', icon: I.FileUp, run: () => { doc.current = Math.max(...doc.selection) + 1; openTool('insert-file'); } },
      { label: 'Duplizieren', icon: I.Copy, run: () => runTool(tool('duplicate'), { pages: { mode: 'sel', range: '' }, times: 1 }) },
      { label: 'Als neues Dokument extrahieren', icon: I.FileOutput, run: () => runTool(tool('extract'), { pages: { mode: 'sel', range: '' }, each: false, remove: false }) },
      { sep: true, label: '' },
      { label: n > 1 ? `${n} Seiten löschen` : 'Seite löschen', icon: I.Trash2, danger: true, disabled: n >= doc.numPages, run: t('delete-pages') },
    ]);
  }
</script>

<div class="thumbs scroll" bind:this={list} role="listbox" aria-label="Seiten" aria-multiselectable="true">
  {#each doc.pages as p, i (doc.rev + ':' + i)}
    <div class="item" class:cur={doc.current === i + 1} class:sel={doc.selection.includes(i)} role="option" aria-selected={doc.selection.includes(i)} tabindex="-1"
      onclick={e => select(i, e)} oncontextmenu={e => ctx(e, i)} ondblclick={() => { app.organize = false; viewer.goto(i + 1); }} onkeydown={() => {}}>
      <div class="frame"><Thumb {doc} index={i} width={150} /></div>
      <div class="cap"><span class="num">{i + 1}</span>{#if p.rot}<span class="rot">{p.rot}°</span>{/if}<span class="paper">{paperName(p.w, p.h)}</span></div>
    </div>
  {/each}
</div>

<style>
  .thumbs { flex: 1; padding: 6px 20px 24px; display: flex; flex-direction: column; gap: 14px; }
  .item { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 8px 8px 6px; border-radius: 9px; }
  .item:hover { background: var(--hover); }
  .frame { width: 100%; max-width: 150px; border-radius: 3px; outline: 2px solid transparent; outline-offset: 3px; }
  .item.cur .frame { outline-color: var(--line-strong); }
  .item.sel { background: var(--accent-softer); }
  .item.sel .frame { outline-color: var(--accent); }
  .cap { display: flex; gap: 6px; align-items: center; font-size: 11px; color: var(--text-2); }
  .num { font-weight: 600; font-variant-numeric: tabular-nums; }
  .item.cur .num { color: var(--accent-text); }
  .rot { font-size: 10px; padding: 0 4px; border-radius: 3px; background: var(--selected); }
  .paper { color: var(--text-3); }
  :global(.thumbs .ghost) { opacity: 0.3; }
  :global(.thumbs .chosen .frame) { outline-color: var(--accent) !important; }
</style>
