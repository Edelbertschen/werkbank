<script lang="ts">
  import { active } from '../../lib/app.svelte';
  import { pyRun } from '../../lib/engines';

  const doc = $derived(active());
  let fonts = $state<{ name: string; type: string; embedded: boolean; subset: boolean; pages: number[] }[] | null>(null);
  let err = $state('');

  async function load() {
    if (!doc) return;
    fonts = null; err = '';
    try {
      const r = await pyRun<any[]>(`
doc = open_in()
seen = {}
for page in doc:
    for xref, ext, typ, basefont, name, enc, *_ in page.get_fonts(full=True):
        key = basefont or name
        e = seen.setdefault(key, {'name': key, 'type': typ, 'embedded': ext not in ('n/a', ''), 'subset': '+' in (basefont or ''), 'pages': []})
        if page.number + 1 not in e['pages']: e['pages'].append(page.number + 1)
list(seen.values())`, { files: { 'in.pdf': doc.bytes } });
      fonts = r.result.map((f: any) => ({ ...f, name: String(f.name).replace(/^[A-Z]{6}\+/, '') })).sort((a: any, b: any) => a.name.localeCompare(b.name));
    } catch (e: any) { err = e.message; }
  }
  $effect(() => { doc?.rev; load(); });
  const missing = $derived(fonts?.filter(f => !f.embedded).length || 0);
  const pages = (p: number[]) => (p.length > 6 ? `${p.slice(0, 5).join(', ')} … (${p.length})` : p.join(', '));
</script>

<div class="p">
  {#if err}<p class="err">{err}</p>
  {:else if !fonts}<p class="muted">Schriften werden gelesen …</p>
  {:else if !fonts.length}<p class="muted">Keine Schriften – das Dokument enthält vermutlich nur Bilder.</p>
  {:else}
    {#if missing}<p class="warn">{missing} Schrift(en) nicht eingebettet. Auf anderen Rechnern kann der Text anders aussehen; für PDF/A und Druckereien „In PDF/A umwandeln“ verwenden.</p>{/if}
    {#each fonts as f (f.name)}
      <div class="f">
        <b>{f.name}</b>
        <span class="tags"><span class="tag">{f.type}</span><span class="tag" class:bad={!f.embedded}>{f.embedded ? (f.subset ? 'Teilmenge eingebettet' : 'eingebettet') : 'nicht eingebettet'}</span></span>
        <span class="pg">Seiten {pages(f.pages)}</span>
      </div>
    {/each}
  {/if}
</div>

<style>
  .p { display: flex; flex-direction: column; gap: 8px; }
  .err { color: var(--danger); margin: 0; }
  .muted { color: var(--text-3); margin: 0; }
  .warn { margin: 0 0 4px; font-size: 12px; line-height: 1.45; padding: 8px 10px; border-radius: 8px; background: color-mix(in srgb, var(--warn) 12%, transparent); }
  .f { display: flex; flex-direction: column; gap: 4px; padding: 8px 10px; background: var(--surface); border-radius: 8px; box-shadow: var(--shadow-1); }
  .f b { font-size: 12.5px; font-weight: 600; overflow-wrap: anywhere; }
  .tags { display: flex; gap: 5px; flex-wrap: wrap; }
  .tag { font-size: 10.5px; padding: 1px 6px; border-radius: 4px; background: var(--selected); color: var(--text-2); }
  .tag.bad { background: color-mix(in srgb, var(--warn) 18%, transparent); }
  .pg { font-size: 11px; color: var(--text-3); }
</style>
