<script lang="ts" module>
  // Zuletzt markierter Bereich im Text eines Elements – bleibt erhalten, wenn Leiste, Farbwähler oder Auswahlliste den Fokus nehmen
  let saved: Range | null = null;
  let listening = false;
  export function trackSelection() {
    if (listening) return;
    listening = true;
    document.addEventListener('selectionchange', () => {
      const s = getSelection();
      if (!s || !s.rangeCount) return;
      const r = s.getRangeAt(0);
      if ((r.commonAncestorContainer as HTMLElement).parentElement?.closest('.item .tx') || (r.commonAncestorContainer as HTMLElement).closest?.('.item .tx')) saved = r.cloneRange();
    });
  }
  /** Nicht-leere Markierung innerhalb dieses Textfelds */
  export function selectionIn(el: HTMLElement | null): Range | null {
    if (!el || !saved || saved.collapsed || !el.contains(saved.commonAncestorContainer)) return null;
    return saved;
  }
</script>

<script lang="ts">
  import { L } from '../lib/i18n';
  import type { Doc } from '../lib/doc.svelte';
  import { commitItem, removeItem, type OItem } from '../lib/overlay.svelte';
  import { previewFamily, systemFamilies } from '../lib/sysfonts';
  import { BUILTIN, BUILTIN_STACK, escapeHtml } from '../lib/richtext';
  import * as I from '../lib/icons';

  let { doc, it, editor }: { doc: Doc; it: OItem; editor: () => HTMLElement | null } = $props();
  const t = $derived(it as any);
  let families = $state<string[]>([]);
  systemFamilies().then(f => (families = f));

  const isEdit = $derived(it.kind === 'textedit');
  const current = $derived(t.fontChoice ?? (isEdit ? '' : 'Helvetica'));
  const SUBST: Record<string, string> = { sans: 'Helvetica', serif: 'Times', mono: 'Courier' };
  const origName = $derived(((t.fontName as string) || '').replace(/^[A-Z]{6}\+/, '') || L("Originalschrift"));
  const fst = $derived(isEdit && !t.fontChoice ? t.fstate || 'checking' : null);
  const stateLabel = $derived(({ original: L("Eingebettet"), installed: L("Installiert"), substitute: L("Ersatz: {0}", SUBST[t.family || 'sans']), checking: L("Wird geprüft …") } as Record<string, string>)[fst || ''] || '');
  const stateTip = $derived(fst === 'substitute'
    ? L("„{0}“ ist weder vollständig im PDF eingebettet noch auf diesem Rechner installiert. Geschrieben wird mit „{1}“ (ähnliche Laufweite).", origName, SUBST[t.family || 'sans'])
    : fst === 'installed' ? L("Die installierte Schrift „{0}“ wird verwendet und ins PDF eingebettet.", origName)
    : fst === 'original' ? L("Die im PDF eingebettete Schrift enthält alle Zeichen und wird weiterverwendet.") : '');

  /** Änderung am markierten Text (true) – sonst gilt sie für den ganzen Block */
  function inline(cmd: string, value?: string): boolean {
    const el = editor();
    const r = selectionIn(el);
    if (!el || !r) return false;
    // Alles markiert (z. B. direkt nach dem Anklicken): gilt für den ganzen Block
    if (r.toString().trim() === el.innerText.trim()) return false;
    el.focus();
    const s = getSelection()!; s.removeAllRanges(); s.addRange(r);
    document.execCommand('styleWithCSS', false, 'true');
    document.execCommand(cmd, false, value);
    t.html = el.innerHTML; t.text = el.innerText.replace(/\n$/, '');
    return true;
  }
  const done = () => commitItem(doc, it);
  const keep = (e: PointerEvent) => e.preventDefault(); // Fokus und Markierung im Text behalten

  function toggle(cmd: 'bold' | 'italic' | 'underline') {
    if (inline(cmd)) return;
    t[cmd] = !t[cmd]; done();
  }
  function setColor(v: string, final: boolean) {
    if (inline('foreColor', v)) return;
    t.color = v; if (final) done();
  }
  function setSize(n: number) {
    if (!(n > 0)) return;
    n = Math.max(4, Math.min(200, Math.round(n * 2) / 2));
    const el = editor();
    if (selectionIn(el) && inline('fontSize', '7')) {
      // execCommand kennt nur Stufen 1–7: die markierten Stellen auf die gewünschte Größe (relativ zum Block) setzen
      for (const sp of el!.querySelectorAll<HTMLElement>('[style*="xxx-large"], font[size="7"]')) { sp.style.fontSize = `${+(n / t.size).toFixed(3)}em`; sp.removeAttribute('size'); }
      t.html = el!.innerHTML;
      return;
    }
    t.size = n; done();
  }
  async function setFont(name: string) {
    const css = name === '' ? (t.css ? `"${t.css}"` : null) : (BUILTIN as readonly string[]).includes(name) ? BUILTIN_STACK[name] : await previewFamily(name);
    if (css && inline('fontName', css)) return;
    t.fontChoice = name || null;
    t.choiceCss = name && !(BUILTIN as readonly string[]).includes(name) ? css : null;
    done();
  }
  const ALIGN: [string, string, any][] = [['left', L("Linksbündig"), I.AlignLeft], ['center', L("Zentriert"), I.AlignCenter], ['right', L("Rechtsbündig"), I.AlignRight], ['justify', L("Blocksatz"), I.AlignJustify]];
  function setAlign(a: string) { t.align = a; done(); }
  function setLh(v: number) { t.lh = v; done(); }
  function clearFormat() {
    if (inline('removeFormat')) return;
    t.html = escapeHtml(t.text || ''); t.bold = false; t.italic = false; t.underline = false; t.htmlRev = (t.htmlRev || 0) + 1; done();
  }
  function del() { removeItem(doc, it.id); }
  const on = (cmd: string, flag: boolean) => { const el = editor(); return selectionIn(el) ? document.queryCommandState(cmd) : flag; };
