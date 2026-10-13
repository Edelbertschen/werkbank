<script lang="ts">
  import type { Field } from '../lib/fields';
  import { app, active } from '../lib/app.svelte';
  import { pickFiles } from '../lib/platform';
  import { REDACT_PRESETS } from '../lib/tools/edit';
  import { OCR_LANGS } from '../lib/tools/optimize';
  import { fmtSize, uid } from '../lib/util';
  import * as I from '../lib/icons';

  let { fields, values = $bindable() }: { fields: Field[]; values: Record<string, any> } = $props();
  const doc = $derived(active());
  const visible = $derived(fields.filter(f => !f.when || f.when(values)));
  const otherDocs = $derived(app.docs.filter(d => d.id !== app.activeId));

  async function addFiles(f: Field, single = false) {
    const picked = await pickFiles({ multiple: !single, filters: f.accept ? [{ name: 'Passende Dateien', extensions: f.accept }] : undefined });
    if (!picked.length) return;
    const entries = picked.map(p => ({ id: uid(), name: p.name, bytes: p.bytes, size: p.size, path: p.path }));
    if (f.type === 'doc') values[f.key] = entries[0];
    else values[f.key] = single ? entries : [...(values[f.key] || []), ...entries];
  }
  function move(key: string, i: number, d: number) {
    const a = [...values[key]]; const j = i + d; if (j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j], a[i]]; values[key] = a;
  }
  function removeAt(key: string, i: number) { const a = [...values[key]]; a.splice(i, 1); values[key] = a; }
  function toggleDoc(key: string, d: { id: string; name: string }) {
    const a: any[] = values[key] || [];
    values[key] = a.some(x => x.id === d.id) ? a.filter(x => x.id !== d.id) : [...a, { id: d.id, name: d.name, open: true }];
  }
  function toggleIn(key: string, v: string) { const a: string[] = values[key] || []; values[key] = a.includes(v) ? a.filter(x => x !== v) : [...a, v]; }
  $effect(() => {
    // "docs": aktuelles Dokument vorschlagen
    for (const f of fields) if (f.type === 'docs' && values[f.key] === undefined) values[f.key] = doc ? [{ id: doc.id, name: doc.name, open: true }] : [];
  });
  const POS = [['tl', 'tc', 'tr'], ['bl', 'bc', 'br']];
</script>

