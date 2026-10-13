<script lang="ts">
  import { L } from '../lib/i18n';
  import { app, dismissToast } from '../lib/app.svelte';
  import { menu, closeMenu } from '../lib/menu.svelte';
  import * as I from '../lib/icons';
  import { tick } from 'svelte';

  let menuEl: HTMLDivElement | undefined = $state();
  let pos = $state({ x: 0, y: 0 });
  $effect(() => {
    if (!menu.open) return;
    pos = { x: menu.x, y: menu.y };
    tick().then(() => {
      if (!menuEl) return;
      const r = menuEl.getBoundingClientRect();
      pos = { x: Math.min(menu.x, innerWidth - r.width - 8), y: menu.y + r.height > innerHeight - 8 ? Math.max(8, menu.y - r.height) : menu.y };
    });
  });
</script>

<svelte:window onmousedown={e => { if (menu.open && !(e.target as HTMLElement).closest('.ctxmenu')) closeMenu(); }} onkeydown={e => { if (menu.open && e.key === 'Escape') closeMenu(); }} onblur={closeMenu} />

<div class="toasts" aria-live="polite">
  {#each app.toasts as t (t.id)}
    <div class="toast {t.kind}">
      {#if t.kind === 'ok'}<I.Check size={14} strokeWidth={2.4} />{:else if t.kind === 'error'}<I.CircleAlert size={14} strokeWidth={2.2} />{/if}
      <span>{t.text}</span>
      {#if t.action}<button class="act" onclick={() => { t.action!.run(); dismissToast(t.id); }}>{t.action.label}</button>{/if}
      <button class="x" aria-label={L("Schließen")} onclick={() => dismissToast(t.id)}><I.X size={12} /></button>
    </div>
  {/each}
</div>

{#if menu.open}
  <div class="ctxmenu" role="menu" bind:this={menuEl} style:left={pos.x + 'px'} style:top={pos.y + 'px'}>
    {#each menu.items as it, i (i)}
      {#if it.sep}<hr />
      {:else}
        <button role="menuitem" class:danger={it.danger} disabled={it.disabled} onclick={() => { closeMenu(); it.run?.(); }}>
          <span class="mi">{#if it.icon}<it.icon size={14} strokeWidth={1.7} />{/if}</span>{it.label}
        </button>
      {/if}
    {/each}
  </div>
{/if}

<style>
  .toasts { position: fixed; bottom: 38px; left: 50%; transform: translateX(-50%); z-index: 120; display: flex; flex-direction: column-reverse; gap: 8px; align-items: center; pointer-events: none; width: max-content; max-width: min(640px, calc(100vw - 32px)); }
  .toast { pointer-events: auto; display: flex; align-items: center; gap: 9px; padding: 8px 8px 8px 13px; border-radius: 10px; background: color-mix(in srgb, var(--text) 92%, transparent); color: var(--win); font-size: 12.5px; box-shadow: 0 10px 28px rgba(0, 0, 0, 0.25); animation: pop-in 0.16s ease-out; backdrop-filter: blur(10px); }
  .toast.ok :global(svg:first-child) { color: #5ad37a; }
  .toast.error { background: var(--danger); color: #fff; }
  .toast span { line-height: 1.4; }
  .act { border: 0; background: rgba(255, 255, 255, 0.16); color: inherit; font-weight: 600; height: 22px; padding: 0 9px; border-radius: 6px; white-space: nowrap; }
  .act:hover { background: rgba(255, 255, 255, 0.26); }
  .x { border: 0; background: none; color: inherit; opacity: 0.6; width: 20px; height: 20px; border-radius: 5px; display: grid; place-items: center; }
  .x:hover { opacity: 1; background: rgba(255, 255, 255, 0.12); }
  .ctxmenu { position: fixed; z-index: 130; min-width: 210px; background: var(--surface); border-radius: 9px; box-shadow: var(--shadow-pop); padding: 4px; display: flex; flex-direction: column; animation: pop-in 0.08s; }
  .ctxmenu button { display: flex; align-items: center; gap: 8px; border: 0; background: none; text-align: left; padding: 0 10px 0 6px; height: 26px; border-radius: 5px; font-size: 12.5px; color: var(--text); }
  .ctxmenu button:hover:not(:disabled) { background: var(--accent); color: var(--on-accent); }
  .ctxmenu button:disabled { opacity: 0.4; }
  .ctxmenu button.danger { color: var(--danger); }
  .ctxmenu button.danger:hover { background: var(--danger); color: #fff; }
  .mi { width: 18px; display: grid; place-items: center; }
  hr { border: 0; border-top: 0.5px solid var(--line); margin: 4px 6px; }
</style>