</script>

<div class="ttb" role="toolbar" aria-label={L("Text formatieren")} tabindex="-1" onpointerdown={e => e.stopPropagation()}>
  <div class="font">
    <select class="select mini" aria-label={L("Schriftart")} value={current} onchange={e => setFont((e.target as HTMLSelectElement).value)}>
      {#if isEdit}<optgroup label={L("Im Dokument")}><option value="">{origName}</option></optgroup>{/if}
      <optgroup label={L("Eingebaut")}>{#each BUILTIN as b (b)}<option value={b}>{b}</option>{/each}</optgroup>
      {#if families.length}<optgroup label={L("Installiert")}>{#each families as f (f)}<option value={f}>{f}</option>{/each}</optgroup>{/if}
    </select>
    {#if fst}<span class="fstate" data-state={fst} title={stateTip}>{stateLabel}</span>{/if}
  </div>
  <span class="sep"></span>
  <button title={L("Kleiner")} aria-label={L("Kleiner")} onpointerdown={keep} onclick={() => setSize(t.size - 1)}>A−</button>
  <input class="size num" type="number" min="4" max="200" step="0.5" aria-label={L("Schriftgröße")} value={t.size}
    onchange={e => setSize(+(e.target as HTMLInputElement).value)} onkeydown={e => { if (e.key === 'Enter') { e.preventDefault(); setSize(+(e.target as HTMLInputElement).value); } e.stopPropagation(); }} />
  <button title={L("Größer")} aria-label={L("Größer")} onpointerdown={keep} onclick={() => setSize(t.size + 1)}>A+</button>
  <span class="sep"></span>
  <button title={L("Fett (Strg+B)")} aria-label={L("Fett")} class:on={on('bold', !!t.bold)} onpointerdown={keep} onclick={() => toggle('bold')}><I.Bold size={13} /></button>
  <button title={L("Kursiv (Strg+I)")} aria-label={L("Kursiv")} class:on={on('italic', !!t.italic)} onpointerdown={keep} onclick={() => toggle('italic')}><I.Italic size={13} /></button>
  <button title={L("Unterstrichen (Strg+U)")} aria-label={L("Unterstrichen")} class:on={on('underline', !!t.underline)} onpointerdown={keep} onclick={() => toggle('underline')}><I.Underline size={13} /></button>
  <input type="color" title={L("Textfarbe")} aria-label={L("Textfarbe")} value={t.color} oninput={e => setColor((e.target as HTMLInputElement).value, false)} onchange={e => setColor((e.target as HTMLInputElement).value, true)} />
  <span class="sep"></span>
  {#each ALIGN as [a, label, Icon] (a)}
    <button title={label} aria-label={label} class:on={(t.align || 'left') === a} onpointerdown={keep} onclick={() => setAlign(a)}><Icon size={13} /></button>
  {/each}
  <select class="select mini lh" aria-label={L("Zeilenabstand")} title={L("Zeilenabstand")} value={String(t.lh || '')} onchange={e => setLh(+(e.target as HTMLSelectElement).value)}>
    <option value="">{L("Abstand")}</option>
    {#each [1, 1.15, 1.3, 1.5, 2] as v (v)}<option value={String(v)}>{v.toLocaleString()}</option>{/each}
  </select>
  <span class="sep"></span>
  <button title={L("Formatierung entfernen")} aria-label={L("Formatierung entfernen")} onpointerdown={keep} onclick={clearFormat}><I.RemoveFormatting size={13} /></button>
  <button class="del" title={L("Entfernen (Entf)")} aria-label={L("Entfernen")} onpointerdown={keep} onclick={del}><I.Trash2 size={12} /></button>
</div>

<style>
  .ttb { position: absolute; bottom: calc(100% + 8px); left: -2px; display: flex; align-items: center; gap: 1px; padding: 3px; background: var(--surface); border-radius: 8px; box-shadow: var(--shadow-pop); z-index: 4; white-space: nowrap; pointer-events: auto; cursor: default; }
  .ttb button { border: 0; background: none; height: 24px; min-width: 24px; padding: 0 5px; border-radius: 5px; font-size: 11.5px; color: var(--text); display: grid; place-items: center; }
  .ttb button:hover { background: var(--hover); }
  .ttb button.on { background: var(--accent-soft); color: var(--accent-text); }
  .ttb .del:hover { color: var(--danger, #d33); }
  .ttb .sep { width: 1px; height: 16px; background: var(--line); margin: 0 3px; }
  .ttb .font { display: flex; align-items: center; gap: 4px; }
  .ttb select.mini { height: 24px; font-size: 11.5px; max-width: 170px; }
  .ttb select.lh { max-width: 76px; }
  .ttb input.size { width: 46px; height: 22px; font-size: 11.5px; text-align: center; border: 1px solid var(--line); border-radius: 5px; background: var(--field, var(--surface)); color: var(--text); }
  .ttb input[type=color] { width: 22px; height: 22px; padding: 0; border: 0; background: none; }
  .fstate { font-size: 10.5px; padding: 2px 6px; border-radius: 999px; white-space: nowrap; }
  .fstate[data-state='original'], .fstate[data-state='installed'] { background: color-mix(in srgb, #2fa84f 16%, transparent); color: #1f7a39; }
  .fstate[data-state='substitute'] { background: color-mix(in srgb, #f08c00 20%, transparent); color: #9a5a00; }
  .fstate[data-state='checking'] { color: var(--text-2); }
</style>
