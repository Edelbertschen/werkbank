<script lang="ts">
  import { L, intlLocale } from '../../lib/i18n';
  import { active } from '../../lib/app.svelte';
  import { plLoad, plSave } from '../../lib/ops';
  import { applyResult, withBusy } from '../../lib/actions';

  const doc = $derived(active());
  let v = $state({ title: '', author: '', subject: '', keywords: '', creator: '', producer: '', lang: '' });
  let dates = $state({ created: '', modified: '' });
  let orig = '';

  async function load() {
    if (!doc) return;
    const pl = await plLoad(doc.bytes);
    const g = (f: () => any) => { try { return f() || ''; } catch { return ''; } };
    v = { title: g(() => pl.getTitle()), author: g(() => pl.getAuthor()), subject: g(() => pl.getSubject()), keywords: g(() => pl.getKeywords()), creator: g(() => pl.getCreator()), producer: g(() => pl.getProducer()), lang: '' };
    try { const l: any = pl.catalog.lookup((await import('pdf-lib')).PDFName.of(L("Lang"))); v.lang = l ? (l.decodeText ? l.decodeText() : String(l).replace(/^\(|\)$/g, '')) : ''; } catch { v.lang = ''; }
    const d = (f: () => Date | undefined) => { try { const x = f(); return x ? x.toLocaleString(intlLocale()) : '–'; } catch { return '–'; } };
    dates = { created: d(() => pl.getCreationDate()), modified: d(() => pl.getModificationDate()) };
    orig = JSON.stringify(v);
  }
  $effect(() => { doc?.rev; load(); });
  const dirty = $derived(JSON.stringify(v) !== orig);

  async function save() {
    if (!doc) return;
    const bytes = await withBusy(L("Eigenschaften werden gespeichert"), async () => {
      const pl = await plLoad(doc.bytes);
      const { PDFName, PDFString } = await import('pdf-lib');
      pl.setTitle(v.title, { showInWindowTitleBar: !!v.title }); pl.setAuthor(v.author); pl.setSubject(v.subject);
      pl.setKeywords(v.keywords.split(/[,;]/).map(s => s.trim()).filter(Boolean)); pl.setCreator(v.creator); pl.setProducer(v.producer);
      pl.setModificationDate(new Date());
      if (v.lang) pl.catalog.set(PDFName.of(L("Lang")), PDFString.of(v.lang)); else pl.catalog.delete(PDFName.of(L("Lang")));
      return plSave(pl);
    });
    await applyResult({ bytes, label: L("Eigenschaften geändert") });
  }
  const F: [keyof typeof v, string, string][] = [['title', L("Titel"), L("Wird in der Fensterleiste von PDF-Programmen gezeigt")], ['author', L("Autor"), ''], ['subject', L("Thema"), ''], ['keywords', L("Stichwörter"), L("Durch Komma getrennt")], ['lang', L("Sprache"), L("z. B. de-DE – hilft Vorleseprogrammen")], ['creator', L("Erstellt mit"), ''], ['producer', L("PDF-Erzeuger"), '']];
</script>

<div class="p">
  {#each F as [k, l, h] (k)}
    <label class="f"><span>{l}</span><input class="input" bind:value={v[k]} />{#if h}<small>{h}</small>{/if}</label>
  {/each}
  <dl><dt>{L("Erstellt")}</dt><dd>{dates.created}</dd><dt>{L("Geändert")}</dt><dd>{dates.modified}</dd></dl>
  <div class="row">
    <button class="btn" onclick={() => (v = { title: '', author: '', subject: '', keywords: '', creator: '', producer: '', lang: v.lang })}>{L("Alles leeren")}</button>
    <span class="grow"></span>
    <button class="btn primary" disabled={!dirty} onclick={save}>{L("Übernehmen")}</button>
  </div>
</div>

<style>
  .p { display: flex; flex-direction: column; gap: 12px; }
  .f { display: flex; flex-direction: column; gap: 5px; font-size: 12px; color: var(--text-2); font-weight: 500; }
  .f small { font-weight: 400; color: var(--text-3); font-size: 11px; }
  dl { margin: 4px 0 0; display: grid; grid-template-columns: auto 1fr; gap: 3px 12px; font-size: 12px; }
  dt { color: var(--text-3); } dd { margin: 0; }
  .row { display: flex; gap: 8px; margin-top: 4px; }
  .grow { flex: 1; }
</style>
