<script lang="ts">
  import { L } from '../../lib/i18n';
  import type { Doc } from '../../lib/doc.svelte';
  import { plLoad, plSave } from '../../lib/ops';
  import { applyResult, withBusy, saveFiles } from '../../lib/actions';
  import { pickFiles } from '../../lib/platform';
  import { pyRun } from '../../lib/engines';
  import { fmtSize } from '../../lib/util';
  import * as I from '../../lib/icons';

  let { doc }: { doc: Doc } = $props();
  let items = $state<{ name: string; data: Uint8Array; desc?: string }[]>([]);

  async function load() {
    try {
      const a = (await doc.pdf!.getAttachments()) || {};
      items = Object.values(a).map((x: any) => ({ name: x.filename, data: x.content, desc: x.description }));
    } catch { items = []; }
  }
  $effect(() => { doc.rev; load(); });

  async function add() {
    const files = await pickFiles({ multiple: true, title: L("Dateien anhängen") });
    if (!files.length) return;
    const bytes = await withBusy(L("Dateien werden angehängt"), async () => {
      const pl = await plLoad(await doc.baked());
      for (const f of files) await pl.attach(f.bytes, f.name, { creationDate: new Date(), modificationDate: new Date() });
      return plSave(pl);
    });
    await applyResult({ bytes, label: L("{0} Datei(en) angehängt", files.length) });
  }
  async function remove(name: string) {
    const r = await withBusy(L("Anhang wird entfernt"), async () => pyRun(`doc = open_in()\nfor n in doc.embfile_names():\n    if doc.embfile_info(n).get('filename') == ARGS['name'] or n == ARGS['name']:\n        doc.embfile_del(n)\nfor page in doc:\n    for a in list(page.annots()):\n        if a.type[1] == 'FileAttachment' and a.file_info.get('filename') == ARGS['name']:\n            page.delete_annot(a)\nsave_out(doc)`, { files: { 'in.pdf': await doc.baked() }, outputs: ['out.pdf'], vars: { name } }));
    await applyResult({ bytes: r.files['out.pdf'], label: L("„{0}“ entfernt", name) });
  }
</script>

<div class="bar"><button class="btn sm" onclick={add}><I.Plus size={13} />{L("Datei anhängen")}</button>
  {#if items.length > 1}<button class="btn sm" onclick={() => saveFiles(items.map(i => ({ name: i.name, data: i.data })), L("Anhänge.zip"))}><I.Download size={13} />{L("Alle speichern")}</button>{/if}</div>
<div class="list scroll">
  {#if !items.length}<p class="empty">{L("Keine eingebetteten Dateien. Anhänge eignen sich z. B. für Quelldaten, Excel-Tabellen oder E-Rechnungen (ZUGFeRD).")}</p>{/if}
  {#each items as it (it.name)}
    <div class="row">
      <I.Paperclip size={14} />
      <div class="info"><div class="n" title={it.name}>{it.name}</div><div class="s num">{fmtSize(it.data.length)}{it.desc ? ' · ' + it.desc : ''}</div></div>
      <button class="ib" aria-label={L("Speichern")} title={L("Speichern")} onclick={() => saveFiles([{ name: it.name, data: it.data }])}><I.Download size={13} /></button>
      <button class="ib del" aria-label={L("Entfernen")} title={L("Entfernen")} onclick={() => remove(it.name)}><I.Trash2 size={13} /></button>
    </div>
  {/each}
</div>

<style>
  .bar { display: flex; gap: 6px; padding: 0 12px 8px; flex-wrap: wrap; }
  .list { flex: 1; padding: 0 8px 12px; }
  .empty { color: var(--text-3); font-size: 12px; padding: 4px 6px; line-height: 1.5; }
  .row { display: flex; align-items: center; gap: 8px; padding: 7px 8px; border-radius: 7px; color: var(--text-2); }
  .row:hover { background: var(--hover); }
  .info { flex: 1; min-width: 0; }
  .n { color: var(--text); font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .s { font-size: 11px; color: var(--text-3); }
  .ib { border: 0; background: none; width: 24px; height: 24px; border-radius: 5px; display: grid; place-items: center; color: var(--text-2); }
  .ib:hover { background: var(--pressed); color: var(--text); }
  .ib.del:hover { color: var(--danger); }
</style>
