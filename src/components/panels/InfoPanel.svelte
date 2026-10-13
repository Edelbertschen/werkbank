<script lang="ts">
  import { active } from '../../lib/app.svelte';
  import { plLoad } from '../../lib/ops';
  import { pageTexts } from '../../lib/pdf';
  import { countSignatures } from '../../lib/sign';
  import { fmtSize, paperName, mm, fmtNum } from '../../lib/util';

  const doc = $derived(active());
  let info = $state<Record<string, string>>({});
  let formats = $state<[string, number][]>([]);
  let stats = $state({ words: 0, chars: 0, emptyPages: 0 });

  async function load() {
    if (!doc) return;
    const b = doc.bytes;
    const head = new TextDecoder('latin1').decode(b.subarray(0, 32));
    const ver = head.match(/%PDF-(\d\.\d)/)?.[1] || '?';
    const meta: any = (await doc.pdf!.getMetadata().catch(() => ({ info: {} }))).info || {};
    let fields = 0; try { fields = (await plLoad(b)).getForm().getFields().length; } catch { /* egal */ }
    let att = 0; try { att = Object.keys((await doc.pdf!.getAttachments()) || {}).length; } catch { /* egal */ }
    let outline = 0; try { outline = ((await doc.pdf!.getOutline()) || []).length; } catch { /* egal */ }
    const linearized = /\/Linearized/.test(new TextDecoder('latin1').decode(b.subarray(0, 1024)));
    info = {
      'Datei': doc.name, 'Ort': doc.path || 'noch nicht gespeichert', 'Größe': fmtSize(b.length), 'PDF-Version': ver,
      'Seiten': String(doc.numPages), 'Titel': meta.Title || '–', 'Autor': meta.Author || '–', 'Erstellt mit': meta.Creator || '–', 'PDF-Erzeuger': meta.Producer || '–',
      'Formularfelder': String(fields), 'Anhänge': String(att), 'Lesezeichen': outline ? `${outline} (1. Ebene)` : 'keine', 'Signaturen': String(countSignatures(b)),
      'Schutz': doc.protection ? 'wird beim Speichern verschlüsselt' : doc.wasEncrypted ? 'war geschützt, Arbeitsfassung offen' : 'keiner',
      'Web-optimiert': linearized ? 'ja' : 'nein', 'PDF/A': meta.Custom?.['pdfaid:part'] ? `PDF/A-${meta.Custom['pdfaid:part']}` : /pdfaid/.test(new TextDecoder('latin1').decode(b.subarray(0, Math.min(b.length, 200000)))) ? 'ja (laut XMP)' : 'nein',
    };
    const m = new Map<string, number>();
    for (const p of doc.pages) { const k = `${paperName(p.w, p.h) || 'Eigenes'} · ${mm(p.w)} × ${mm(p.h)} mm`; m.set(k, (m.get(k) || 0) + 1); }
    formats = [...m.entries()].sort((a, b) => b[1] - a[1]);
    const texts = await pageTexts(doc.pdf!);
    const words = texts.reduce((a, t) => a + (t.match(/[\p{L}\p{N}]+/gu)?.length || 0), 0);
    stats = { words, chars: texts.reduce((a, t) => a + t.replace(/\s/g, '').length, 0), emptyPages: texts.filter(t => !t.trim()).length };
  }
  $effect(() => { doc?.rev; load(); });
</script>

<div class="p">
  <dl>{#each Object.entries(info) as [k, v] (k)}<dt>{k}</dt><dd title={v}>{v}</dd>{/each}</dl>
  <h3>Text</h3>
  <dl>
    <dt>Wörter</dt><dd class="num">{fmtNum(stats.words)}</dd>
    <dt>Zeichen</dt><dd class="num">{fmtNum(stats.chars)}</dd>
    <dt>Lesezeit</dt><dd>{stats.words ? `etwa ${Math.max(1, Math.round(stats.words / 220))} Min.` : '–'}</dd>
    <dt>Seiten ohne Text</dt><dd class="num">{stats.emptyPages}{stats.emptyPages ? ' (gescannt oder leer – Texterkennung hilft)' : ''}</dd>
  </dl>
  <h3>Seitenformate</h3>
  <ul>{#each formats as [k, n] (k)}<li><span>{k}</span><span class="num">{n}×</span></li>{/each}</ul>
</div>

<style>
  .p { display: flex; flex-direction: column; gap: 10px; }
  dl { margin: 0; display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 5px 12px; font-size: 12px; }
  dt { color: var(--text-3); white-space: nowrap; }
  dd { margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; user-select: text; }
  h3 { margin: 8px 0 0; font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-3); }
  ul { margin: 0; padding: 0; list-style: none; font-size: 12px; display: flex; flex-direction: column; gap: 4px; }
  li { display: flex; justify-content: space-between; gap: 8px; }
</style>
