<script>
  export let qr;
  export let onDelete;
  export let onToggle;

  let copied = false;
  const shortUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/go/${qr.short_code}`;

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(shortUrl);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      /* ignore */
    }
  }
</script>

<article class="card flex flex-col gap-4 transition-colors hover:border-border-strong">
  <header class="flex items-start justify-between gap-3">
    <div class="min-w-0">
      <h3 class="truncate text-sm font-semibold text-fg" title={qr.target_url}>{qr.target_url}</h3>
      <p class="mt-1 font-mono text-xs text-fg-dim">/go/{qr.short_code}</p>
    </div>
    {#if qr.is_active}
      <span class="badge badge-success">Active</span>
    {:else}
      <span class="badge badge-neutral">Disabled</span>
    {/if}
  </header>

  <dl class="grid grid-cols-2 gap-3 text-xs">
    <div>
      <dt class="text-fg-dim">Scans</dt>
      <dd class="mt-0.5 font-mono text-sm tabular text-fg">{qr.scan_count}</dd>
    </div>
    <div>
      <dt class="text-fg-dim">Created</dt>
      <dd class="mt-0.5 text-sm text-fg">{new Date(qr.created_at).toLocaleDateString()}</dd>
    </div>
  </dl>

  {#if qr.expires_at}
    <p class="rounded-md border border-warning/30 bg-warning/10 px-2.5 py-1.5 text-xs text-warning">
      Expires {new Date(qr.expires_at).toLocaleDateString()}
    </p>
  {/if}

  <div class="grid grid-cols-5 gap-1.5 pt-1">
    <button on:click={copyUrl} class="btn-ghost btn-sm" aria-label="Copy URL">
      {#if copied}
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
      {:else}
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      {/if}
    </button>
    <a href={`/dashboard/qr/${qr.short_code}`} class="btn-ghost btn-sm" aria-label="Edit">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
    </a>
    <a href={`/dashboard/qr/${qr.short_code}/stats`} class="btn-ghost btn-sm" aria-label="Stats">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="5"/><rect x="12" y="8" width="3" height="9"/><rect x="17" y="5" width="3" height="12"/></svg>
    </a>
    <button on:click={() => onToggle(qr.short_code, !qr.is_active)} class="btn-ghost btn-sm" aria-label={qr.is_active ? 'Disable' : 'Enable'}>
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>
    </button>
    <button on:click={() => onDelete(qr.short_code)} class="btn-ghost btn-sm text-danger hover:bg-danger/10 hover:text-danger" aria-label="Delete">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
    </button>
  </div>
</article>
