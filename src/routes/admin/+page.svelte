<script>
  // @ts-nocheck
  import { onMount } from 'svelte';
  import Navbar from '$lib/components/Navbar.svelte';
  
  export let data;
  
  let activeTab = 'qrs';
  let qrCodes = [];
  let blacklist = { enabled: true, suspiciousEnabled: true, patterns: [] };
  let settings = {};
  let analytics = {};
  let newPattern = '';
  let isRegex = false;
  
  onMount(() => {
    loadData();
  });
  
  async function loadData() {
    await Promise.all([
      loadQRs(),
      loadBlacklist(),
      loadSettings(),
      loadAnalytics()
    ]);
  }
  
  async function loadQRs() {
    const response = await fetch('/api/v1/admin/qr');
    const result = await response.json();
    if (result.success) qrCodes = result.data;
  }
  
  async function loadBlacklist() {
    const response = await fetch('/api/v1/admin/blacklist');
    const result = await response.json();
    if (result.success) blacklist = result.data;
  }
  
  async function loadSettings() {
    const response = await fetch('/api/v1/admin/settings');
    const result = await response.json();
    if (result.success) settings = result.data;
  }
  
  async function loadAnalytics() {
    const response = await fetch('/api/v1/admin/analytics');
    const result = await response.json();
    if (result.success) analytics = result.data;
  }
  
  async function addPattern() {
    await fetch('/api/v1/admin/blacklist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pattern: newPattern, isRegex })
    });
    newPattern = '';
    isRegex = false;
    await loadBlacklist();
  }
  
  async function removePattern(id) {
    await fetch(`/api/v1/admin/blacklist?id=${id}`, { method: 'DELETE' });
    await loadBlacklist();
  }

  async function deleteQR(shortCode) {
    if (!confirm('Delete this QR code?')) return;
    await fetch(`/api/v1/qr/${shortCode}`, { method: 'DELETE' });
    await loadQRs();
    await loadAnalytics();
  }
  
  async function toggleBlacklist(enabled) {
    await fetch('/api/v1/admin/blacklist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled })
    });
    await loadBlacklist();
  }
  
  async function toggleSuspicious(enabled) {
    await fetch('/api/v1/admin/blacklist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ suspiciousEnabled: enabled })
    });
    await loadBlacklist();
  }
  
  async function updateSetting(key, value) {
    await fetch('/api/v1/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: value })
    });
  }
</script>

<Navbar user={data.user} />

