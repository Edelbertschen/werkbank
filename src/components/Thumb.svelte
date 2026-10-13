<script lang="ts" module>
  // Höchstens drei Vorschauen gleichzeitig rendern (für alle Instanzen gemeinsam)
  let running = 0;
  const waiting: (() => void)[] = [];
  export function queue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((res, rej) => {
      const go = () => { running++; fn().then(res, rej).finally(() => { running--; waiting.shift()?.(); }); };
      running < 3 ? go() : waiting.push(go);
    });
  }
</script>

<script lang="ts">
  import { L } from '../lib/i18n';
  import type { Doc } from '../lib/doc.svelte';
  import { onMount } from 'svelte';

  let { doc, index, width = 150 }: { doc: Doc; index: number; width?: number } = $props();
  let el: HTMLDivElement;
  let url = $state('');
  let visible = $state(false);
  const p = $derived(doc.pages[index]);

  onMount(() => {
    const io = new IntersectionObserver(es => { for (const e of es) visible = e.isIntersecting; }, { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  });

  $effect(() => {
    const rev = doc.rev;
    if (!visible || !doc.pdf || index >= doc.numPages) return;
    let alive = true;
    queue(() => (alive ? doc.thumb(index, width) : Promise.resolve(''))).then(u => { if (alive && u && rev === doc.rev) url = u; }).catch(() => {});
    return () => { alive = false; };
  });
</script>

<div class="thumb" bind:this={el} style:aspect-ratio={p ? `${p.w} / ${p.h}` : '0.707'}>
  {#if url}<img src={url} alt={L("Seite {0}", index + 1)} draggable="false" />{/if}
</div>

<style>
  .thumb { width: 100%; background: #fff; box-shadow: var(--shadow-page); border-radius: 2px; overflow: hidden; }
  img { width: 100%; height: 100%; display: block; object-fit: contain; animation: fade-in 0.15s; }
</style>
