<script>
  import { onMount } from 'svelte';
  import Navbar from '$lib/components/Navbar.svelte';
  import QRCard from '$lib/components/QRCard.svelte';
  
  /** @type {{ user: { id: number; email: string; isAdmin: boolean } }} */
  export let data;
  
  /** @type {any[]} */
  let qrCodes = [];
  let loading = true;
  let filter = 'all';
  
  /** @type {any[]} */
  let apiKeys = [];
  let newKeyName = '';
  let issuingKey = false;
  let revealedToken = '';

  onMount(async () => {
    await Promise.all([loadQRCodes(), loadApiKeys()]);
  });

  async function loadQRCodes() {
    const response = await fetch('/api/v1/qr');
    const result = await response.json();
    if (result.success) {
      qrCodes = result.data;
    }
    loading = false;
  }

  async function loadApiKeys() {
    const response = await fetch('/api/v1/keys');
    const result = await response.json();
    if (result.success) apiKeys = result.data;
  }

  async function issueKey() {
    issuingKey = true;
    try {
      const response = await fetch('/api/v1/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName.trim() || null })
      });
      const result = await response.json();
      if (result.success) {
        revealedToken = result.data.token;
        newKeyName = '';
        await loadApiKeys();
      }
    } finally {
      issuingKey = false;
    }
  }

  /** @param {number} id */
  async function revokeKey(id) {
    if (!confirm('Revoke this API key? Any tool using it will stop working immediately.')) return;
    await fetch(`/api/v1/keys/${id}`, { method: 'DELETE' });
    await loadApiKeys();
  }

  async function copyToken() {
    try {
      await navigator.clipboard.writeText(revealedToken);
    } catch {
      /* ignore */
    }
  }
  
  /** @param {string} shortCode */
  async function deleteQR(shortCode) {
    if (!confirm('Are you sure you want to delete this QR code?')) return;
    
    await fetch(`/api/v1/qr/${shortCode}`, { method: 'DELETE' });
    await loadQRCodes();
  }
  
  /**
   * @param {string} shortCode
   * @param {boolean} active
   */
  async function toggleQR(shortCode, active) {
    await fetch(`/api/v1/qr/${shortCode}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: active ? 1 : 0 })
    });
    await loadQRCodes();
  }
  
  $: filteredQRCodes = qrCodes.filter(qr => {
    if (filter === 'active') return qr.is_active;
    if (filter === 'inactive') return !qr.is_active;
    return true;
  });
</script>

<Navbar user={data.user} />

<main class="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
  <header class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div>
      <p class="eyebrow">Dashboard</p>
      <h1 class="mt-1 text-3xl font-semibold tracking-tight text-fg">My QR codes</h1>
      <p class="mt-1 text-sm text-fg-muted">Manage, edit and audit every code you've generated.</p>
    </div>
    <a href="/" class="btn-primary">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
      Create new
    </a>
  </header>

  <div class="mb-6 inline-flex rounded-md border border-border bg-surface p-1 text-sm">
    {#each [{v:'all',l:'All'},{v:'active',l:'Active'},{v:'inactive',l:'Disabled'}] as opt}
      <button
        type="button"
        on:click={() => (filter = opt.v)}
        class="rounded-[5px] px-3 py-1.5 transition-colors {filter === opt.v ? 'bg-accent text-accent-fg' : 'text-fg-muted hover:text-fg'}"
      >
        {opt.l}
      </button>
    {/each}
  </div>

  {#if loading}
    <div class="card grid place-items-center py-16 text-sm text-fg-dim">Loading…</div>
  {:else if filteredQRCodes.length === 0}
    <div class="grid place-items-center rounded-lg border border-dashed border-border-strong bg-bg-soft py-20 text-center">
      <div class="max-w-sm px-4">
        <div class="mx-auto grid h-12 w-12 place-items-center rounded-md bg-surface-2 text-fg-dim">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
            <path d="M3 3h7v7H3V3zm2 2v3h3V5H5zm9-2h7v7h-7V3zm2 2v3h3V5h-3zM3 14h7v7H3v-7zm2 2v3h3v-3H5zm9-2h2v2h-2v-2zm4 0h3v2h-2v1h-1v-3zm-4 4h2v3h-2v-3zm4 1h3v2h-3v-2zm-2-1h2v2h-2v-2z"/>
          </svg>
        </div>
        <h2 class="mt-4 text-base font-semibold text-fg">No QR codes yet</h2>
        <p class="mt-1.5 text-sm text-fg-muted">Generate your first one — it takes about ten seconds.</p>
        <a href="/" class="btn-primary mt-5">Create your first QR</a>
      </div>
    </div>
  {:else}
    <div class="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
      {#each filteredQRCodes as qr}
        <QRCard {qr} onDelete={deleteQR} onToggle={toggleQR} />
      {/each}
    </div>
  {/if}

  <section class="mt-16 border-t border-border pt-12">
    <div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p class="eyebrow">Developer</p>
        <h2 class="mt-1 text-2xl font-semibold tracking-tight text-fg">API keys</h2>
        <p class="mt-1 text-sm text-fg-muted">
          Use with <span class="font-mono text-xs">Authorization: Bearer …</span> or
          <span class="font-mono text-xs">X-API-Key: …</span> headers.
          <a href="/dashboard/bulk" class="link">Bulk import →</a>
        </p>
      </div>
    </div>

    <div class="card mb-5 flex flex-col gap-3 sm:flex-row sm:items-end">
      <div class="flex-1">
        <label for="api-key-name" class="field-label">Label (optional)</label>
        <input id="api-key-name" type="text" bind:value={newKeyName} placeholder="e.g. CI pipeline" class="input" />
      </div>
      <button on:click={issueKey} disabled={issuingKey} class="btn-primary sm:mb-0">
        {issuingKey ? 'Generating…' : 'Generate key'}
      </button>
    </div>

    {#if revealedToken}
      <div class="alert alert-info mb-5 flex-col items-start gap-3">
        <p class="font-medium">Copy this token now — it will not be shown again.</p>
        <div class="flex w-full items-stretch gap-2">
          <code class="flex-1 truncate rounded-md border border-border-strong bg-surface px-3 py-2 font-mono text-xs text-fg">{revealedToken}</code>
          <button on:click={copyToken} class="btn-secondary btn-sm shrink-0">Copy</button>
          <button on:click={() => (revealedToken = '')} class="btn-ghost btn-sm shrink-0">Dismiss</button>
        </div>
      </div>
    {/if}

    <div class="card-flush overflow-hidden">
      <table class="table">
        <thead>
          <tr>
            <th>Label</th>
            <th>Last used</th>
            <th>Created</th>
            <th class="text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each apiKeys as key}
            <tr>
              <td class="text-fg">{key.name || '—'}</td>
              <td class="text-fg-muted text-xs">{key.last_used_at || 'never'}</td>
              <td class="text-fg-muted text-xs">{key.created_at}</td>
              <td class="text-right">
                <button on:click={() => revokeKey(key.id)} class="text-xs text-danger hover:underline">Revoke</button>
              </td>
            </tr>
          {/each}
          {#if apiKeys.length === 0}
            <tr><td colspan="4" class="py-10 text-center text-fg-dim">No API keys yet.</td></tr>
          {/if}
        </tbody>
      </table>
    </div>
  </section>
</main>
