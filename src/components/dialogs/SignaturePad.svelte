<script lang="ts">
  import { onMount } from 'svelte';
  import { app, savePrefs } from '../../lib/app.svelte';
  import { pickFiles } from '../../lib/platform';
  import * as I from '../../lib/icons';

  let { title, done }: { title: string; done: (r: any) => void } = $props();
  let mode = $state<'draw' | 'type' | 'image'>(app.prefs.signatures.length ? 'saved' as any : 'draw');
  let pad: HTMLCanvasElement | undefined = $state();
  let typed = $state('');
  let font = $state('Dancing Script');
  let color = $state('#13235F');
  let keep = $state(true);
  let imgSrc = $state('');
  let hasInk = $state(false);
  const FONTS = ['Dancing Script', 'Caveat', 'Great Vibes', 'Kalam', 'Homemade Apple'];

  // Handschriftliche Schriften lokal aus Google-Fonts-freien Quellen gibt es nicht im Paket;
  // ersatzweise kursive Systemschriften, falls die Schrift fehlt.
  const stack = (f: string) => `"${f}", "Segoe Script", "Brush Script MT", "Snell Roundhand", cursive`;

  let drawing = false, last: [number, number] | null = null;
  function pos(e: PointerEvent): [number, number] { const r = pad!.getBoundingClientRect(); return [(e.clientX - r.left) * pad!.width / r.width, (e.clientY - r.top) * pad!.height / r.height]; }
  function pd(e: PointerEvent) { drawing = true; last = pos(e); pad!.setPointerCapture(e.pointerId); dot(last, e.pressure); }
  function dot(p: [number, number], pressure = 0.5) { const c = pad!.getContext('2d')!; c.fillStyle = color; c.beginPath(); c.arc(p[0], p[1], 2.2 + pressure * 1.5, 0, Math.PI * 2); c.fill(); hasInk = true; }
  function pm(e: PointerEvent) {
    if (!drawing || !last) return;
    const c = pad!.getContext('2d')!; const p = pos(e);
    c.strokeStyle = color; c.lineCap = 'round'; c.lineJoin = 'round';
    const v = Math.hypot(p[0] - last[0], p[1] - last[1]);
    c.lineWidth = Math.max(2.4, 6.5 - v * 0.08) * (e.pressure > 0 && e.pointerType === 'pen' ? 0.6 + e.pressure : 1);
    c.beginPath(); c.moveTo(...last); c.lineTo(...p); c.stroke(); last = p; hasInk = true;
  }
  function pu() { drawing = false; last = null; }
  function clear() { const c = pad!.getContext('2d')!; c.clearRect(0, 0, pad!.width, pad!.height); hasInk = false; }

  function trim(c: HTMLCanvasElement) {
    const ctx = c.getContext('2d')!; const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 <= x0) return null;
    const p = 8, o = document.createElement('canvas'); o.width = x1 - x0 + 2 * p; o.height = y1 - y0 + 2 * p;
    o.getContext('2d')!.drawImage(c, x0 - p, y0 - p, o.width, o.height, 0, 0, o.width, o.height);
    return o;
  }
  function typedCanvas() {
    const c = document.createElement('canvas'); c.width = 1400; c.height = 360;
    const x = c.getContext('2d')!; x.fillStyle = color; x.font = `150px ${stack(font)}`; x.textBaseline = 'middle'; x.fillText(typed, 30, 190);
    return c;
  }
  async function loadImage() {
    const [f] = await pickFiles({ filters: [{ name: 'Bilder', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] });
    if (!f) return;
    // Weißen Hintergrund transparent machen, damit die Unterschrift sauber auf dem Papier liegt
    const bmp = await createImageBitmap(new Blob([f.bytes as BlobPart]));
    const c = document.createElement('canvas'); const s = Math.min(1, 1600 / bmp.width); c.width = bmp.width * s; c.height = bmp.height * s;
    const x = c.getContext('2d')!; x.drawImage(bmp, 0, 0, c.width, c.height);
    const im = x.getImageData(0, 0, c.width, c.height), d = im.data;
    for (let i = 0; i < d.length; i += 4) { const l = (d[i] + d[i + 1] + d[i + 2]) / 3; if (l > 215) d[i + 3] = 0; else if (l > 170) d[i + 3] = Math.round(255 * (215 - l) / 45); }
    x.putImageData(im, 0, 0);
    imgSrc = (trim(c) || c).toDataURL('image/png');
  }
  function finish(src: string, ratio: number, save = keep) { done({ button: 'ok', values: { src, ratio, keep: save } }); }
  function ok() {
    let c: HTMLCanvasElement | null = null;
    if (mode === 'draw') c = hasInk ? trim(pad!) : null;
    else if (mode === 'type') c = typed.trim() ? trim(typedCanvas()) : null;
    else if (mode === 'image' && imgSrc) { const im = new Image(); im.onload = () => finish(imgSrc, im.height / im.width); im.src = imgSrc; return; }
    if (!c) return;
    finish(c.toDataURL('image/png'), c.height / c.width);
  }
  function useSaved(s: string) { const im = new Image(); im.onload = () => finish(s, im.height / im.width, false); im.src = s; }
  function delSaved(s: string) { app.prefs.signatures = app.prefs.signatures.filter(x => x !== s); savePrefs(); if (!app.prefs.signatures.length) mode = 'draw'; }

  onMount(() => { document.fonts?.load?.(`40px "${font}"`).catch(() => {}); });
</script>

<div class="sp">
  <h2>{title}</h2>
  <div class="seg" role="tablist">
    {#if app.prefs.signatures.length}<button role="tab" aria-selected={(mode as any) === 'saved'} onclick={() => (mode = 'saved' as any)}>Gespeichert</button>{/if}
    <button role="tab" aria-selected={mode === 'draw'} onclick={() => (mode = 'draw')}>Zeichnen</button>
    <button role="tab" aria-selected={mode === 'type'} onclick={() => (mode = 'type')}>Tippen</button>
    <button role="tab" aria-selected={mode === 'image'} onclick={() => (mode = 'image')}>Bild</button>
  </div>

  {#if (mode as any) === 'saved'}
    <div class="saved">
      {#each app.prefs.signatures as s (s)}
        <div class="sv"><button class="use" onclick={() => useSaved(s)} aria-label="Diese Unterschrift verwenden"><img src={s} alt="Gespeicherte Unterschrift" /></button>
          <button class="del" aria-label="Löschen" title="Löschen" onclick={() => delSaved(s)}><I.X size={12} /></button></div>
      {/each}
    </div>
    <p class="hint">Unterschrift anklicken, um sie zu platzieren.</p>
  {:else if mode === 'draw'}
    <div class="padwrap">
      <canvas bind:this={pad} width="1200" height="380" class="pad" onpointerdown={pd} onpointermove={pm} onpointerup={pu} onpointercancel={pu}></canvas>
      <div class="line"></div>
      {#if !hasInk}<span class="ph">Hier unterschreiben – mit Maus, Trackpad oder Stift</span>{/if}
    </div>
    <div class="row"><button class="btn sm" onclick={clear} disabled={!hasInk}>Leeren</button>
      <span class="grow"></span>{#each ['#13235F', '#1C1C1E', '#1F4FD1'] as c (c)}<button class="sw" style:background={c} aria-label={`Farbe ${c}`} aria-pressed={color === c} onclick={() => (color = c)}></button>{/each}</div>
  {:else if mode === 'type'}
    <input class="input" placeholder="Vor- und Nachname" bind:value={typed} />
    <div class="fonts">
      {#each FONTS as f (f)}<button class="font" class:on={font === f} style:font-family={stack(f)} onclick={() => (font = f)}>{typed || 'Unterschrift'}</button>{/each}
    </div>
  {:else}
    <div class="img">{#if imgSrc}<img src={imgSrc} alt="Vorschau" />{:else}<p class="hint">Foto oder Scan einer Unterschrift auf weißem Papier. Der Hintergrund wird automatisch entfernt.</p>{/if}</div>
    <button class="btn sm" onclick={loadImage}><I.Upload size={13} />Bild wählen …</button>
  {/if}

  {#if (mode as any) !== 'saved'}
    <label class="keep"><input type="checkbox" bind:checked={keep} /> Für später speichern (nur auf diesem Rechner)</label>
  {/if}
  <div class="buttons">
    <button class="btn" onclick={() => done(null)}>Abbrechen</button>
    {#if (mode as any) !== 'saved'}<button class="btn primary" onclick={ok}>Platzieren</button>{/if}
  </div>
</div>

<style>
  .sp { display: flex; flex-direction: column; gap: 12px; }
  h2 { margin: 0; font: 600 15px var(--font-display); }
  .padwrap { position: relative; border-radius: 10px; background: #fff; box-shadow: inset 0 0 0 1px var(--line-strong); }
  .pad { width: 100%; height: 170px; display: block; touch-action: none; cursor: crosshair; }
  .line { position: absolute; left: 24px; right: 24px; bottom: 40px; border-bottom: 1px dashed #c8ccd4; pointer-events: none; }
  .ph { position: absolute; inset: 0; display: grid; place-items: center; color: #9aa0aa; font-size: 12.5px; pointer-events: none; }
  .row { display: flex; align-items: center; gap: 6px; }
  .grow { flex: 1; }
  .sw { width: 18px; height: 18px; border-radius: 50%; border: 0; }
  .sw[aria-pressed="true"] { box-shadow: 0 0 0 2px var(--surface), 0 0 0 3.5px var(--accent); }
  .fonts { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .font { height: 54px; border: 0; border-radius: 8px; background: #fff; color: #13235F; font-size: 26px; box-shadow: inset 0 0 0 1px var(--line-strong); overflow: hidden; white-space: nowrap; padding: 0 10px; }
  .font.on { box-shadow: inset 0 0 0 2px var(--accent); }
  .img { min-height: 120px; border-radius: 10px; background: #fff; box-shadow: inset 0 0 0 1px var(--line-strong); display: grid; place-items: center; padding: 12px; }
  .img img { max-height: 140px; max-width: 100%; }
  .hint { margin: 0; font-size: 12px; color: var(--text-3); text-align: center; }
  .saved { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .sv { position: relative; }
  .use { width: 100%; height: 76px; border: 0; border-radius: 9px; background: #fff; box-shadow: inset 0 0 0 1px var(--line-strong); padding: 8px; display: grid; place-items: center; }
  .use:hover { box-shadow: inset 0 0 0 2px var(--accent); }
  .use img { max-height: 100%; max-width: 100%; }
  .del { position: absolute; top: 4px; right: 4px; width: 20px; height: 20px; border: 0; border-radius: 5px; background: rgba(255, 255, 255, 0.9); color: #555; display: grid; place-items: center; }
  .keep { display: flex; gap: 7px; align-items: center; font-size: 12px; color: var(--text-2); }
  .buttons { display: flex; justify-content: flex-end; gap: 8px; }
</style>
