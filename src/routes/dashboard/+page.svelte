<script>
  // @ts-nocheck
  import { onMount } from 'svelte';
  import { confirmDialog } from '$lib/stores/confirm';
  import Navbar from '$lib/components/Navbar.svelte';
  import QRCard from '$lib/components/QRCard.svelte';
  
  /** @type {{ user: { id: number; email: string; isAdmin: boolean } }} */
  export let data;
  
  /** @type {any[]} */
  let qrCodes = [];
  let campaigns = [];
  let loading = true;
  let filter = 'all';
  let campaignFilter = 'all';
  
  /** @type {any[]} */
  let apiKeys = [];
  let newKeyName = '';
  let issuingKey = false;
  let revealedToken = '';
  let adopting = false;

  // Campaign comparison series (last 14 days) + range switch
  /** @type {any[]} */
  let campaignSeries = [];
  let campaignSeriesDays = 14;
  let campaignCompareOpen = false;

  // Webhooks + weekly digest
  /** @type {any[]} */
  let webhooks = [];
  let newWebhookUrl = '';
  let addingWebhook = false;
  let revealedWebhookSecret = '';
  let webhookError = '';
  let digestEnabled = false;
  let digestGlobal = false;

  async function loadCampaignSeries() {
    try {
      const r = await fetch(`/api/v1/campaigns/stats?days=${campaignSeriesDays}`);
      const j = await r.json();
      if (j.success) campaignSeries = j.data.series;
    } catch {/* ignore */}
  }

  /** @param {number} days */
  async function setCampaignSeriesDays(days) {
    campaignSeriesDays = days;
    await loadCampaignSeries();
  }

  /** @param {any} entry Campaign series entry */
  function campaignSparklineMax(entry) {
    return Math.max(1, ...Object.values(entry.days).map(Number));
  }

  /** Zero-filled day list so gaps render as empty buckets. */
  function campaignSparklineDays(entry) {
    const out = [];
    for (let i = campaignSeriesDays - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      out.push({ date: d, count: Number(entry.days[d] || 0) });
    }
    return out;
  }

  async function loadWebhooks() {
    try {
      const r = await fetch('/api/v1/webhooks');
      const j = await r.json();
      if (j.success) webhooks = j.data;
    } catch {/* ignore */}
  }

  async function loadDigest() {
    try {
      const r = await fetch('/api/v1/user/digest');
      const j = await r.json();
      if (j.success) {
        digestEnabled = j.data.enabled;
        digestGlobal = j.data.globallyEnabled;
      }
    } catch {/* ignore */}
  }

  async function addWebhook() {
    const url = newWebhookUrl.trim();
    if (!url) return;
    addingWebhook = true;
    webhookError = '';
    try {
      const r = await fetch('/api/v1/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const j = await r.json();
      if (j.success) {
        revealedWebhookSecret = j.data.secret;
        newWebhookUrl = '';
        await loadWebhooks();
      } else {
        webhookError = j.error?.message || j.message || 'Failed to add webhook';
      }
    } finally {
      addingWebhook = false;
    }
  }

  /** @param {number} id */
  async function deleteWebhook(id) {
    const ok = await confirmDialog({
      title: 'Delete webhook?',
      message: 'This endpoint will stop receiving scan events immediately.',
      confirmLabel: 'Delete',
      danger: true
    });
    if (!ok) return;
    await fetch(`/api/v1/webhooks/${id}`, { method: 'DELETE' });
    await loadWebhooks();
  }

  /** @param {any} hook */
  async function toggleWebhook(hook) {
    await fetch(`/api/v1/webhooks/${hook.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !hook.is_active })
    });
    await loadWebhooks();
  }

  async function copyWebhookSecret() {
    try {
      await navigator.clipboard.writeText(revealedWebhookSecret);
    } catch {/* ignore */}
  }

  async function setDigest(enabled) {
    digestEnabled = enabled;
    await fetch('/api/v1/user/digest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled })
    });
  }

  async function adoptClaimed() {
    adopting = true;
    try {
      await fetch('/api/v1/qr/adopt', { method: 'POST' });
      window.location.reload();
    } finally {
      adopting = false;
    }
  }
  let copied = false;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let copiedTimer;

  onMount(async () => {
    try {
      statsVisited = localStorage.getItem(STATS_VISITED_KEY) === '1';
      onboardingDismissed = localStorage.getItem(ONBOARDING_DISMISSED_KEY) === '1';
    } catch { /* ignore */ }
    await Promise.all([loadQRCodes(), loadCampaigns(), loadApiKeys(), loadWebhooks(), loadDigest()]);
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

  async function loadCampaigns() {
    const response = await fetch('/api/v1/campaigns');
    const result = await response.json();
    if (result.success) campaigns = result.data;
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
    const ok = await confirmDialog({
      title: 'Revoke API key?',
      message: 'Any tool or script using this key will stop working immediately.',
      confirmLabel: 'Revoke',
      danger: true
    });
    if (!ok) return;
    await fetch(`/api/v1/keys/${id}`, { method: 'DELETE' });
    await loadApiKeys();
  }

  async function copyToken() {
    try {
      await navigator.clipboard.writeText(revealedToken);
      copied = true;
      clearTimeout(copiedTimer);
      copiedTimer = setTimeout(() => (copied = false), 1500);
    } catch {
      /* ignore */
    }
  }
  
  /** @param {string} shortCode */
  async function deleteQR(shortCode) {
    const ok = await confirmDialog({
      title: `Delete /go/${shortCode}?`,
      message: 'The code stops resolving immediately and cannot be recovered. Scan history is removed with it.',
      confirmLabel: 'Delete',
      danger: true
    });
    if (!ok) return;

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
    if (campaignFilter !== 'all' && String(qr.campaign_id || '') !== campaignFilter) return false;
    if (filter === 'active') return qr.is_active;
    if (filter === 'inactive') return !qr.is_active;
    return true;
  });

  // --- Overview, onboarding checklist, sort/view/pagination -----------------

  const SORT_OPTIONS = [
    { v: 'newest', l: 'Newest first' },
    { v: 'oldest', l: 'Oldest first' },
    { v: 'scans', l: 'Most scans' },
    { v: 'alpha', l: 'Destination A–Z' }
  ];
  let sortBy = 'newest';
  let viewMode = 'cards';
  let visibleCount = 12;
  /** Codes load client-side; the first dynamic one links the checklist onward. */
  let firstCodeStatsHref = null;

  const STATS_VISITED_KEY = 'open-qr-stats-visited';
  const ONBOARDING_DISMISSED_KEY = 'open-qr-onboarding-dismissed';
  let statsVisited = false;
  let onboardingDismissed = false;

  $: firstCode = qrCodes.find((qr) => qr.kind === 'url') || qrCodes[0];
  $: if (firstCode) firstCodeStatsHref = `/dashboard/qr/${firstCode.short_code}/stats`;

  $: onboardingSteps = [
    { label: 'Create your first QR code', done: data.overview.totalCodes > 0, href: '/' },
    { label: 'Test it — scan with your phone or open its short URL', done: data.overview.totalScans > 0, href: firstCode ? `/go/${firstCode.short_code}` : null },
    { label: 'Open the scan stats for a code', done: statsVisited, href: firstCodeStatsHref },
    { label: 'Protect a code — password, expiry or schedule', done: data.overview.protectedCodes > 0, href: firstCode ? `/dashboard/qr/${firstCode.short_code}` : null }
  ];
  $: onboardingComplete = onboardingSteps.every((s) => s.done);
  $: showOnboarding = !onboardingDismissed && !onboardingComplete;

  function dismissOnboarding() {
    onboardingDismissed = true;
    try { localStorage.setItem(ONBOARDING_DISMISSED_KEY, '1'); } catch { /* ignore */ }
  }

  /**
   * @param {any[]} list
   * @param {string} sort
   */
  function sortCodes(list, sort) {
    const arr = [...list];
    if (sort === 'oldest') arr.reverse();
    else if (sort === 'scans') arr.sort((a, b) => (b.scan_count || 0) - (a.scan_count || 0));
    else if (sort === 'alpha') arr.sort((a, b) => String(a.target_url).localeCompare(String(b.target_url)));
    return arr;
  }
  // sortBy must be read at statement level — inside sortCodes it wouldn't
  // register as a dependency and the sort would never re-run.
  $: sortedQRCodes = sortCodes(filteredQRCodes, sortBy);
  $: pageSize = viewMode === 'list' ? 20 : 12;
  $: visibleCodes = sortedQRCodes.slice(0, visibleCount);

  function resetVisible() {
    visibleCount = pageSize;
  }

  let copiedCode = '';
  /** @param {string} code */
  async function copyShort(code) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/go/${code}`);
      copiedCode = code;
      setTimeout(() => (copiedCode = ''), 1500);
    } catch { /* ignore */ }
  }
