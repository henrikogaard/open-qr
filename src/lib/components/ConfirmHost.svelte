<script>
  import { onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { confirmState, resolveConfirm } from '$lib/stores/confirm';

  /** Focus cancel when the dialog opens — the safer default for destructive actions. */
  function focusOnOpen(node) {
    node.focus();
  }

  function lockScroll(enabled) {
    if (!browser) return;
    document.body.style.overflow = enabled ? 'hidden' : '';
  }

  $: lockScroll(!!$confirmState);

  onDestroy(() => lockScroll(false));
</script>

<svelte:window on:keydown={(e) => e.key === 'Escape' && resolveConfirm(false)} />

{#if $confirmState}
  <div class="fixed inset-0 z-[60] grid place-items-center p-4">
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="absolute inset-0 bg-black/60" aria-hidden="true" on:click={() => resolveConfirm(false)}></div>

    <div
      class="card relative w-full max-w-sm p-6"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-message"
    >
      <h2 id="confirm-dialog-title" class="text-base font-semibold text-fg">{$confirmState.title}</h2>
      <p id="confirm-dialog-message" class="mt-2 text-sm text-fg-muted">{$confirmState.message}</p>

      <div class="mt-6 flex justify-end gap-2">
        <button type="button" class="btn-secondary" use:focusOnOpen on:click={() => resolveConfirm(false)}>
          {$confirmState.cancelLabel}
        </button>
        <button
          type="button"
          class={$confirmState.danger ? 'btn-danger' : 'btn-primary'}
          on:click={() => resolveConfirm(true)}
        >
          {$confirmState.confirmLabel}
        </button>
      </div>
    </div>
  </div>
{/if}
