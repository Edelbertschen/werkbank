<script lang="ts">
  import { app, active } from '../lib/app.svelte';
  import { tool, hasTool } from '../lib/tools';
  import { openTool } from '../lib/ui.svelte';
  import { label as scLabel } from '../lib/shortcuts';

  let { id, size = 's' }: { id: string; size?: 'L' | 's' } = $props();
  const t = $derived(hasTool(id) ? tool(id) : null);
  const doc = $derived(active());
  const disabled = $derived(!!t && ((!t.noDoc && !doc) || !!t.disabled?.()));
  const on = $derived(!!t && (t.active?.() || (app.pane?.tool === id)));
  const tip = $derived(t ? `${t.label}${t.shortcut ? '  (' + scLabel(t.shortcut) + ')' : ''}${t.desc ? '\n' + t.desc : ''}` : '');
</script>

{#if t}
  <button class="rb {size === 'L' ? 'large' : 'small'}" class:on {disabled} title={tip} aria-label={t.label} aria-pressed={t.mode || t.active ? on : undefined} onclick={() => openTool(id)}>
    <span class="ic"><t.icon size={size === 'L' ? 22 : 15} strokeWidth={size === 'L' ? 1.5 : 1.75} /></span>
    <span class="lb">{t.short || t.label}</span>
  </button>
{/if}

<style>
  .rb { border: 0; background: none; color: var(--text); border-radius: 6px; display: flex; align-items: center; }
  .rb:hover:not(:disabled) { background: var(--hover); }
  .rb:active:not(:disabled) { background: var(--pressed); }
  .rb:disabled { opacity: 0.38; }
  .rb.on { background: var(--accent-soft); color: var(--accent-text); }
  .large { flex-direction: column; justify-content: flex-start; gap: 4px; min-width: 54px; max-width: 92px; min-height: 66px; padding: 6px 6px 4px; }
  .large .ic { height: 26px; display: grid; place-items: center; color: var(--text); }
  .large.on .ic { color: var(--accent-text); }
  .large .lb { font-size: 11px; line-height: 1.18; text-align: center; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; hyphens: auto; }
  .small { gap: 6px; height: 22px; padding: 0 8px 0 5px; white-space: nowrap; font-size: 12px; }
  .small .ic { width: 18px; display: grid; place-items: center; color: var(--text-2); }
  .small.on .ic { color: var(--accent-text); }
</style>