</script>

<svelte:head>
  <title>Dashboard — Open-QR</title>
</svelte:head>

<Navbar user={data.user} />

<main class="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
  <header class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div>
      <p class="eyebrow">Dashboard</p>
      <h1 class="mt-1 text-3xl font-semibold tracking-tight text-fg">My QR codes</h1>
      <p class="mt-1 text-sm text-fg-muted">Manage, edit and audit every code you've generated.</p>
    </div>
    <div class="flex flex-col items-stretch gap-2 sm:items-end">
      <a href="/" class="btn-primary">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
        Create new
      </a>
      <div class="flex gap-3 text-xs">
        <a href="/api/v1/export?type=codes" class="link">Export codes CSV</a>
        <span aria-hidden="true" class="text-fg-dim">·</span>
        <a href="/api/v1/export?type=scans" class="link">Export scans CSV</a>
      </div>
    </div>
  </header>

  {#if data.adoptableCount > 0}
    <div class="alert alert-info mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" role="status">
      <span>
        <strong>{data.adoptableCount}</strong> QR {data.adoptableCount === 1 ? 'code was' : 'codes were'} created in this browser while logged out.
        Add {data.adoptableCount === 1 ? 'it' : 'them'} to your account?
      </span>
      <button type="button" on:click={adoptClaimed} disabled={adopting} class="btn-primary btn-sm shrink-0">
        {adopting ? 'Adding…' : `Add to my account`}
      </button>
    </div>
  {/if}

  {#if showOnboarding}
    <section class="card mb-8" data-testid="onboarding" aria-label="Getting started">
      <div class="mb-4 flex items-start justify-between gap-3">
        <div>
          <p class="eyebrow">Getting started</p>
          <p class="mt-1 text-sm text-fg-muted">The basics of every QR workflow — a couple of minutes, all told.</p>
        </div>
        <button type="button" class="btn-ghost btn-sm shrink-0" on:click={dismissOnboarding}>Dismiss</button>
      </div>
      <ol class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {#each onboardingSteps as step, i}
          <li
            class="flex items-start gap-2.5 rounded-md border p-3 text-sm {step.done
              ? 'border-success/40 bg-success/10 text-fg'
              : 'border-border text-fg-muted'}"
          >
            <span class="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-xs {step.done ? 'bg-success/20 text-success' : 'bg-surface-2 text-fg-dim'}">
              {#if step.done}
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>
              {:else}
                {i + 1}
              {/if}
            </span>
            <span class="min-w-0">
              {#if step.href && !step.done}
                <a href={step.href} class="link">{step.label}</a>
              {:else}
                {step.label}
              {/if}
            </span>
          </li>
        {/each}
      </ol>
    </section>
  {/if}

  <section class="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Overview">
    <div class="card">
      <p class="eyebrow">QR codes</p>
      <p class="mt-2 font-mono text-4xl font-semibold tabular text-fg">{data.overview.totalCodes}</p>
      <p class="mt-1 text-xs text-fg-dim">{data.overview.activeCodes} active · {data.overview.protectedCodes} protected</p>
    </div>
    <div class="card">
      <p class="eyebrow">Scans · 7 days</p>
      <p class="mt-2 font-mono text-4xl font-semibold tabular text-fg">{data.overview.scans7d}</p>
      <p class="mt-1 text-xs text-fg-dim">humans, all codes</p>
    </div>
    <div class="card">
      <p class="eyebrow">Scans · 30 days</p>
      <p class="mt-2 font-mono text-4xl font-semibold tabular text-fg">{data.overview.scans30d}</p>
      <p class="mt-1 text-xs text-fg-dim">humans, all codes</p>
    </div>
    <div class="card">
      <p class="eyebrow">All-time scans</p>
      <p class="mt-2 font-mono text-4xl font-semibold tabular text-fg">{data.overview.totalScans}</p>
      <p class="mt-1 text-xs text-fg-dim">humans, all codes</p>
    </div>
  </section>

  <section class="card mb-8" aria-label="Recent scan activity" data-testid="recent-activity">
    <div class="mb-2 flex items-baseline justify-between">
      <p class="eyebrow">Recent scan activity</p>
      <span class="text-xs text-fg-dim">latest 12 human scans</span>
    </div>
    {#if data.overview.recentScans.length}
      <ul class="divide-y divide-border">
        {#each data.overview.recentScans as scan}
          <li class="flex items-center gap-3 py-2 text-sm">
            <span class="w-24 shrink-0 font-mono text-xs tabular text-fg-muted">{scan.timeAgo}</span>
            <a href={`/dashboard/qr/${scan.shortCode}/stats`} class="link truncate font-mono text-xs">/go/{scan.shortCode}</a>
            <span class="ml-auto shrink-0 font-mono text-xs text-fg-dim">{scan.country || '—'}</span>
            <span class="w-16 shrink-0 text-right text-xs capitalize text-fg-dim">{scan.deviceClass || 'unknown'}</span>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="py-6 text-sm text-fg-dim">No scans yet — the moment someone scans one of your codes, it shows up here.</p>
    {/if}
  </section>

  <section class="mb-8">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 class="text-lg font-semibold text-fg">Campaigns</h2>
      {#if campaigns.length > 1}
        <button type="button" class="btn-ghost btn-sm" on:click={() => { campaignCompareOpen = !campaignCompareOpen; if (campaignCompareOpen) loadCampaignSeries(); }}>
          {campaignCompareOpen ? 'Hide comparison' : 'Compare over time'}
        </button>
      {/if}
    </div>

    {#if campaignCompareOpen}
      <div class="card mb-4 space-y-5 p-6">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <p class="eyebrow">Scan comparison</p>
          <div class="inline-flex rounded-md border border-border bg-surface p-1 text-xs">
            {#each [{v:7,l:'7 days'},{v:14,l:'14 days'},{v:30,l:'30 days'}] as opt}
              <button
                type="button"
                on:click={() => setCampaignSeriesDays(opt.v)}
                class="rounded-[5px] px-2.5 py-1 transition-colors {campaignSeriesDays === opt.v ? 'bg-accent text-accent-fg' : 'text-fg-muted hover:text-fg'}"
              >
                {opt.l}
              </button>
            {/each}
          </div>
        </div>
        {#if campaignSeries.length}
          {#each campaignSeries as entry}
            <div>
              <div class="mb-1.5 flex items-baseline justify-between gap-3">
                <span class="truncate text-sm font-medium text-fg">{entry.name}</span>
                <span class="font-mono text-xs tabular text-fg-muted">{entry.total} scans</span>
              </div>
              <div class="flex h-8 items-end gap-[2px]">
                {#each campaignSparklineDays(entry) as day}
                  <div
                    class="flex-1 rounded-t-[2px] bg-accent/80"
                    title="{day.date}: {day.count} scans"
                    style={`height:${Math.max(4, (day.count / campaignSparklineMax(entry)) * 100)}%`}
                  ></div>
                {/each}
              </div>
            </div>
          {/each}
          <p class="text-xs text-fg-dim">Daily human scans per campaign. Campaigns with no scans in the window aren't shown.</p>
        {:else}
          <p class="text-sm text-fg-dim">No campaign scans in this window yet.</p>
        {/if}
      </div>
    {/if}

    <div class="grid gap-4 lg:grid-cols-3">
      {#each campaigns as campaign}
        <article class="card">
          <p class="eyebrow">{campaign.qr_count} codes</p>
          <h2 class="mt-2 truncate text-base font-semibold text-fg">{campaign.name}</h2>
          <p class="mt-1 font-mono text-sm tabular text-fg-muted">{campaign.total_scans} scans</p>
        </article>
      {:else}
        <p class="text-sm text-fg-dim">No campaigns yet — create one from the generator.</p>
      {/each}
    </div>
  </section>

  <div class="mb-6 flex flex-wrap gap-3">
  <div class="inline-flex rounded-md border border-border bg-surface p-1 text-sm">
    {#each [{v:'all',l:'All'},{v:'active',l:'Active'},{v:'inactive',l:'Disabled'}] as opt}
      <button
        type="button"
        on:click={() => { filter = opt.v; resetVisible(); }}
        class="rounded-[5px] px-3 py-1.5 transition-colors {filter === opt.v ? 'bg-accent text-accent-fg' : 'text-fg-muted hover:text-fg'}"
      >
        {opt.l}
      </button>
    {/each}
  </div>
  <select bind:value={campaignFilter} on:change={resetVisible} class="select w-auto min-w-44">
    <option value="all">All campaigns</option>
    {#each campaigns as campaign}
      <option value={campaign.id}>{campaign.name}</option>
    {/each}
  </select>
  <select id="sort-by" bind:value={sortBy} on:change={resetVisible} class="select w-auto min-w-40" aria-label="Sort codes">
    {#each SORT_OPTIONS as opt}
      <option value={opt.v}>{opt.l}</option>
    {/each}
  </select>
  <div class="inline-flex rounded-md border border-border bg-surface p-1 text-sm" role="group" aria-label="View mode">
    <button
      type="button"
      on:click={() => { if (viewMode !== 'cards') { viewMode = 'cards'; resetVisible(); } }}
      class="grid h-8 w-9 place-items-center rounded-[5px] transition-colors {viewMode === 'cards' ? 'bg-accent text-accent-fg' : 'text-fg-muted hover:text-fg'}"
      aria-label="Card view"
      title="Card view"
    >
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
    </button>
    <button
      type="button"
      on:click={() => { if (viewMode !== 'list') { viewMode = 'list'; resetVisible(); } }}
      class="grid h-8 w-9 place-items-center rounded-[5px] transition-colors {viewMode === 'list' ? 'bg-accent text-accent-fg' : 'text-fg-muted hover:text-fg'}"
      aria-label="List view"
      title="Compact list view"
    >
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/></svg>
    </button>
  </div>
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
    {#if viewMode === 'cards'}
      <div class="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
        {#each visibleCodes as qr}
          <QRCard {qr} onDelete={deleteQR} onToggle={toggleQR} />
        {/each}
      </div>
    {:else}
      <div class="card-flush overflow-x-auto">
        <table class="table">
          <thead>
            <tr>
              <th class="w-14">QR</th>
              <th>Code</th>
              <th>Destination</th>
              <th>Status</th>
              <th class="text-right">Scans</th>
              <th>Created</th>
              <th class="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each visibleCodes as qr}
              <tr>
                <td>
                  <a href={`/dashboard/qr/${qr.short_code}`} class="block w-10 overflow-hidden rounded border border-border bg-white" tabindex="-1" aria-hidden="true">
                    <img src={`/api/v1/qr/${qr.short_code}/image`} alt="" loading="lazy" class="aspect-square w-full" />
                  </a>
                </td>
                <td class="font-mono text-xs"><a href={`/dashboard/qr/${qr.short_code}`} class="link">/go/{qr.short_code}</a></td>
                <td class="max-w-xs truncate text-xs" title={qr.target_url}>
                  {#if qr.kind && qr.kind !== 'url'}
                    <span class="badge badge-neutral">Static · {qr.kind}</span>
                  {:else}
                    {qr.target_url}
                  {/if}
                </td>
                <td>
                  {#if qr.is_active}
                    <span class="badge badge-success">Active</span>
                  {:else}
                    <span class="badge badge-neutral">Disabled</span>
                  {/if}
                </td>
                <td class="text-right font-mono text-xs tabular">{qr.kind && qr.kind !== 'url' ? '—' : qr.scan_count}</td>
                <td class="text-xs text-fg-muted">{new Date(qr.created_at).toLocaleDateString()}</td>
                <td class="text-right">
                  <div class="flex justify-end gap-3 text-xs">
                    <button on:click={() => copyShort(qr.short_code)} class="link" aria-live="polite">{copiedCode === qr.short_code ? 'Copied' : 'Copy'}</button>
                    <a href={`/dashboard/qr/${qr.short_code}/stats`} class="link">Stats</a>
                    <button on:click={() => toggleQR(qr.short_code, !qr.is_active)} class="link">{qr.is_active ? 'Disable' : 'Enable'}</button>
                    <button on:click={() => deleteQR(qr.short_code)} class="text-danger hover:underline">Delete</button>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
    {#if visibleCount < sortedQRCodes.length}
      <div class="mt-6 text-center">
        <button type="button" class="btn-secondary" on:click={() => (visibleCount += pageSize)}>
          Load more — {sortedQRCodes.length - visibleCount} remaining
        </button>
      </div>
    {:else if sortedQRCodes.length > pageSize}
      <p class="mt-4 text-center text-xs text-fg-dim">Showing all {sortedQRCodes.length} codes</p>
    {/if}
  {/if}

  <section class="mt-16 border-t border-border pt-12">
    <div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p class="eyebrow">Notifications</p>
        <h2 class="mt-1 text-2xl font-semibold tracking-tight text-fg">Webhooks &amp; digests</h2>
        <p class="mt-1 text-sm text-fg-muted">
          Get told when your codes are scanned: push events to your own endpoint, or get a weekly email summary.
        </p>
      </div>
    </div>

    <div class="card mb-5 flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p class="text-sm font-medium text-fg">Weekly scan digest</p>
        <p class="mt-0.5 text-xs text-fg-muted">
          {digestGlobal
            ? 'A weekly email with your total scans and top codes.'
            : 'Currently disabled by the operator (ENABLE_WEEKLY_DIGEST). Your preference is saved anyway.'}
        </p>
      </div>
      <label class="flex cursor-pointer items-center gap-2 text-sm text-fg">
        <input type="checkbox" checked={digestEnabled} on:change={(e) => setDigest(e.target.checked)} class="checkbox" />
        <span>{digestEnabled ? 'Subscribed' : 'Subscribe'}</span>
      </label>
    </div>

    <div class="card mb-5 flex-col gap-3 p-5 sm:flex-row sm:items-end">
      <div class="flex-1">
        <label for="webhook-url" class="field-label">Webhook endpoint URL</label>
        <input id="webhook-url" type="url" bind:value={newWebhookUrl} placeholder="https://example.com/hooks/open-qr" class="input" />
        <p class="mt-1.5 text-xs text-fg-dim">
          POSTs a JSON scan event signed with <span class="font-mono">X-OpenQR-Signature</span> (HMAC-SHA256 of the raw body with the webhook secret). Private/internal addresses are rejected.
        </p>
      </div>
      <button on:click={addWebhook} disabled={addingWebhook || !newWebhookUrl.trim()} class="btn-primary shrink-0">
        {addingWebhook ? 'Adding…' : 'Add webhook'}
      </button>
    </div>

    {#if webhookError}
      <div class="alert alert-danger mb-5" role="alert"><span>{webhookError}</span></div>
    {/if}

    {#if revealedWebhookSecret}
      <div class="alert alert-info mb-5 flex-col items-start gap-3" role="status">
        <p class="font-medium">Copy this signing secret now — it will not be shown again.</p>
        <div class="flex w-full items-stretch gap-2">
          <code class="flex-1 truncate rounded-md border border-border-strong bg-surface px-3 py-2 font-mono text-xs text-fg">{revealedWebhookSecret}</code>
          <button on:click={copyWebhookSecret} class="btn-secondary btn-sm shrink-0">Copy</button>
          <button on:click={() => (revealedWebhookSecret = '')} class="btn-ghost btn-sm shrink-0">Dismiss</button>
        </div>
      </div>
    {/if}

    <div class="card-flush overflow-hidden">
      <table class="table">
        <thead>
          <tr>
            <th>Endpoint</th>
            <th>Last delivery</th>
            <th>Status</th>
            <th class="text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each webhooks as hook}
            <tr>
              <td class="max-w-xs truncate font-mono text-xs text-fg" title={hook.url}>{hook.url}</td>
              <td class="text-xs text-fg-muted">{hook.last_delivery_at ? new Date(hook.last_delivery_at).toLocaleString() : 'never'}</td>
              <td>
                {#if !hook.is_active}
                  <span class="badge badge-neutral">paused</span>
                {:else if !hook.last_status || hook.last_status === 'ok' || hook.last_status.startsWith('HTTP 2')}
                  <span class="badge badge-success">{hook.last_status || 'not yet delivered'}</span>
                {:else}
                  <span class="badge badge-warning" title={hook.last_status}>failing</span>
                {/if}
              </td>
              <td class="text-right">
                <div class="flex justify-end gap-3 text-xs">
                  <button on:click={() => toggleWebhook(hook)} class="link">{hook.is_active ? 'Pause' : 'Resume'}</button>
                  <button on:click={() => deleteWebhook(hook.id)} class="text-danger hover:underline">Delete</button>
                </div>
              </td>
            </tr>
          {/each}
          {#if webhooks.length === 0}
            <tr><td colspan="4" class="py-10 text-center text-fg-dim">No webhooks yet.</td></tr>
          {/if}
        </tbody>
      </table>
    </div>
  </section>

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
      <div class="alert alert-info mb-5 flex-col items-start gap-3" role="status">
        <p class="font-medium">Copy this token now — it will not be shown again.</p>
        <div class="flex w-full items-stretch gap-2">
          <code class="flex-1 truncate rounded-md border border-border-strong bg-surface px-3 py-2 font-mono text-xs text-fg">{revealedToken}</code>
          <button on:click={copyToken} class="btn-secondary btn-sm shrink-0" aria-live="polite">{copied ? 'Copied' : 'Copy'}</button>
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
