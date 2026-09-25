<script>
  // @ts-nocheck
  import Navbar from '$lib/components/Navbar.svelte';
  import { confirmDialog } from '$lib/stores/confirm';

  /** @type {{ user: { id: number; email: string; isAdmin: boolean }, sessions: { current: boolean; deviceClass: string; createdAt: string; expiresAt: string }[] }} */
  export let data;

  const DEVICE_LABELS = {
    mobile: 'Phone',
    tablet: 'Tablet',
    desktop: 'Desktop',
    bot: 'Bot/unknown client'
  };

  let signingOut = false;

  // created_at comes from SQLite ("YYYY-MM-DD HH:MM:SS", UTC); expires_at is
  // already ISO. Normalize both before localizing.
  const fmt = (v) => (v.includes('T') ? new Date(v) : new Date(v.replace(' ', 'T') + 'Z')).toLocaleString();

  async function logoutEverywhere() {
    const ok = await confirmDialog({
      title: 'Log out of all devices?',
      message: 'Every active session will be ended, including this one. You will need a new code to sign in again.',
      confirmLabel: 'Log out everywhere',
      danger: true
    });
    if (!ok) return;
    signingOut = true;
    try {
      await fetch('/api/v1/auth/sessions', { method: 'DELETE' });
      window.location.href = '/login';
    } finally {
      signingOut = false;
    }
  }
</script>

<svelte:head>
  <title>Active sessions — Open-QR</title>
</svelte:head>

<Navbar user={data.user} />

<main class="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
  <header class="mb-8">
    <p class="eyebrow">Account</p>
    <h1 class="mt-1 text-3xl font-semibold tracking-tight text-fg">Active sessions</h1>
    <p class="mt-1 text-sm text-fg-muted">
      Devices currently signed in to your account. Sessions expire on their own after 30 days.
    </p>
  </header>

  <div class="card-flush overflow-hidden">
    <table class="table">
      <thead>
        <tr><th>Device</th><th>Signed in</th><th>Expires</th></tr>
      </thead>
      <tbody>
        {#each data.sessions as session}
          <tr>
            <td class="text-fg">
              {DEVICE_LABELS[session.deviceClass] || session.deviceClass}
              {#if session.current}<span class="ml-2 rounded bg-accent/15 px-1.5 py-0.5 text-[11px] font-medium text-accent">This device</span>{/if}
            </td>
            <td class="text-fg-muted">{fmt(session.createdAt)}</td>
            <td class="text-fg-muted">{fmt(session.expiresAt)}</td>
          </tr>
        {/each}
        {#if data.sessions.length === 0}
          <tr><td colspan="3" class="py-10 text-center text-fg-dim">No active sessions.</td></tr>
        {/if}
      </tbody>
    </table>
  </div>

  <div class="mt-6 flex items-center justify-between gap-4">
    <p class="text-xs text-fg-dim">Dates are stored in UTC; shown in your local timezone.</p>
    <button type="button" on:click={logoutEverywhere} disabled={signingOut} class="btn-secondary">
      {signingOut ? 'Signing out…' : 'Log out everywhere'}
    </button>
  </div>
</main>