<div class="fields">
  {#each visible as f (f.key)}
    {#if f.type === 'heading'}
      <h3>{f.label}</h3>
    {:else if f.type === 'note'}
      <p class="note" class:warn={f.tone === 'warn'}>{f.text}</p>
    {:else if f.type === 'check'}
      <label class="check"><input type="checkbox" bind:checked={values[f.key]} /><span>{f.label}</span></label>
      {#if f.hint}<p class="hint inset">{f.hint}</p>{/if}
    {:else}
      <div class="field">
        {#if f.label}<label class="lbl" for={'f-' + f.key}>{f.label}{#if f.type === 'range'}<span class="val num">{values[f.key]}{f.unit || ''}</span>{/if}</label>{/if}
        {#if f.type === 'text' || f.type === 'password'}
          <input id={'f-' + f.key} class="input" type={f.type} placeholder={f.ph || ''} bind:value={values[f.key]} autocomplete="off" spellcheck="false" />
        {:else if f.type === 'textarea'}
          <textarea id={'f-' + f.key} class="textarea" placeholder={f.ph || ''} bind:value={values[f.key]} rows="5"></textarea>
        {:else if f.type === 'number'}
          <input id={'f-' + f.key} class="input num" type="number" min={f.min} max={f.max} step={f.step || 'any'} bind:value={values[f.key]} />
        {:else if f.type === 'select'}
          <select id={'f-' + f.key} class="select" bind:value={values[f.key]}>
            {#each f.opts || [] as [v, l] (v)}<option value={v}>{l}</option>{/each}
          </select>
        {:else if f.type === 'seg'}
          <div class="seg wrap" role="group" aria-label={f.label}>
            {#each f.opts || [] as [v, l] (v)}<button type="button" aria-pressed={values[f.key] === v} onclick={() => (values[f.key] = v)}>{l}</button>{/each}
          </div>
        {:else if f.type === 'color'}
          <div class="row"><input id={'f-' + f.key} type="color" class="color" bind:value={values[f.key]} /><span class="hint num">{String(values[f.key] || '').toUpperCase()}</span></div>
        {:else if f.type === 'range'}
          <input id={'f-' + f.key} type="range" class="range" min={f.min} max={f.max} step={f.step || 1} bind:value={values[f.key]} />
        {:else if f.type === 'pages'}
          {@const v = values[f.key] || { mode: 'all', range: '' }}
          <div class="seg wrap" role="group" aria-label="Seiten">
            <button type="button" aria-pressed={v.mode === 'all'} onclick={() => (v.mode = 'all')}>Alle ({doc?.numPages || 0})</button>
            <button type="button" aria-pressed={v.mode === 'cur'} onclick={() => (v.mode = 'cur')}>Aktuelle ({doc?.current || 1})</button>
            <button type="button" aria-pressed={v.mode === 'sel'} disabled={!doc?.selection.length} onclick={() => (v.mode = 'sel')}>Auswahl ({doc?.selection.length || 0})</button>
            <button type="button" aria-pressed={v.mode === 'range'} onclick={() => (v.mode = 'range')}>Bereich</button>
          </div>
          {#if v.mode === 'range'}<input class="input" placeholder="z. B. 1-3, 5, 8-letzte oder ungerade" bind:value={v.range} aria-label="Seitenbereich" />{/if}
          {#if v.mode === 'sel' && !doc?.selection.length}<p class="hint">Keine Seiten markiert – es wird die aktuelle Seite verwendet.</p>{/if}
        {:else if f.type === 'position'}
          <div class="pos" role="radiogroup" aria-label={f.label}>
            {#each POS as row, ri (ri)}
              <div class="prow">{#each row as p (p)}<button type="button" role="radio" aria-checked={values[f.key] === p} aria-label={p} class:on={values[f.key] === p} onclick={() => (values[f.key] = p)}><span></span></button>{/each}</div>
              {#if ri === 0}<div class="pmid"></div>{/if}
            {/each}
          </div>
        {:else if f.type === 'quad'}
          <div class="quad">
            {#each f.parts || [] as [k, l] (k)}
              <label class="qi"><span>{l}</span><input class="input num" type="number" step="any" min="0" bind:value={values[f.key][k]} /></label>
            {/each}
          </div>
        {:else if f.type === 'files'}
          <div class="flist">
            {#each values[f.key] || [] as it, i (it.id)}
              <div class="fi"><I.FileText size={13} /><span class="n" title={it.name}>{it.name}</span><span class="s num">{fmtSize(it.size || it.bytes?.length || 0)}</span>
                <button class="ib" aria-label="Nach oben" disabled={i === 0} onclick={() => move(f.key, i, -1)}><I.ChevronUp size={12} /></button>
                <button class="ib" aria-label="Entfernen" onclick={() => removeAt(f.key, i)}><I.X size={12} /></button></div>
            {/each}
            <button type="button" class="btn sm" onclick={() => addFiles(f)}><I.Plus size={13} />Dateien wählen …</button>
          </div>
        {:else if f.type === 'doc'}
          {@const cur = values[f.key]}
          <select id={'f-' + f.key} class="select" value={cur?.id || ''} onchange={e => { const id = (e.target as HTMLSelectElement).value; if (id === '__pick') { addFiles(f, true); return; } const d = app.docs.find(x => x.id === id); values[f.key] = d ? { id: d.id, name: d.name, open: true } : null; }}>
            <option value="" disabled>Dokument wählen …</option>
            {#each otherDocs as d (d.id)}<option value={d.id}>{d.title} (geöffnet)</option>{/each}
            {#if cur && !cur.open}<option value={cur.id}>{cur.name}</option>{/if}
            <option value="__pick">Datei von der Festplatte …</option>
          </select>
        {:else if f.type === 'docs'}
          {@const list = values[f.key] || []}
          <div class="flist">
            {#each list as it, i (it.id)}
              <div class="fi"><span class="ord num">{i + 1}</span><span class="n" title={it.name}>{it.name}</span>{#if it.open}<span class="tag">geöffnet</span>{/if}
                <button class="ib" aria-label="Nach oben" disabled={i === 0} onclick={() => move(f.key, i, -1)}><I.ChevronUp size={12} /></button>
                <button class="ib" aria-label="Nach unten" disabled={i === list.length - 1} onclick={() => move(f.key, i, 1)}><I.ChevronDown size={12} /></button>
                <button class="ib" aria-label="Entfernen" onclick={() => removeAt(f.key, i)}><I.X size={12} /></button></div>
            {/each}
            {#if !list.length}<p class="hint">Noch keine Dokumente gewählt.</p>{/if}
            <div class="row">
              <button type="button" class="btn sm" onclick={() => addFiles(f)}><I.Plus size={13} />Dateien …</button>
              {#each app.docs.filter(d => !list.some((x: any) => x.id === d.id)).slice(0, 6) as d (d.id)}
                <button type="button" class="btn sm ghost chip" onclick={() => toggleDoc(f.key, d)} title={`„${d.name}“ hinzufügen`}><I.Plus size={11} />{d.title}</button>
              {/each}
            </div>
          </div>
        {:else if f.type === 'custom' && f.key === 'presets'}
          <div class="chips">
            {#each REDACT_PRESETS as [k, l] (k)}<button type="button" class="chipt" aria-pressed={(values[f.key] || []).includes(k)} onclick={() => toggleIn(f.key, k)}>{l}</button>{/each}
          </div>
        {:else if f.type === 'custom' && f.key === 'langs'}
          <div class="chips">
            {#each OCR_LANGS as [k, l] (k)}<button type="button" class="chipt" aria-pressed={(values[f.key] || []).includes(k)} onclick={() => toggleIn(f.key, k)}>{l}</button>{/each}
          </div>
        {/if}
        {#if f.hint}<p class="hint">{f.hint}</p>{/if}
      </div>
    {/if}
  {/each}
</div>

<style>
  .fields { display: flex; flex-direction: column; gap: 14px; }
  h3 { margin: 6px 0 -4px; font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-3); }
  .field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .lbl { font-size: 12px; font-weight: 500; color: var(--text-2); display: flex; justify-content: space-between; }
  .val { color: var(--text-3); font-weight: 400; }
  .hint { margin: 0; font-size: 11.5px; color: var(--text-3); line-height: 1.45; }
  .hint.inset { margin: -8px 0 0 24px; }
  .note { margin: 0; font-size: 12px; line-height: 1.5; color: var(--text-2); background: var(--surface); border-radius: 8px; padding: 9px 11px; box-shadow: var(--shadow-1); }
  .note.warn { box-shadow: inset 3px 0 0 var(--warn), var(--shadow-1); }
  .check { display: flex; gap: 9px; align-items: flex-start; font-size: 12.5px; line-height: 1.4; }
  .check input { margin: 2px 0 0; accent-color: var(--accent); flex: none; }
  .row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .color { width: 40px; height: 26px; border: 0.5px solid var(--line-strong); border-radius: 6px; padding: 2px; background: var(--surface); }
  .range { width: 100%; accent-color: var(--accent); }
  .pos { display: inline-flex; flex-direction: column; gap: 4px; padding: 6px; border-radius: 8px; background: var(--surface); box-shadow: var(--shadow-1); width: 120px; }
  .prow { display: flex; justify-content: space-between; }
  .pmid { height: 34px; border: 1px dashed var(--line-strong); border-radius: 3px; margin: 0 6px; }
  .pos button { width: 26px; height: 18px; border: 0; background: none; display: grid; place-items: center; border-radius: 4px; }
  .pos button span { width: 14px; height: 4px; border-radius: 2px; background: var(--line-strong); }
  .pos button.on span { background: var(--accent); }
  .pos button:hover { background: var(--hover); }
  .quad { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
  .qi { display: flex; flex-direction: column; gap: 3px; font-size: 11px; color: var(--text-3); }
  .flist { display: flex; flex-direction: column; gap: 4px; }
  .fi { display: flex; align-items: center; gap: 6px; padding: 5px 6px 5px 8px; border-radius: 7px; background: var(--surface); box-shadow: var(--shadow-1); color: var(--text-2); font-size: 12px; }
  .fi .n { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text); }
  .fi .s { font-size: 11px; color: var(--text-3); }
  .fi .ord { width: 16px; text-align: right; color: var(--accent-text); font-weight: 600; font-size: 11px; }
  .tag { font-size: 10px; color: var(--text-3); background: var(--selected); padding: 1px 5px; border-radius: 4px; }
  .ib { width: 20px; height: 20px; border: 0; background: none; border-radius: 4px; display: grid; place-items: center; color: var(--text-3); }
  .ib:hover:not(:disabled) { background: var(--hover); color: var(--text); }
  .ib:disabled { opacity: 0.3; }
  .chip { max-width: 160px; overflow: hidden; text-overflow: ellipsis; }
  .chips { display: flex; flex-wrap: wrap; gap: 5px; }
  .chipt { border: 0.5px solid var(--line-strong); background: var(--surface); border-radius: 999px; height: 24px; padding: 0 10px; font-size: 12px; }
  .chipt[aria-pressed="true"] { background: var(--accent); border-color: transparent; color: var(--on-accent); }
</style>
