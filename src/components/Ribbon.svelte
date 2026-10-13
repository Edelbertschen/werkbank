<script lang="ts">
  import { L } from '../lib/i18n';
  import { app, active, savePrefs, type RibbonTab } from '../lib/app.svelte';
  import { RIBBON, visibleTabs, effectiveTab, type RibbonItem } from '../lib/ribbon';
  import { showMenu } from '../lib/menu.svelte';
  import { openTool } from '../lib/ui.svelte';
  import RibbonButton from './RibbonButton.svelte';
  import ZoomField from './ZoomField.svelte';
  import StyleControls from './StyleControls.svelte';
  import * as I from '../lib/icons';
  import { tick } from 'svelte';
  import { tool, hasTool } from '../lib/tools';

  const doc = $derived(active());
  const collapsed = $derived(app.prefs.ribbonCollapsed && !app.ribbonPeek);
  const tabs = $derived(visibleTabs(app.prefs.hiddenTabs || []));
  const tabDef = $derived(RIBBON.find(t => t.id === effectiveTab(app.tab, app.prefs.hiddenTabs || [])) || RIBBON[0]);
  function tabMenu(e: MouseEvent, id: RibbonTab, label: string) {
    showMenu(e, [
      ...(id !== 'start' ? [{ label: L("„{0}“ ausblenden", label), run: () => { app.prefs.hiddenTabs = [...(app.prefs.hiddenTabs || []), id]; if (app.tab === id) app.tab = 'start'; savePrefs(); } }] : []),
      ...((app.prefs.hiddenTabs || []).length ? [{ label: L("Alle Registerkarten zeigen"), run: () => { app.prefs.hiddenTabs = []; savePrefs(); } }] : []),
      { label: L("Bandleiste anpassen …"), run: () => openTool('settings') },
    ]);
  }

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
  // Ohne Dokument nur zeigen, was auch geht – keine Wand aus ausgegrauten Befehlen
  const usable = (it: RibbonItem) => (typeof it === 'object' && 'custom' in it) ? !!doc : hasTool(idOf(it)) && (!!doc || !!tool(idOf(it)).noDoc);
  const groups = $derived(tabDef.groups.map(g => ({ ...g, items: g.items.filter(usable) })).filter(g => g.items.length));

  // Gleitender Strich unter dem aktiven Reiter
  let tabrow: HTMLDivElement | undefined = $state();
  let ink = $state({ x: 0, w: 0, ready: false });
  function placeInk() {
    const el = tabrow?.querySelector<HTMLElement>('.rtab.on');
    if (!el || !tabrow) { ink = { ...ink, w: 0 }; return; }
    ink = { x: el.offsetLeft + 10, w: el.offsetWidth - 20, ready: true };
  }
  $effect(() => { tabDef.id; app.backstage; tabs.length; tick().then(placeInk); document.fonts?.ready.then(placeInk); });
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
    let n = groups.length;
    while (body && body.scrollWidth > body.clientWidth + 1 && n > 1) { n--; foldFrom = n; await tick(); }
    measuring = false;
  }
  $effect(() => {
    tabDef; collapsed; groups.length;
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
  <div class="tabrow" role="tablist" bind:this={tabrow}>
    <span class="ink" class:ready={ink.ready} style:transform={`translateX(${ink.x}px)`} style:width={ink.w + 'px'}></span>
    {#each tabs as t (t.id)}
      <button role="tab" class="rtab" class:on={tabDef.id === t.id && !app.backstage} aria-selected={tabDef.id === t.id} onclick={() => pickTab(t.id)} ondblclick={toggleCollapse} oncontextmenu={e => tabMenu(e, t.id, t.label)}>{t.label}</button>
    {/each}
    <span class="spacer"></span>
    {#if doc && (app.mode !== 'select' && app.mode !== 'hand')}
      <span class="modechip"><span class="pulse"></span>{({ move: L("Elemente verschieben"), 'text:edit': L("Text bearbeiten"), 'text:add': L("Text hinzufügen"), image: L("Bild platzieren"), sign: L("Unterschrift platzieren"), stamp: L("Stempel setzen"), redact: L("Schwärzen"), whiteout: L("Abdecken"), link: 'Link', note: L("Notiz"), 'shape:rect': L("Rechteck"), 'shape:ellipse': L("Ellipse"), 'shape:line': L("Linie"), 'shape:arrow': L("Pfeil"), 'comment:text': L("Textkommentar"), ink: L("Freihand"), 'markup:highlight': L("Textmarker"), 'markup:underline': L("Unterstreichen"), 'markup:strike': L("Durchstreichen"), 'field:text': L("Textfeld"), 'field:check': L("Kontrollkästchen"), 'field:radio': L("Optionsfeld"), 'field:choice': L("Auswahlliste"), 'field:signature': L("Unterschriftsfeld") } as Record<string, string>)[app.mode] || app.mode}
        <button onclick={() => (app.mode = 'select')} aria-label={L("Modus beenden")} title={L("Beenden (Esc)")}><I.X size={11} strokeWidth={2.2} /></button></span>
    {/if}
    <button class="collapse" onclick={toggleCollapse} title={app.prefs.ribbonCollapsed ? L("Bandleiste anheften") : L("Bandleiste ausblenden")} aria-label={L("Bandleiste ein- oder ausblenden")}>
      {#if app.prefs.ribbonCollapsed}<I.ChevronDown size={14} />{:else}<I.ChevronUp size={14} />{/if}
    </button>
  </div>
  {#if !collapsed}
    <div class="body" role="toolbar" aria-label={tabDef.label} bind:this={body}>
      {#each groups as g, gi (g.label)}
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
    {#if popGroup !== null && groups[popGroup]}
      {@const g = groups[popGroup]}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div class="gpop" style:left={popX + 'px'} style:top={popY + 'px'} role="dialog" tabindex="-1" aria-label={g.label} onclick={e => { if ((e.target as HTMLElement).closest('.rb')) popGroup = null; }}>
        <section class="group">{@render groupBody(g)}<div class="glabel">{g.label}</div></section>
      </div>
    {/if}
  {/if}
</div>

<style>
  .ribbon { background: var(--win); position: relative; z-index: 20; padding-bottom: 8px; }
  .ribbon.collapsed { padding-bottom: 0; border-bottom: 0.5px solid var(--line); }
  .ribbon.peek .body { box-shadow: var(--shadow-pop); }
  .tabrow { display: flex; align-items: center; gap: 0; height: 34px; padding: 0 12px; position: relative; }
  .rtab { border: 0; background: none; height: 30px; padding: 0 12px; border-radius: 7px; color: var(--text-2); font-weight: 550; white-space: nowrap; letter-spacing: 0.005em; transition: color 0.15s; }
  .rtab:hover { color: var(--text); }
  .rtab.on { color: var(--text); }
  /* Das eine markante Element: ein Petrol-Strich, der zum aktiven Reiter gleitet */
  .ink { position: absolute; left: 12px; bottom: 1px; height: 2.5px; border-radius: 2px; background: var(--accent); pointer-events: none; opacity: 0; }
  .ink.ready { opacity: 1; transition: transform 0.28s var(--ease), width 0.28s var(--ease); }
  .spacer { flex: 1; }
  .collapse { border: 0; background: none; width: 26px; height: 26px; border-radius: 7px; color: var(--text-3); display: grid; place-items: center; }
  .collapse:hover { background: var(--hover); color: var(--text); }
  .modechip { display: inline-flex; align-items: center; gap: 7px; height: 24px; padding: 0 4px 0 10px; border-radius: 12px; background: var(--accent); color: var(--on-accent); font-size: 11.5px; font-weight: 600; margin-right: 6px; box-shadow: 0 1px 3px rgba(11, 110, 123, 0.3); animation: pop-in 0.18s var(--ease); }
  .modechip button { border: 0; background: none; color: inherit; width: 18px; height: 18px; border-radius: 9px; display: grid; place-items: center; }
  .modechip button:hover { background: rgba(255, 255, 255, 0.2); }
  .pulse { width: 6px; height: 6px; border-radius: 50%; background: currentColor; animation: pulse 1.6s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: 0.35; } }
  /* Werkzeug-Ablage: als Fläche vom Fensterchrom abgesetzt */
  .body { display: flex; align-items: stretch; height: 94px; padding: 6px 6px 0; margin: 0 10px; overflow: hidden; background: var(--bar); border-radius: 12px; box-shadow: var(--shadow-1); }
  .group { display: flex; flex-direction: column; padding: 0 7px; position: relative; flex: none; }
  .group + .group::before { content: ''; position: absolute; left: 0; top: 10px; bottom: 14px; width: 1px; background: var(--line); }
  .cols { display: flex; gap: 2px; flex: 1; min-height: 0; align-items: flex-start; }
  .fold { border: 0; background: none; color: var(--text); border-radius: 8px; display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 58px; min-height: 64px; padding: 6px 6px 4px; }
  .fold:hover, .fold.on { background: var(--hover); }
  .fold .ic { height: 26px; display: grid; place-items: center; }
  .fold .lb { font-size: 11px; line-height: 1.18; display: inline-flex; align-items: center; gap: 2px; white-space: nowrap; font-stretch: 94%; }
  .gpop { position: fixed; z-index: 60; background: var(--bar); border-radius: 12px; box-shadow: var(--shadow-pop); padding: 6px 4px 0; height: 94px; display: flex; animation: pop-in 0.14s var(--ease); }
  .stack { display: flex; flex-direction: column; gap: 1px; padding-top: 1px; }
  .glabel { font-size: 10.5px; font-weight: 500; color: var(--text-3); text-align: center; padding: 2px 0 6px; white-space: nowrap; font-stretch: 94%; }
</style>
