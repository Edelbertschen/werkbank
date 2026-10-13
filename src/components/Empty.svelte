<script lang="ts">
  // Leerer Zustand: sagt, was hier hingehört, und bietet den nächsten Schritt an.
  import type { Snippet } from 'svelte';
  let { icon: Icon, title, text = '', children }: { icon: any; title: string; text?: string; children?: Snippet } = $props();
</script>

<div class="empty-state">
  <span class="ic"><Icon size={20} strokeWidth={1.6} /></span>
  <h3>{title}</h3>
  {#if text}<p>{text}</p>{/if}
  {#if children}<div class="act">{@render children()}</div>{/if}
</div>

<style>
  .empty-state { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 6px; padding: 28px 18px 20px; animation: fade 0.25s var(--ease); }
  @keyframes fade { from { opacity: 0; transform: translateY(3px); } }
  .ic { width: 44px; height: 44px; border-radius: 13px; display: grid; place-items: center; margin-bottom: 6px;
    background: color-mix(in srgb, var(--accent) 9%, var(--surface)); color: var(--accent); box-shadow: inset 0 0 0 0.5px color-mix(in srgb, var(--accent) 22%, transparent); }
  h3 { margin: 0; font: 600 13px/1.3 var(--font-display); color: var(--text); letter-spacing: -0.005em; }
  p { margin: 0; font-size: 12px; line-height: 1.5; color: var(--text-3); max-width: 30ch; text-wrap: pretty; }
  .act { align-self: stretch; display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; margin-top: 10px; }
</style>
