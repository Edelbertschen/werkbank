<script lang="ts">
  import { app, active } from '../lib/app.svelte';
  import { overlay, findItem } from '../lib/overlay.svelte';
  import { viewer } from '../lib/viewer.svelte';
  import { pdfjsLib } from '../lib/pdf';

  let { kind }: { kind: string } = $props();
  const COLORS = ['#1C1C1E', '#E5383B', '#F08C00', '#2FA84F', '#1F4FD1', '#8E44AD'];
  const HL = ['#FFF066', '#5BFF7C', '#86E2FF', '#FF98C8', '#FFB86B'];
  const P = pdfjsLib.AnnotationEditorParamsType;

  function sel() { const d = active(); return d ? findItem(d, overlay.selected) : null; }

  function setStroke(c: string) {
    app.style.stroke = c; app.style.ink = c;
    viewer.editorParam(P.INK_COLOR, c);
    const it: any = sel(); if (it && 'stroke' in it) it.stroke = c; if (it && 'color' in it && it.kind !== 'text') it.color = c;
  }
  function setFill(c: string) { app.style.fill = c; const it: any = sel(); if (it && 'fill' in it) it.fill = c; }
  function setWidth(w: number) { app.style.width = w; app.style.inkWidth = w; viewer.editorParam(P.INK_THICKNESS, w); const it: any = sel(); if (it && 'width' in it) it.width = w; }
  function setHl(c: string) { app.style.highlight = c; viewer.editorParam(P.HIGHLIGHT_COLOR, c); const it: any = sel(); if (it && (it.kind === 'underline' || it.kind === 'strike')) it.color = c; }
  function setText(c: string) { app.style.textColor = c; viewer.editorParam(P.FREETEXT_COLOR, c); const it: any = sel(); if (it && (it.kind === 'text' || it.kind === 'textedit' || it.kind === 'note')) it.color = c; }
  function setSize(s: number) { app.style.fontSize = s; viewer.editorParam(P.FREETEXT_SIZE, s); const it: any = sel(); if (it && (it.kind === 'text' || it.kind === 'textedit')) it.size = s; }
</script>

{#if kind === 'style-shape'}
  <div class="sc">
    <div class="row"><span class="lbl">Linie</span>{#each COLORS as c (c)}<button class="sw" style:background={c} aria-label={`Farbe ${c}`} aria-pressed={app.style.stroke === c} onclick={() => setStroke(c)}></button>{/each}
      <label class="pick" title="Eigene Farbe"><input type="color" value={app.style.stroke} oninput={e => setStroke((e.target as HTMLInputElement).value)} /></label></div>
    <div class="row"><span class="lbl">Füllung</span><button class="sw none" aria-label="Keine Füllung" aria-pressed={app.style.fill === 'transparent'} onclick={() => setFill('transparent')}></button>{#each COLORS.slice(1) as c (c)}<button class="sw" style:background={c + '55'} aria-label={`Füllung ${c}`} aria-pressed={app.style.fill === c} onclick={() => setFill(c)}></button>{/each}</div>
    <div class="row"><span class="lbl">Stärke</span>
      <select class="select mini" value={String(app.style.width)} onchange={e => setWidth(+(e.target as HTMLSelectElement).value)} aria-label="Linienstärke">
        {#each [0.5, 1, 1.5, 2, 3, 4, 6, 8, 12] as w (w)}<option value={String(w)}>{w} pt</option>{/each}
      </select>
      <span class="lbl">Marker</span>{#each HL as c (c)}<button class="sw sm" style:background={c} aria-label={`Markerfarbe ${c}`} aria-pressed={app.style.highlight === c} onclick={() => setHl(c)}></button>{/each}
    </div>
  </div>
{:else if kind === 'style-text'}
  <div class="sc">
    <div class="row"><span class="lbl">Farbe</span>{#each COLORS as c (c)}<button class="sw" style:background={c} aria-label={`Textfarbe ${c}`} aria-pressed={app.style.textColor === c} onclick={() => setText(c)}></button>{/each}
      <label class="pick" title="Eigene Farbe"><input type="color" value={app.style.textColor} oninput={e => setText((e.target as HTMLInputElement).value)} /></label></div>
    <div class="row"><span class="lbl">Größe</span>
      <select class="select mini" value={String(app.style.fontSize)} onchange={e => setSize(+(e.target as HTMLSelectElement).value)} aria-label="Schriftgröße">
        {#each [7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64] as s (s)}<option value={String(s)}>{s} pt</option>{/each}
      </select>
    </div>
  </div>
{/if}

<style>
  .sc { display: flex; flex-direction: column; gap: 2px; padding: 2px 4px 0; }
  .row { display: flex; align-items: center; gap: 4px; height: 22px; }
  .lbl { font-size: 11px; color: var(--text-3); width: 44px; }
  .row .lbl + .select + .lbl { width: auto; margin-left: 8px; }
  .sw { width: 16px; height: 16px; border-radius: 50%; border: 0; padding: 0; box-shadow: inset 0 0 0 0.5px rgba(0, 0, 0, 0.25); }
  .sw.sm { width: 13px; height: 13px; }
  .sw[aria-pressed="true"] { box-shadow: 0 0 0 2px var(--bar), 0 0 0 3.5px var(--accent); }
  .sw.none { background: linear-gradient(135deg, transparent 45%, #E5383B 45%, #E5383B 55%, transparent 55%), var(--surface); }
  .pick { width: 16px; height: 16px; border-radius: 50%; overflow: hidden; background: conic-gradient(red, yellow, lime, cyan, blue, magenta, red); position: relative; }
  .pick input { opacity: 0; position: absolute; inset: 0; width: 100%; height: 100%; }
  .mini { height: 20px; width: 70px; font-size: 11.5px; padding: 0 18px 0 6px; background-position: right 5px center; }
</style>
