import { writable } from 'svelte/store';

export interface ConfirmOptions {
  title: string;
  message: string;
  /** Confirm-button label, defaults to "Confirm". */
  confirmLabel?: string;
  /** Cancel-button label, defaults to "Cancel". */
  cancelLabel?: string;
  /** Renders the confirm button in the danger style for destructive actions. */
  danger?: boolean;
}

interface ActiveConfirm extends Required<ConfirmOptions> {
  resolve: (confirmed: boolean) => void;
}

export const confirmState = writable<ActiveConfirm | null>(null);

/**
 * Promise-based replacement for window.confirm(), rendered by ConfirmHost in
 * the root layout. Resolves true when confirmed, false on cancel/Escape/backdrop.
 */
export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    confirmState.set({
      confirmLabel: 'Confirm',
      cancelLabel: 'Cancel',
      danger: false,
      ...opts,
      resolve
    });
  });
}

/** Called only by ConfirmHost; safe to invoke when no dialog is open. */
export function resolveConfirm(confirmed: boolean) {
  confirmState.update((active) => {
    active?.resolve(confirmed);
    return null;
  });
}