<main class="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
  <header class="mb-8">
    <p class="eyebrow">Admin</p>
    <h1 class="mt-1 text-3xl font-semibold tracking-tight text-fg">Control panel</h1>
    <p class="mt-1 text-sm text-fg-muted">Global QR management, blacklist, settings and analytics.</p>
  </header>

  <div class="mb-8 flex gap-1 border-b border-border overflow-x-auto">
    {#each [{v:'qrs',l:'QR codes'},{v:'blacklist',l:'Blacklist'},{v:'settings',l:'Settings'},{v:'analytics',l:'Analytics'}] as t}
      <button
        type="button"
        on:click={() => (activeTab = t.v)}
        class="-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors {activeTab === t.v ? 'border-accent text-fg' : 'border-transparent text-fg-muted hover:text-fg'}"
      >
        {t.l}
      </button>
    {/each}
  </div>

  {#if activeTab === 'qrs'}
    <div class="card-flush overflow-hidden">
      <div class="overflow-x-auto">
        <table class="table">
          <thead>
            <tr>
              <th>Short code</th>
              <th>Target URL</th>
              <th>Scans</th>
              <th>Status</th>
              <th class="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each qrCodes as qr}
              <tr>
                <td class="font-mono text-xs text-fg">{qr.short_code}</td>
                <td class="max-w-xs truncate text-fg-muted">{qr.target_url}</td>
                <td class="font-mono tabular text-fg">{qr.scan_count}</td>
                <td>
                  {#if qr.is_active}
                    <span class="badge badge-success">Active</span>
                  {:else}
                    <span class="badge badge-neutral">Disabled</span>
                  {/if}
                </td>
                <td class="text-right">
                  <button on:click={() => deleteQR(qr.short_code)} class="text-xs text-danger hover:underline">Delete</button>
                </td>
              </tr>
            {/each}
            {#if qrCodes.length === 0}
              <tr><td colspan="5" class="py-12 text-center text-fg-dim">No QR codes yet.</td></tr>
            {/if}
          </tbody>
        </table>
      </div>
    </div>

  {:else if activeTab === 'blacklist'}
    <div class="space-y-6">
      <div class="card flex flex-wrap items-center gap-6">
        <label class="flex items-center gap-2 text-sm text-fg">
          <input type="checkbox" checked={blacklist.enabled} on:change={(e) => toggleBlacklist(e.target.checked)} class="checkbox" />
          <span>Enable blacklist</span>
        </label>
        <label class="flex items-center gap-2 text-sm text-fg">
          <input type="checkbox" checked={blacklist.suspiciousEnabled} on:change={(e) => toggleSuspicious(e.target.checked)} class="checkbox" />
          <span>Block suspicious URLs</span>
        </label>
      </div>

      <div class="card flex flex-col gap-3 sm:flex-row sm:items-end">
        <div class="flex-1">
          <label for="bl-pattern" class="field-label">New pattern</label>
          <input id="bl-pattern" type="text" bind:value={newPattern} placeholder="evil.com or *.bad.com" class="input" />
        </div>
        <label class="flex items-center gap-2 text-sm text-fg sm:pb-2.5">
          <input type="checkbox" bind:checked={isRegex} class="checkbox" />
          <span>Regex</span>
        </label>
        <button on:click={addPattern} class="btn-primary sm:mb-0">Add</button>
      </div>

      <div class="card-flush overflow-hidden">
        <table class="table">
          <thead>
            <tr><th>Pattern</th><th>Type</th><th class="text-right">Actions</th></tr>
          </thead>
          <tbody>
            {#each blacklist.patterns as pattern}
              <tr>
                <td class="font-mono text-xs text-fg">{pattern.pattern}</td>
                <td class="text-fg-muted">{pattern.is_regex ? 'Regex' : 'Exact'}</td>
                <td class="text-right">
                  <button on:click={() => removePattern(pattern.id)} class="text-xs text-danger hover:underline">Remove</button>
                </td>
              </tr>
            {/each}
            {#if blacklist.patterns.length === 0}
              <tr><td colspan="3" class="py-10 text-center text-fg-dim">No patterns configured.</td></tr>
            {/if}
          </tbody>
        </table>
      </div>
    </div>

  {:else if activeTab === 'settings'}
    <div class="card max-w-2xl p-6 sm:p-8 space-y-5">
      <div>
        <label for="brand-name" class="field-label">Brand name</label>
        <input id="brand-name" type="text" value={settings.BRAND_NAME || ''} on:blur={(e) => updateSetting('BRAND_NAME', e.target.value)} class="input" />
      </div>
      <div>
        <label for="public-base-url" class="field-label">Public base URL</label>
        <input id="public-base-url" type="url" value={settings.PUBLIC_BASE_URL || ''} placeholder="Leave blank to use the request URL" on:blur={(e) => updateSetting('PUBLIC_BASE_URL', e.target.value)} class="input" />
        <p class="mt-1.5 text-xs text-fg-dim">Set this to the host where QR codes will be scanned (e.g. <span class="font-mono">https://qr.yourdomain.com</span>). Leave blank in development and short URLs use whatever origin the browser hit.</p>
      </div>
      <div>
        <label for="enable-otp-auth" class="field-label">Enable OTP auth</label>
        <select id="enable-otp-auth" value={settings.ENABLE_OTP_AUTH || 'true'} on:change={(e) => updateSetting('ENABLE_OTP_AUTH', e.target.value)} class="select">
          <option value="true">Enabled</option>
          <option value="false">Disabled</option>
        </select>
      </div>
      <div>
        <label for="enable-anonymous-creation" class="field-label">Enable anonymous creation</label>
        <select id="enable-anonymous-creation" value={settings.ENABLE_ANONYMOUS_CREATION || 'true'} on:change={(e) => updateSetting('ENABLE_ANONYMOUS_CREATION', e.target.value)} class="select">
          <option value="true">Enabled</option>
          <option value="false">Disabled</option>
        </select>
      </div>
    </div>

  {:else if activeTab === 'analytics'}
    <div class="space-y-8">
      <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {#each [
          { label: 'Total scans', value: analytics.totalScans || 0 },
          { label: "Today's scans", value: analytics.todayScans || 0 },
          { label: 'Total QR codes', value: analytics.totalQRs || 0 },
          { label: 'Active QR codes', value: analytics.activeQRs || 0 }
        ] as stat}
          <div class="card">
            <p class="eyebrow">{stat.label}</p>
            <p class="mt-2 font-mono text-3xl font-semibold tabular text-fg">{stat.value}</p>
          </div>
        {/each}
      </div>

      <div class="grid gap-6 lg:grid-cols-2">
        <div class="card">
          <p class="eyebrow mb-4">Top countries</p>
          {#if analytics.countries?.length}
            <ul class="space-y-2 text-sm">
              {#each analytics.countries as c}
                <li class="flex items-baseline justify-between gap-3">
                  <span class="font-mono text-fg">{c.country}</span>
                  <span class="font-mono tabular text-fg-muted">{c.count}</span>
                </li>
              {/each}
            </ul>
          {:else}
            <p class="text-sm text-fg-dim">
              No country data yet. Country is read from upstream-proxy headers
              (Cloudflare, Vercel, Fly, Netlify). Direct-to-Node deployments record null.
            </p>
          {/if}
        </div>

        <div class="card">
          <p class="eyebrow mb-4">Device class</p>
          {#if analytics.devices?.length}
            <ul class="space-y-2 text-sm">
              {#each analytics.devices as d}
                <li class="flex items-baseline justify-between gap-3">
                  <span class="capitalize text-fg">{d.device_class}</span>
                  <span class="font-mono tabular text-fg-muted">{d.count}</span>
                </li>
              {/each}
            </ul>
          {:else}
            <p class="text-sm text-fg-dim">No scans recorded yet.</p>
          {/if}
        </div>
      </div>

      <div>
        <p class="eyebrow mb-3">Top QR codes by scan count</p>
        <div class="card-flush overflow-hidden">
          <table class="table">
            <thead>
              <tr>
                <th>Short code</th>
                <th>Target URL</th>
                <th class="text-right">Scans</th>
              </tr>
            </thead>
            <tbody>
              {#each analytics.topQRs || [] as qr}
                <tr>
                  <td class="font-mono text-xs text-fg">{qr.short_code}</td>
                  <td class="max-w-md truncate text-fg-muted">{qr.target_url}</td>
                  <td class="text-right font-mono tabular text-fg">{qr.scan_count}</td>
                </tr>
              {/each}
              {#if !analytics.topQRs?.length}
                <tr><td colspan="3" class="py-10 text-center text-fg-dim">No QR codes yet.</td></tr>
              {/if}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  {/if}
</main>
