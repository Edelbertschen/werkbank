<script lang="ts">
  import { app, active, savePrefs, type RibbonTab } from '../lib/app.svelte';
  import { RIBBON, type RibbonItem } from '../lib/ribbon';
  import RibbonButton from './RibbonButton.svelte';
  import ZoomField from './ZoomField.svelte';
  import StyleControls from './StyleControls.svelte';
  import * as I from '../lib/icons';
  import { tick } from 'svelte';
  import { tool, hasTool } from '../lib/tools';

  const doc = $derived(active());
  const collapsed = $derived(app.prefs.ribbonCollapsed && !app.ribbonPeek);
  const tabDef = $derived(RIBBON.find(t => t.id === app.tab) || RIBBON[0]);

  function pickTab(id: RibbonTab) {
    if (app.backstage) app.backstage = false;
    if (app.prefs.ribbonCollapsed) app.ribbonPeek = app.tab === id ? !app.ribbonPeek : true;
    app.tab = id;
  }
  function toggleCollapse() { app.prefs.ribbonCollapsed = !app.prefs.ribbonCollapsed; app.ribbonPeek = false; savePrefs(); }

  /** Kleine Schaltflächen in Spalten zu je drei stapeln */
  function columns(items: RibbonItem[], large: string[] = []) {
    const out: { kind: 'large' | 'stack' | 'custom'; items: RibbonItem[] }[] = [];
    let stack: RibbonItem[] = [];
    const flush = () => { if (stack.length) { out.push({ kind: 'stack', items: stack }); stack = []; } };
    for (const it of items) {
      if (typeof it === 'object' && 'custom' in it) { flush(); out.push({ kind: 'custom', items: [it] }); continue; }
      const id = typeof it === 'string' ? it : it.id;
      if (large.includes(id)) { flush(); out.push({ kind: 'large', items: [it] }); continue; }
      stack.push(it);
      if (stack.length === 3) flush();
    }
    flush();
    return out;
  }
  const idOf = (it: RibbonItem) => (typeof it === 'string' ? it : 'id' in it ? it.id : '');
  const iconOf = (g: { items: RibbonItem[] }) => { const id = g.items.map(idOf).find(x => x && hasTool(x)); return id ? tool(id).icon : I.ChevronDown; };

  // Zu wenig Platz: Gruppen von rechts nach links zu einer Schaltfläche mit Ausklappmenü zusammenfalten
  let body: HTMLDivElement | undefined = $state();
  let foldFrom = $state(Infinity);
  let popGroup = $state<number | null>(null);
  let popX = $state(0), popY = $state(0);
  let measuring = false;
  async function measure() {
    if (!body || measuring) return;
    measuring = true;
    foldFrom = Infinity; popGroup = null;
    await tick();
    let n = tabDef.groups.length;
    while (body && body.scrollWidth > body.clientWidth + 1 && n > 1) { n--; foldFrom = n; await tick(); }
    measuring = false;
  }
  $effect(() => {
    tabDef; collapsed;
    if (!body) return;
    measure();
    let raf = 0, lastW = body.clientWidth;
    const ro = new ResizeObserver(() => { if (!body || Math.abs(body.clientWidth - lastW) < 2) return; lastW = body.clientWidth; cancelAnimationFrame(raf); raf = requestAnimationFrame(measure); });
    ro.observe(body);
    // Schriften laden nach – danach stimmen die Breiten erst
    document.fonts?.ready.then(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure); });
    return () => { ro.disconnect(); cancelAnimationFrame(raf); };
  });
  function openPop(i: number, e: MouseEvent) {
    if (popGroup === i) { popGroup = null; return; }
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    popX = Math.max(8, Math.min(r.left, innerWidth - 420)); popY = r.bottom + 22;
    popGroup = i;
  }
</script>

<svelte:window onmousedown={e => { const el = e.target as HTMLElement; if (app.ribbonPeek && !el.closest('.ribbon')) app.ribbonPeek = false; if (popGroup !== null && !el.closest('.gpop, .fold')) popGroup = null; }}
  onkeydown={e => { if (e.key === 'Escape' && popGroup !== null) popGroup = null; }} />

