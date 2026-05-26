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
  let reports = [];
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
      loadAnalytics(),
      loadReports()
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

  async function loadReports() {
    const response = await fetch('/api/v1/admin/reports');
    const result = await response.json();
    if (result.success) reports = result.data;
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
    settings = { ...settings, [key]: value };
  }

  async function toggleSetting(key, checked) {
    await updateSetting(key, checked ? 'true' : 'false');
  }

  async function updateReportStatus(id, status) {
    await fetch('/api/v1/admin/reports', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status })
    });
    await loadReports();
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
    {#each [{v:'qrs',l:'QR codes'},{v:'blacklist',l:'Blacklist'},{v:'reports',l:'Reports'},{v:'settings',l:'Settings'},{v:'privacy',l:'Privacy'},{v:'analytics',l:'Analytics'}] as t}
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
    <div class="grid gap-6 lg:grid-cols-2">
    <div class="card p-6 sm:p-8 space-y-5">
      <div>
        <p class="eyebrow mb-3">App</p>
      </div>
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
      <label class="flex items-center gap-2 text-sm text-fg">
        <input type="checkbox" checked={settings.ENABLE_CUSTOM_SLUGS === 'true'} on:change={(e) => toggleSetting('ENABLE_CUSTOM_SLUGS', e.target.checked)} class="checkbox" />
        <span>Enable custom slugs</span>
      </label>
      <label class="flex items-center gap-2 text-sm text-fg">
        <input type="checkbox" checked={settings.CUSTOM_SLUGS_ADMIN_ONLY !== 'false'} on:change={(e) => toggleSetting('CUSTOM_SLUGS_ADMIN_ONLY', e.target.checked)} class="checkbox" />
        <span>Limit custom slugs to admins</span>
      </label>
      <label class="flex items-center gap-2 text-sm text-fg">
        <input type="checkbox" checked={settings.ENABLE_DESTINATION_INTERSTITIAL === 'true'} on:change={(e) => toggleSetting('ENABLE_DESTINATION_INTERSTITIAL', e.target.checked)} class="checkbox" />
        <span>Show destination interstitial before redirects</span>
      </label>
    </div>

    <div class="card p-6 sm:p-8 space-y-5">
      <div>
        <p class="eyebrow mb-3">Threat intelligence</p>
      </div>
      <label class="flex items-start gap-3 text-sm text-fg">
        <input type="checkbox" checked={settings.ENABLE_THREAT_INTEL === 'true'} on:change={(e) => toggleSetting('ENABLE_THREAT_INTEL', e.target.checked)} class="checkbox mt-0.5" />
        <span>
          <span class="block font-medium">Enable external URL checks</span>
          <span class="mt-1 block text-xs text-fg-dim">Runs after local blacklist checks. Provider outages fail open unless fail closed is enabled.</span>
        </span>
      </label>
      <label class="flex items-center gap-2 text-sm text-fg">
        <input type="checkbox" checked={settings.THREAT_INTEL_FAIL_CLOSED === 'true'} on:change={(e) => toggleSetting('THREAT_INTEL_FAIL_CLOSED', e.target.checked)} class="checkbox" />
        <span>Fail closed when a provider errors</span>
      </label>

      <div class="border-t border-border pt-5 space-y-4">
        <label class="flex items-center gap-2 text-sm text-fg">
          <input type="checkbox" checked={settings.ENABLE_WEB_RISK === 'true'} on:change={(e) => toggleSetting('ENABLE_WEB_RISK', e.target.checked)} class="checkbox" />
          <span>Google Web Risk</span>
        </label>
        <input id="web-risk-key" type="password" value={settings.WEB_RISK_API_KEY || ''} placeholder="Google Web Risk API key" on:blur={(e) => updateSetting('WEB_RISK_API_KEY', e.target.value)} class="input" autocomplete="off" />
      </div>

      <div class="border-t border-border pt-5 space-y-4">
        <label class="flex items-center gap-2 text-sm text-fg">
          <input type="checkbox" checked={settings.ENABLE_URLHAUS === 'true'} on:change={(e) => toggleSetting('ENABLE_URLHAUS', e.target.checked)} class="checkbox" />
          <span>URLhaus</span>
        </label>
        <input id="urlhaus-key" type="password" value={settings.URLHAUS_AUTH_KEY || ''} placeholder="Optional URLhaus Auth-Key" on:blur={(e) => updateSetting('URLHAUS_AUTH_KEY', e.target.value)} class="input" autocomplete="off" />
      </div>

      <div class="border-t border-border pt-5 space-y-4">
        <label class="flex items-center gap-2 text-sm text-fg">
          <input type="checkbox" checked={settings.ENABLE_PHISHTANK === 'true'} on:change={(e) => toggleSetting('ENABLE_PHISHTANK', e.target.checked)} class="checkbox" />
          <span>PhishTank</span>
        </label>
        <input id="phishtank-key" type="password" value={settings.PHISHTANK_APP_KEY || ''} placeholder="Optional PhishTank app key" on:blur={(e) => updateSetting('PHISHTANK_APP_KEY', e.target.value)} class="input" autocomplete="off" />
      </div>

      <div class="border-t border-border pt-5 space-y-4">
        <label class="flex items-center gap-2 text-sm text-fg">
          <input type="checkbox" checked={settings.ENABLE_SPAMHAUS_DBL === 'true'} on:change={(e) => toggleSetting('ENABLE_SPAMHAUS_DBL', e.target.checked)} class="checkbox" />
          <span>Spamhaus DBL</span>
        </label>
        <input id="spamhaus-zone" type="text" value={settings.SPAMHAUS_DBL_ZONE || 'dbl.spamhaus.org'} placeholder="dbl.spamhaus.org" on:blur={(e) => updateSetting('SPAMHAUS_DBL_ZONE', e.target.value)} class="input" />
      </div>
    </div>

    <div class="card p-6 sm:p-8 space-y-5 lg:col-span-2">
      <div>
        <p class="eyebrow mb-3">Plausible analytics</p>
      </div>
      <label class="flex items-start gap-3 text-sm text-fg">
        <input type="checkbox" checked={settings.ENABLE_PLAUSIBLE === 'true'} on:change={(e) => toggleSetting('ENABLE_PLAUSIBLE', e.target.checked)} class="checkbox mt-0.5" />
        <span>
          <span class="block font-medium">Enable Plausible script</span>
          <span class="mt-1 block text-xs text-fg-dim">Adds the Plausible browser script to public and app pages. Update your privacy notice before enabling on production.</span>
        </span>
      </label>
      <div class="grid gap-4 md:grid-cols-2">
        <div>
          <label for="plausible-domain" class="field-label">Plausible domain</label>
          <input id="plausible-domain" type="text" value={settings.PLAUSIBLE_DOMAIN || ''} placeholder="qr.example.com" on:blur={(e) => updateSetting('PLAUSIBLE_DOMAIN', e.target.value)} class="input" />
        </div>
        <div>
          <label for="plausible-script" class="field-label">Script URL</label>
          <input id="plausible-script" type="url" value={settings.PLAUSIBLE_SCRIPT_SRC || 'https://plausible.io/js/script.js'} on:blur={(e) => updateSetting('PLAUSIBLE_SCRIPT_SRC', e.target.value)} class="input" />
        </div>
      </div>
    </div>
    </div>

  {:else if activeTab === 'reports'}
    <div class="card-flush overflow-hidden">
      <table class="table">
        <thead>
          <tr><th>QR</th><th>Reason</th><th>Status</th><th>Details</th><th class="text-right">Action</th></tr>
        </thead>
        <tbody>
          {#each reports as report}
            <tr>
              <td>
                <a href={`/go/${report.short_code}`} class="font-mono text-xs text-fg hover:underline">/go/{report.short_code}</a>
                {#if report.target_url}<p class="max-w-xs truncate text-xs text-fg-dim">{report.target_url}</p>{/if}
              </td>
              <td class="text-fg">{report.reason}</td>
              <td><span class="badge badge-neutral">{report.status}</span></td>
              <td class="max-w-sm text-sm text-fg-muted">{report.details || '—'}</td>
              <td class="text-right">
                <select value={report.status} on:change={(e) => updateReportStatus(report.id, e.target.value)} class="select min-w-32 text-xs">
                  <option value="open">Open</option>
                  <option value="reviewing">Reviewing</option>
                  <option value="resolved">Resolved</option>
                  <option value="dismissed">Dismissed</option>
                </select>
              </td>
            </tr>
          {/each}
          {#if reports.length === 0}
            <tr><td colspan="5" class="py-10 text-center text-fg-dim">No abuse reports yet.</td></tr>
          {/if}
        </tbody>
      </table>
    </div>

  {:else if activeTab === 'privacy'}
    <div class="grid gap-6 lg:grid-cols-2">
      <section class="card">
        <p class="eyebrow mb-4">External processors</p>
        <dl class="space-y-3 text-sm">
          <div class="flex justify-between gap-4"><dt class="text-fg-muted">Plausible</dt><dd class="text-fg">{settings.ENABLE_PLAUSIBLE === 'true' ? settings.PLAUSIBLE_DOMAIN || 'Enabled' : 'Disabled'}</dd></div>
          <div class="flex justify-between gap-4"><dt class="text-fg-muted">Google Web Risk</dt><dd class="text-fg">{settings.ENABLE_WEB_RISK === 'true' ? 'Enabled' : 'Disabled'}</dd></div>
          <div class="flex justify-between gap-4"><dt class="text-fg-muted">URLhaus</dt><dd class="text-fg">{settings.ENABLE_URLHAUS === 'true' ? 'Enabled' : 'Disabled'}</dd></div>
          <div class="flex justify-between gap-4"><dt class="text-fg-muted">PhishTank</dt><dd class="text-fg">{settings.ENABLE_PHISHTANK === 'true' ? 'Enabled' : 'Disabled'}</dd></div>
          <div class="flex justify-between gap-4"><dt class="text-fg-muted">Spamhaus DBL</dt><dd class="text-fg">{settings.ENABLE_SPAMHAUS_DBL === 'true' ? 'Enabled' : 'Disabled'}</dd></div>
        </dl>
      </section>
      <section class="card">
        <p class="eyebrow mb-4">Privacy notice guidance</p>
        <div class="space-y-3 text-sm text-fg-muted">
          <p>Open-QR stores scan timestamps, coarse country, device class, and hashes of IP/User-Agent values. Raw identifiers are not persisted.</p>
          {#if settings.ENABLE_PLAUSIBLE === 'true'}
            <p>Plausible is enabled. Your privacy notice should disclose the script URL, configured domain, and whether Plausible is self-hosted or hosted by Plausible Insights.</p>
          {/if}
          {#if settings.ENABLE_THREAT_INTEL === 'true'}
            <p>External URL reputation checks are enabled. Your privacy notice should disclose that submitted destination URLs may be sent to enabled reputation providers for abuse prevention.</p>
          {/if}
          <p>When changing privacy-impacting settings, bump the Terms version so existing users are asked to re-accept.</p>
        </div>
      </section>
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
