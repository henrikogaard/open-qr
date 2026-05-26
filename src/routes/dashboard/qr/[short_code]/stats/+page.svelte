<script>
  // @ts-nocheck
  import Navbar from '$lib/components/Navbar.svelte';

  export let data;

  $: maxDaily = Math.max(1, ...data.stats.dailyScans.map((d) => d.count));
</script>

<svelte:head>
  <title>Stats — {data.qr.short_code}</title>
</svelte:head>

<Navbar user={data.user} />

<main class="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
  <header class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div>
      <p class="eyebrow">QR analytics</p>
      <h1 class="mt-1 text-3xl font-semibold tracking-tight text-fg">/go/{data.qr.short_code}</h1>
      <p class="mt-1 max-w-2xl truncate text-sm text-fg-muted">{data.qr.target_url}</p>
    </div>
    <div class="flex gap-2">
      <a href={data.shortUrl} target="_blank" rel="noreferrer" class="btn-secondary">Open</a>
      <a href={`/dashboard/qr/${data.qr.short_code}`} class="btn-primary">Edit</a>
    </div>
  </header>

  <div class="grid gap-4 sm:grid-cols-3">
    <section class="card">
      <p class="eyebrow">Total scans</p>
      <p class="mt-2 font-mono text-4xl font-semibold tabular text-fg">{data.stats.totalScans}</p>
    </section>
    <section class="card">
      <p class="eyebrow">Countries</p>
      <p class="mt-2 font-mono text-4xl font-semibold tabular text-fg">{data.stats.byCountry.length}</p>
    </section>
    <section class="card">
      <p class="eyebrow">Recent events</p>
      <p class="mt-2 font-mono text-4xl font-semibold tabular text-fg">{data.stats.recentScans.length}</p>
    </section>
  </div>

  <section class="card mt-6">
    <p class="eyebrow mb-4">Last 30 days</p>
    {#if data.stats.dailyScans.length}
      <div class="space-y-2">
        {#each data.stats.dailyScans as day}
          <div class="grid grid-cols-[7rem_1fr_3rem] items-center gap-3 text-sm">
            <span class="font-mono text-xs text-fg-dim">{day.date}</span>
            <div class="h-2 overflow-hidden rounded-full bg-surface-2">
              <div class="h-full rounded-full bg-accent" style={`width:${Math.max(3, (day.count / maxDaily) * 100)}%`}></div>
            </div>
            <span class="text-right font-mono tabular text-fg">{day.count}</span>
          </div>
        {/each}
      </div>
    {:else}
      <p class="text-sm text-fg-dim">No scans recorded yet.</p>
    {/if}
  </section>

  <div class="mt-6 grid gap-6 lg:grid-cols-2">
    <section class="card">
      <p class="eyebrow mb-4">Countries</p>
      {#each data.stats.byCountry as row}
        <div class="flex justify-between border-b border-border py-2 text-sm last:border-0">
          <span class="font-mono text-fg">{row.country}</span>
          <span class="font-mono tabular text-fg-muted">{row.count}</span>
        </div>
      {:else}
        <p class="text-sm text-fg-dim">No country data yet.</p>
      {/each}
    </section>

    <section class="card">
      <p class="eyebrow mb-4">Device class</p>
      {#each data.stats.byDevice as row}
        <div class="flex justify-between border-b border-border py-2 text-sm last:border-0">
          <span class="capitalize text-fg">{row.device_class}</span>
          <span class="font-mono tabular text-fg-muted">{row.count}</span>
        </div>
      {:else}
        <p class="text-sm text-fg-dim">No device data yet.</p>
      {/each}
    </section>
  </div>

  <section class="card-flush mt-6 overflow-hidden">
    <table class="table">
      <thead><tr><th>Time</th><th>Country</th><th>Device</th></tr></thead>
      <tbody>
        {#each data.stats.recentScans as scan}
          <tr>
            <td class="font-mono text-xs text-fg">{new Date(scan.timestamp).toLocaleString()}</td>
            <td class="font-mono text-xs text-fg-muted">{scan.country || '—'}</td>
            <td class="capitalize text-fg-muted">{scan.device_class || 'unknown'}</td>
          </tr>
        {:else}
          <tr><td colspan="3" class="py-10 text-center text-fg-dim">No scans recorded yet.</td></tr>
        {/each}
      </tbody>
    </table>
  </section>
</main>