{#snippet groupBody(g: (typeof tabDef.groups)[number])}
  <div class="cols">
    {#each columns(g.items, g.large) as col, ci (ci)}
      {#if col.kind === 'large'}
        <RibbonButton id={idOf(col.items[0])} size="L" />
      {:else if col.kind === 'stack'}
        <div class="stack">{#each col.items as it (idOf(it))}<RibbonButton id={idOf(it)} size="s" />{/each}</div>
      {:else}
        {@const c = (col.items[0] as any).custom}
        {#if c === 'zoom'}<ZoomField />{:else}<StyleControls kind={c} />{/if}
      {/if}
    {/each}
  </div>
{/snippet}

<div class="ribbon" class:collapsed class:peek={app.ribbonPeek}>
  <div class="tabrow" role="tablist">
    {#each RIBBON as t (t.id)}
      <button role="tab" class="rtab" class:on={app.tab === t.id && !app.backstage} aria-selected={app.tab === t.id} onclick={() => pickTab(t.id)} ondblclick={toggleCollapse}>{t.label}</button>
    {/each}
    <span class="spacer"></span>
    {#if doc && (app.mode !== 'select' && app.mode !== 'hand')}
      <span class="modechip"><span class="pulse"></span>{({ 'text:edit': 'Text bearbeiten', 'text:add': 'Text hinzufügen', image: 'Bild platzieren', sign: 'Unterschrift platzieren', stamp: 'Stempel setzen', redact: 'Schwärzen', whiteout: 'Abdecken', link: 'Link', note: 'Notiz', 'shape:rect': 'Rechteck', 'shape:ellipse': 'Ellipse', 'shape:line': 'Linie', 'shape:arrow': 'Pfeil', 'pdfjs:freetext': 'Textkommentar', 'pdfjs:ink': 'Freihand', 'pdfjs:highlight': 'Textmarker', 'markup:underline': 'Unterstreichen', 'markup:strike': 'Durchstreichen', 'field:text': 'Textfeld', 'field:check': 'Kontrollkästchen', 'field:radio': 'Optionsfeld', 'field:choice': 'Auswahlliste', 'field:signature': 'Unterschriftsfeld' } as Record<string, string>)[app.mode] || app.mode}
        <button onclick={() => (app.mode = 'select')} aria-label="Modus beenden" title="Beenden (Esc)"><I.X size={11} strokeWidth={2.2} /></button></span>
    {/if}
    <button class="collapse" onclick={toggleCollapse} title={app.prefs.ribbonCollapsed ? 'Bandleiste anheften' : 'Bandleiste ausblenden'} aria-label="Bandleiste ein- oder ausblenden">
      {#if app.prefs.ribbonCollapsed}<I.ChevronDown size={14} />{:else}<I.ChevronUp size={14} />{/if}
    </button>
  </div>
  {#if !collapsed}
    <div class="body" role="toolbar" aria-label={tabDef.label} bind:this={body}>
      {#each tabDef.groups as g, gi (g.label)}
        {#if gi >= foldFrom}
          {@const Ic = iconOf(g)}
          <section class="group">
            <div class="cols"><button class="fold" class:on={popGroup === gi} onclick={e => openPop(gi, e)} aria-expanded={popGroup === gi} aria-label={g.label}>
              <span class="ic"><Ic size={22} strokeWidth={1.5} /></span><span class="lb">{g.label}<I.ChevronDown size={10} /></span></button></div>
            <div class="glabel">&nbsp;</div>
          </section>
        {:else}
          <section class="group">
            {@render groupBody(g)}
            <div class="glabel">{g.label}</div>
          </section>
        {/if}
      {/each}
    </div>
    {#if popGroup !== null && tabDef.groups[popGroup]}
      {@const g = tabDef.groups[popGroup]}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div class="gpop" style:left={popX + 'px'} style:top={popY + 'px'} role="dialog" tabindex="-1" aria-label={g.label} onclick={e => { if ((e.target as HTMLElement).closest('.rb')) popGroup = null; }}>
        <section class="group">{@render groupBody(g)}<div class="glabel">{g.label}</div></section>
      </div>
    {/if}
  {/if}
</div>

<style>
  .ribbon { background: var(--bar); border-bottom: 0.5px solid var(--line); position: relative; z-index: 20; }
  .ribbon.peek { box-shadow: 0 10px 24px rgba(0, 0, 0, 0.12); }
  .tabrow { display: flex; align-items: center; gap: 2px; height: 32px; padding: 0 10px; border-bottom: 0.5px solid var(--line); background: var(--win); }
  .rtab { border: 0; background: none; height: 24px; padding: 0 11px; border-radius: 6px; color: var(--text-2); font-weight: 500; white-space: nowrap; }
  .rtab:hover { color: var(--text); background: var(--hover); }
  .rtab.on { color: var(--accent-text); background: var(--accent-softer); }
  .spacer { flex: 1; }
  .collapse { border: 0; background: none; width: 24px; height: 24px; border-radius: 6px; color: var(--text-3); display: grid; place-items: center; }
  .collapse:hover { background: var(--hover); color: var(--text); }
  .modechip { display: inline-flex; align-items: center; gap: 7px; height: 22px; padding: 0 4px 0 9px; border-radius: 11px; background: var(--accent-soft); color: var(--accent-text); font-size: 11.5px; font-weight: 600; margin-right: 6px; }
  .modechip button { border: 0; background: none; color: inherit; width: 16px; height: 16px; border-radius: 8px; display: grid; place-items: center; }
  .modechip button:hover { background: var(--accent-soft); }
  .pulse { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); animation: pulse 1.6s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: 0.35; } }
  .body { display: flex; align-items: stretch; height: 96px; padding: 5px 8px 0; overflow: hidden; }
  .group { display: flex; flex-direction: column; padding: 0 8px; position: relative; flex: none; }
  .group + .group::before { content: ''; position: absolute; left: 0; top: 4px; bottom: 8px; width: 0.5px; background: var(--line-strong); }
  .cols { display: flex; gap: 2px; flex: 1; min-height: 0; align-items: flex-start; }
  .fold { border: 0; background: none; color: var(--text); border-radius: 6px; display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 58px; min-height: 66px; padding: 6px 6px 4px; }
  .fold:hover, .fold.on { background: var(--hover); }
  .fold .ic { height: 26px; display: grid; place-items: center; }
  .fold .lb { font-size: 11px; line-height: 1.18; display: inline-flex; align-items: center; gap: 2px; white-space: nowrap; }
  .gpop { position: fixed; z-index: 60; background: var(--bar); border-radius: 10px; box-shadow: var(--shadow-pop, 0 12px 32px rgba(0,0,0,.18)), 0 0 0 0.5px var(--line-strong); padding: 6px 4px 0; height: 96px; display: flex; animation: pop-in 0.12s ease-out; }
  .stack { display: flex; flex-direction: column; gap: 1px; padding-top: 1px; }
  .glabel { font-size: 10.5px; color: var(--text-3); text-align: center; padding: 1px 0 5px; white-space: nowrap; letter-spacing: 0.01em; }
</style>
