<script>
  import { theme } from '$lib/stores/theme';
  import { onMount } from 'svelte';

  /** @type {{ id: number; email: string; isAdmin: boolean } | null} */
  export let user = null;

  let isDark = true;

  onMount(() => {
    const update = () =>
      (isDark = document.documentElement.classList.contains('dark'));
    update();
    const obs = new MutationObserver(update);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  });

  async function logout() {
    await fetch('/api/v1/auth/logout', { method: 'POST' });
    window.location.href = '/';
  }
</script>

<nav class="sticky top-0 z-40 w-full border-b border-border bg-bg/85 backdrop-blur supports-[backdrop-filter]:bg-bg/70">
  <div class="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
    <a href="/" class="group flex items-center gap-2.5">
      <span class="grid h-7 w-7 place-items-center rounded-md bg-accent text-accent-fg">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
          <path d="M3 3h7v7H3V3zm2 2v3h3V5H5zm9-2h7v7h-7V3zm2 2v3h3V5h-3zM3 14h7v7H3v-7zm2 2v3h3v-3H5zm9-2h2v2h-2v-2zm4 0h3v2h-2v1h-1v-3zm-4 4h2v3h-2v-3zm4 1h3v2h-3v-2zm-2-1h2v2h-2v-2z"/>
        </svg>
      </span>
      <span class="text-sm font-semibold tracking-tight text-fg">
        Open<span class="text-accent">·</span>QR
      </span>
    </a>

    <div class="flex items-center gap-1 sm:gap-2">
      {#if user}
        <a href="/dashboard" class="hidden sm:inline-flex btn-ghost btn-sm">Dashboard</a>
        {#if user.isAdmin}
          <a href="/admin" class="hidden sm:inline-flex btn-ghost btn-sm">Admin</a>
        {/if}
        <span class="hidden md:inline-block text-xs text-fg-dim font-mono px-2">{user.email}</span>
        <button on:click={logout} class="btn-ghost btn-sm">Log out</button>
      {:else}
        <a href="/login" class="btn-ghost btn-sm">Log in</a>
      {/if}

      <button
        type="button"
        on:click={() => theme.toggle()}
        class="grid h-9 w-9 place-items-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg transition-colors"
        aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
        title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      >
        {#if isDark}
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
          </svg>
        {:else}
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        {/if}
      </button>
    </div>
  </div>
</nav>
