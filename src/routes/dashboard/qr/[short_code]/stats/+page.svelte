<script>
  // @ts-nocheck
  import Navbar from '$lib/components/Navbar.svelte';
  import { onMount } from 'svelte';

  export let data;

  let stats = data.stats;
  let rangePreset = '30d';
  let granularity = 'day';
  let loadingRange = false;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let rangeTimer;

  // Marks the onboarding checklist step on the dashboard as done.
  onMount(() => {
    try { localStorage.setItem('open-qr-stats-visited', '1'); } catch { /* ignore */ }
  });

  // Range presets in days; 'all' resolves to a year (the server clamps anyway).
  const RANGE_PRESETS = [
    { value: '24h', label: '24 hours', days: 1 },
    { value: '7d', label: '7 days', days: 7 },
    { value: '30d', label: '30 days', days: 30 },
    { value: '90d', label: '90 days', days: 90 }
  ];

  $: presetDays = (RANGE_PRESETS.find((p) => p.value === rangePreset) || { days: 30 }).days;
  $: effectiveGranularity = granularity === 'hour' ? 'hour' : 'day';

  async function loadStats() {
    loadingRange = true;
    try {
      const to = new Date();
      const from = new Date(to.getTime() - presetDays * 24 * 60 * 60 * 1000);
      const params = new URLSearchParams({
        from: from.toISOString(),
        to: to.toISOString(),
        granularity: effectiveGranularity
      });
      const r = await fetch(`/api/v1/qr/${data.qr.short_code}/stats?${params}`);
      const j = await r.json();
      if (j.success) stats = j.data;
    } finally {
      loadingRange = false;
    }
  }

  /** @param {Event} ev */
  function onPresetChange(ev) {
    rangePreset = /** @type {HTMLSelectElement} */ (ev.target).value;
    scheduleReload();
  }

  /** @param {Event} ev */
  function onGranularityChange(ev) {
    granularity = /** @type {HTMLSelectElement} */ (ev.target).value;
    scheduleReload();
  }

  function scheduleReload() {
    clearTimeout(rangeTimer);
    rangeTimer = setTimeout(loadStats, 150);
  }

  $: maxSeries = Math.max(1, ...(stats ? stats.series.map((d) => d.count) : [1]));
  $: maxCountry = Math.max(1, ...(stats ? stats.byCountry.map((d) => d.count) : [1]));
  $: maxDevice = Math.max(1, ...(stats ? stats.byDevice.map((d) => d.count) : [1]));
  $: maxVariant = Math.max(1, ...(stats ? stats.byVariant.map((d) => d.count) : [1]));
  $: seriesTotal = stats ? stats.series.reduce((sum, d) => sum + d.count, 0) : 0;
  $: seriesUniques = stats ? stats.series.reduce((sum, d) => sum + d.uniques, 0) : 0;

  /** @param {string} bucket */
  function bucketLabel(bucket) {
    return stats && stats.range.granularity === 'hour' ? bucket.replace('T', ' ') + ':00' : bucket;
  }
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
      <a href="/dashboard" class="btn-secondary">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
        Back
      </a>
      <a href={`/dashboard/qr/${data.qr.short_code}`} class="btn-primary">Edit</a>
    </div>
  </header>

  {#if data.isStatic}
    <div class="card p-8 text-center">
      <p class="text-base font-semibold text-fg">Static codes aren't tracked</p>
      <p class="mx-auto mt-2 max-w-md text-sm text-fg-muted">
        This QR encodes its content directly — scans open it on the phone without passing through
        this server, so there are no scan events to analyze. Dynamic (URL) codes record scans here.
      </p>
    </div>
  {:else if stats}
    <div class="mb-6 flex flex-wrap items-end gap-3">
      <div>
        <label for="range-preset" class="field-label">Range</label>
        <select id="range-preset" value={rangePreset} on:change={onPresetChange} class="select w-auto">
          {#each RANGE_PRESETS as preset}
            <option value={preset.value}>{preset.label}</option>
          {/each}
        </select>
      </div>
      <div>
        <label for="granularity" class="field-label">Granularity</label>
        <select id="granularity" bind:value={granularity} on:change={onGranularityChange} class="select w-auto">
          <option value="day">Daily</option>
          <option value="hour">Hourly</option>
        </select>
      </div>
      {#if loadingRange}
        <span class="text-xs text-fg-dim">Updating…</span>
      {/if}
    </div>

    <div class="grid gap-4 sm:grid-cols-4">
      <section class="card">
        <p class="eyebrow">Total scans</p>
        <p class="mt-2 font-mono text-4xl font-semibold tabular text-fg">{stats.totalScans}</p>
        <p class="mt-1 text-xs text-fg-dim">all time (humans)</p>
      </section>
      <section class="card">
        <p class="eyebrow">Unique devices</p>
        <p class="mt-2 font-mono text-4xl font-semibold tabular text-fg">{stats.uniqueScans}</p>
        <p class="mt-1 text-xs text-fg-dim">distinct hashed IPs</p>
      </section>
      <section class="card">
        <p class="eyebrow">In range</p>
        <p class="mt-2 font-mono text-4xl font-semibold tabular text-fg">{seriesTotal}</p>
        <p class="mt-1 text-xs text-fg-dim">{seriesUniques} unique</p>
      </section>
      <section class="card">
        <p class="eyebrow">Countries</p>
        <p class="mt-2 font-mono text-4xl font-semibold tabular text-fg">{stats.byCountry.length}</p>
        <p class="mt-1 text-xs text-fg-dim">in range</p>
      </section>
    </div>

    {#if stats.hasVariants}
      <section class="card mt-6">
        <p class="eyebrow mb-4">Target variants (A/B &amp; scheduled)</p>
        {#if stats.byVariant.length}
          {#each stats.byVariant as row}
            <div class="grid grid-cols-[minmax(0,1fr)_3.5rem] items-center gap-3 border-b border-border py-2 text-sm last:border-0 sm:grid-cols-[minmax(0,1fr)_8rem_3.5rem]">
              <span class="min-w-0">
                <span class="block truncate font-mono text-xs text-fg">{row.label}</span>
                <span class="block truncate font-mono text-xs text-fg-dim">{row.targetUrl}</span>
              </span>
              <div class="hidden h-2 overflow-hidden rounded-full bg-surface-2 sm:block">
                <div class="h-full rounded-full bg-accent" style={`width:${Math.max(3, (row.count / maxVariant) * 100)}%`}></div>
              </div>
              <span class="text-right font-mono tabular text-xs text-fg-muted">{row.count}</span>
            </div>
          {/each}
          <p class="mt-3 text-xs text-fg-dim">
            Scans that fell back to the main target URL aren't listed here — compare the variant
            totals against the range total above.
          </p>
        {:else}
          <p class="text-sm text-fg-dim">No variant has served a scan in this range — all traffic used the main target URL.</p>
        {/if}
      </section>
    {/if}

    <section class="card mt-6">
      <div class="mb-4 flex items-baseline justify-between">
        <p class="eyebrow">Scans over time</p>
        <span class="text-xs text-fg-dim">{stats.range.granularity === 'hour' ? 'hourly' : 'daily'} · bars = scans, (u) = uniques</span>
      </div>
      {#if stats.series.length}
        <div class="max-h-96 space-y-1.5 overflow-y-auto">
          {#each stats.series as point}
            <div class="group relative grid grid-cols-[9rem_1fr_4.5rem] items-center gap-3 text-sm">
              <span class="font-mono text-xs text-fg-dim">{bucketLabel(point.bucket)}</span>
              <div class="relative h-2">
                <div class="h-full overflow-hidden rounded-full bg-surface-2">
                  <div class="h-full rounded-full bg-accent" style={`width:${Math.max(3, (point.count / maxSeries) * 100)}%`}></div>
                </div>
                <div
                  class="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-surface px-2 py-1 font-mono text-xs text-fg opacity-0 shadow transition-opacity group-hover:opacity-100"
                  role="tooltip"
                  aria-hidden="true"
                >
                  {bucketLabel(point.bucket)} · {point.count} scans · {point.uniques} unique
                </div>
              </div>
              <span class="text-right font-mono tabular text-xs text-fg">{point.count} <span class="text-fg-dim">({point.uniques}u)</span></span>
            </div>
          {/each}
        </div>
      {:else}
        <p class="text-sm text-fg-dim">No scans in this range.</p>
      {/if}
    </section>

    <div class="mt-6 grid gap-6 lg:grid-cols-2">
      <section class="card" data-testid="by-country">
        <p class="eyebrow mb-4">Countries <span class="font-normal text-fg-dim">in range</span></p>
        {#each stats.byCountry as row}
          <div class="grid grid-cols-[4rem_1fr_3.5rem] items-center gap-3 border-b border-border py-2 text-sm last:border-0">
            <span class="truncate font-mono text-xs text-fg">{row.country}</span>
            <div class="h-2 overflow-hidden rounded-full bg-surface-2">
              <div class="h-full rounded-full bg-accent" style={`width:${Math.max(3, (row.count / maxCountry) * 100)}%`}></div>
            </div>
            <span class="text-right font-mono tabular text-xs text-fg-muted">{row.count}</span>
          </div>
        {:else}
          <p class="text-sm text-fg-dim">No country data in this range.</p>
        {/each}
      </section>

      <section class="card" data-testid="by-device">
        <p class="eyebrow mb-4">Device class <span class="font-normal text-fg-dim">in range</span></p>
        {#each stats.byDevice as row}
          <div class="grid grid-cols-[5rem_1fr_3.5rem] items-center gap-3 border-b border-border py-2 text-sm last:border-0">
            <span class="truncate text-xs capitalize text-fg">{row.device_class}</span>
            <div class="h-2 overflow-hidden rounded-full bg-surface-2">
              <div class="h-full rounded-full bg-accent" style={`width:${Math.max(3, (row.count / maxDevice) * 100)}%`}></div>
            </div>
            <span class="text-right font-mono tabular text-xs text-fg-muted">{row.count}</span>
          </div>
        {:else}
          <p class="text-sm text-fg-dim">No device data in this range.</p>
        {/each}
      </section>
    </div>

    <section class="card-flush mt-6 overflow-hidden">
      <table class="table">
        <thead><tr><th>Time</th><th>Country</th><th>Device</th></tr></thead>
        <tbody>
          {#each stats.recentScans as scan}
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
  {/if}
</main>
