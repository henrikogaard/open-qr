import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export type ThemeMode = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'open-qr-theme';

function readInitial(): ThemeMode {
  if (!browser) return 'system';
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    /* ignore */
  }
  return 'system';
}

function applyDom(mode: ThemeMode) {
  if (!browser) return;
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = mode === 'dark' || (mode === 'system' && prefersDark);
  document.documentElement.classList.toggle('dark', dark);
}

function createThemeStore() {
  const { subscribe, set } = writable<ThemeMode>(readInitial());

  if (browser) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', () => {
      const current = readInitial();
      if (current === 'system') applyDom('system');
    });
  }

  return {
    subscribe,
    set(mode: ThemeMode) {
      set(mode);
      if (browser) {
        try {
          localStorage.setItem(STORAGE_KEY, mode);
        } catch {
          /* ignore */
        }
        applyDom(mode);
      }
    },
    toggle() {
      const current = readInitial();
      const prefersDark = browser
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
        : true;
      const isDark =
        current === 'dark' || (current === 'system' && prefersDark);
      this.set(isDark ? 'light' : 'dark');
    }
  };
}

export const theme = createThemeStore();
