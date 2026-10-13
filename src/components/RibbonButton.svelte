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
  .rb { border: 0; background: none; color: var(--text); border-radius: 8px; display: flex; align-items: center; transition: background-color 0.12s, color 0.12s; }
  .rb:hover:not(:disabled) { background: var(--hover); }
  .rb:active:not(:disabled) { background: var(--pressed); }
  .rb:disabled { opacity: 0.34; }
  .rb.on { background: var(--accent-soft); color: var(--accent-text); }
  .large { flex-direction: column; justify-content: flex-start; gap: 5px; min-width: 56px; max-width: 92px; min-height: 64px; padding: 7px 7px 4px; }
  .large .ic { height: 24px; display: grid; place-items: center; color: var(--text); }
  .large.on .ic { color: var(--accent); }
  .large .lb { font-size: 11.25px; font-weight: 500; font-stretch: 94%; line-height: 1.16; text-align: center; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; hyphens: auto; }
  .small { gap: 7px; height: 22px; padding: 0 9px 0 5px; white-space: nowrap; font-size: 12px; font-weight: 500; }
  .small .ic { width: 18px; display: grid; place-items: center; color: var(--text-2); }
  .small:hover:not(:disabled) .ic { color: var(--text); }
  .small.on .ic { color: var(--accent); }
</style>
