<script lang="ts">
  import { L, intlLocale } from '../../lib/i18n';
  let { title, done }: { title: string; done: (r: any) => void } = $props();
  const today = new Date().toLocaleDateString(intlLocale());
  const PRESETS: [string, string][] = [[L("GENEHMIGT"), '#1E7B45'], [L("ABGELEHNT"), '#C42B1C'], [L("ENTWURF"), '#6B7280'], [L("VERTRAULICH"), '#C42B1C'], [L("GEPRÜFT"), '#1F4FD1'], [L("ERLEDIGT"), '#1E7B45'], [L("EINGANG"), '#1F4FD1'], [L("KOPIE"), '#6B7280'], [L("BEZAHLT"), '#1E7B45'], [L("ZUR KENNTNIS"), '#B7791F']];
  let custom = $state('');
  let color = $state('#1F4FD1');
  let withDate = $state(true);
  let withName = $state(false);
  let name = $state('');
  let style = $state<'box' | 'round'>('box');

  function render(text: string, col: string) {
    const c = document.createElement('canvas'); const x = c.getContext('2d')!;
    const fs = 86; const sub = [withDate ? today : '', withName && name ? name : ''].filter(Boolean).join(' · ');
    x.font = `800 ${fs}px -apple-system, "Segoe UI", "Inter Variable", Arial, sans-serif`;
    const w1 = x.measureText(text).width + text.length * 7;
    x.font = `600 ${fs * 0.4}px -apple-system, "Segoe UI", Arial, sans-serif`; const w2 = sub ? x.measureText(sub).width : 0;
    const W = Math.max(w1 + 90, w2 + 90), H = sub ? 200 : 146;
    c.width = W; c.height = H;
    x.strokeStyle = col; x.fillStyle = col; x.lineWidth = 9;
    x.beginPath(); const r = style === 'round' ? H / 2 - 8 : 16;
    if ((x as any).roundRect) (x as any).roundRect(8, 8, W - 16, H - 16, r); else x.rect(8, 8, W - 16, H - 16);
    x.stroke();
    x.lineWidth = 3; x.beginPath(); if ((x as any).roundRect) (x as any).roundRect(20, 20, W - 40, H - 40, Math.max(4, r - 12)); x.stroke();
    x.font = `800 ${fs}px -apple-system, "Segoe UI", "Inter Variable", Arial, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
    if ('letterSpacing' in x) (x as any).letterSpacing = '7px';
    x.fillText(text, W / 2 + 3, sub ? 84 : H / 2 + 4);
    if (sub) { if ('letterSpacing' in x) (x as any).letterSpacing = '1px'; x.font = `600 ${fs * 0.4}px -apple-system, "Segoe UI", Arial, sans-serif`; x.fillText(sub, W / 2, 148); }
    // leicht verwittert wie ein echter Stempel
    const im = x.getImageData(0, 0, W, H), d = im.data; let seed = text.length * 97;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0 && rnd() < 0.05) d[i] = d[i] * 0.4;
    x.putImageData(im, 0, 0);
    return { src: c.toDataURL('image/png'), ratio: H / W };
  }
  function pick(text: string, col: string) { const r = render(text, col); done({ button: 'ok', values: r }); }
</script>

<div class="st">
  <h2>{title}</h2>
  <div class="grid">
    {#each PRESETS as [t, c] (t)}<button class="stamp" style:color={c} class:round={style === 'round'} onclick={() => pick(t, c)}>{t}</button>{/each}
  </div>
  <div class="row">
    <input class="input" placeholder={L("Eigener Stempeltext")} bind:value={custom} onkeydown={e => e.key === 'Enter' && custom.trim() && pick(custom.trim().toUpperCase(), color)} />
    <input type="color" bind:value={color} class="color" aria-label={L("Farbe")} />
    <button class="btn primary" disabled={!custom.trim()} onclick={() => pick(custom.trim().toUpperCase(), color)}>{L("Verwenden")}</button>
  </div>
  <div class="opts">
    <label><input type="checkbox" bind:checked={withDate} /> {L("Datum ({0})", today)}</label>
    <label><input type="checkbox" bind:checked={withName} /> {L("Name")}</label>
    {#if withName}<input class="input sm" placeholder={L("Kürzel oder Name")} bind:value={name} />{/if}
    <span class="grow"></span>
    <div class="seg"><button aria-pressed={style === 'box'} onclick={() => (style = 'box')}>{L("Eckig")}</button><button aria-pressed={style === 'round'} onclick={() => (style = 'round')}>{L("Rund")}</button></div>
  </div>
  <div class="buttons"><button class="btn" onclick={() => done(null)}>{L("Abbrechen")}</button></div>
</div>

<style>
  .st { display: flex; flex-direction: column; gap: 14px; }
  h2 { margin: 0; font: 600 15px var(--font-display); }
  .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
  .stamp { height: 46px; border: 3px solid currentColor; border-radius: 6px; background: #fff; font: 800 15px var(--font); letter-spacing: 0.12em; }
  .stamp.round { border-radius: 23px; }
  .stamp:hover { box-shadow: 0 0 0 3px var(--accent-soft); }
  .row { display: flex; gap: 8px; align-items: center; }
  .color { width: 36px; height: 28px; border: 0.5px solid var(--line-strong); border-radius: 6px; padding: 2px; background: var(--surface); flex: none; }
  .opts { display: flex; align-items: center; gap: 14px; font-size: 12px; color: var(--text-2); flex-wrap: wrap; }
  .opts label { display: flex; gap: 6px; align-items: center; }
  .opts .input { width: 140px; height: 24px; }
  .grow { flex: 1; }
  .buttons { display: flex; justify-content: flex-end; }
</style>
