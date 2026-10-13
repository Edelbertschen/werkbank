<script lang="ts">
  import { dialogs, closeDialog } from '../lib/dialogs.svelte';
  import { defaults } from '../lib/fields';
  import Fields from './Fields.svelte';
  import * as I from '../lib/icons';
  import { tick } from 'svelte';

  const top = $derived(dialogs.list[dialogs.list.length - 1]);
  let values = $state<Record<string, any>>({});
  let lastId = -1;
  let box: HTMLDivElement | undefined = $state();

  $effect(() => {
    if (!top || top.id === lastId) return;
    lastId = top.id;
    values = { ...defaults(top.spec.fields), ...(top.spec.values || {}) };
    tick().then(() => {
      const f = box?.querySelector('input:not([type=checkbox]):not([type=color]), textarea, select') as HTMLElement | null;
      (f || box?.querySelector('.btn.primary') as HTMLElement | null)?.focus();
    });
  });

  function press(value: string) { if (top) closeDialog(top.id, { button: value, values: $state.snapshot(values) }); }
  function key(e: KeyboardEvent) {
    if (!top) return;
    if (e.key === 'Escape') { e.stopPropagation(); closeDialog(top.id, null); }
    if (e.key === 'Enter' && !(e.target as HTMLElement).closest('textarea') && !top.spec.component) {
      const p = top.spec.buttons?.find(b => b.primary);
      if (p) { e.preventDefault(); press(p.value); }
    }
  }
</script>

{#if top}
  <div class="dialog-veil" role="presentation" onkeydown={key}>
    <div class="dialog" role="dialog" aria-modal="true" aria-label={top.spec.title} bind:this={box} style:width={(top.spec.width || 440) + 'px'}>
      {#if top.spec.component}
        {@const C = top.spec.component}
        <C {...top.spec.props || {}} title={top.spec.title} done={(r: any) => closeDialog(top.id, r)} />
      {:else}
        <div class="head">
          {#if top.spec.icon}
            <span class="ic {top.spec.icon}">
              {#if top.spec.icon === 'warn'}<I.AlertTriangle size={20} />{:else if top.spec.icon === 'lock'}<I.Lock size={20} />{:else}<I.Info size={20} />{/if}
            </span>
          {/if}
          <div class="tx">
            <h2>{top.spec.title}</h2>
            {#if top.spec.message}<p>{top.spec.message}</p>{/if}
            {#if top.spec.detail}<p class="detail">{top.spec.detail}</p>{/if}
          </div>
        </div>
        {#if top.spec.fields?.length}<div class="fields"><Fields fields={top.spec.fields} bind:values /></div>{/if}
        <div class="buttons">
          {#each top.spec.buttons || [{ label: 'OK', value: 'ok', primary: true }] as b (b.value)}
            <button class="btn" class:primary={b.primary || b.danger} class:danger={b.danger} onclick={() => press(b.value)}>{b.label}</button>
          {/each}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .dialog-veil { position: fixed; inset: 0; z-index: 100; background: rgba(10, 20, 22, 0.3); backdrop-filter: blur(3px); display: grid; place-items: center; padding: 24px; animation: fade-in 0.14s; }
  .dialog { max-width: 100%; max-height: calc(100vh - 48px); overflow: auto; background: var(--surface); border-radius: 16px; box-shadow: var(--shadow-pop); padding: 22px 22px 18px; animation: pop-in 0.18s var(--ease); }
  .head { display: flex; gap: 14px; align-items: flex-start; }
  .ic { width: 40px; height: 40px; border-radius: 11px; display: grid; place-items: center; flex: none; background: var(--accent-soft); color: var(--accent); }
  .ic.warn { background: color-mix(in srgb, var(--warn) 14%, transparent); color: var(--warn); }
  .tx { flex: 1; min-width: 0; }
  h2 { margin: 2px 0 6px; font: 600 16.5px/1.3 var(--font-display); letter-spacing: -0.015em; }
  p { margin: 0 0 4px; color: var(--text-2); line-height: 1.5; font-size: 13px; }
  .detail { font-size: 12px; color: var(--text-3); white-space: pre-wrap; }
  .fields { margin: 16px 0 4px; }
  .buttons { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; flex-wrap: wrap; }
  .buttons .btn { min-width: 84px; }
</style>
