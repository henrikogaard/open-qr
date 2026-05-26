<script>
  // @ts-nocheck
  import QRPreview from './QRPreview.svelte';
  import { onDestroy, onMount } from 'svelte';

  /** @type {{ id: number; email: string; isAdmin: boolean; termsAcceptedVersion?: string | null } | null | undefined} */
  export let user = null;
  /** Current required Terms version (from layout data). */
  export let termsVersion = '';
  export let featureFlags = {};

  let targetUrl = '';
  let template = 'default';
  let foregroundColor = '#000000';
  let backgroundColor = '#FFFFFF';
  let borderSize = 'medium';
  let borderStyle = 'solid';
  let centerType = 'none';
  let centerText = '';
  let centerTextColor = '#000000';
  let errorCorrection = 'M';
  let expiresAt = '';
  let password = '';
  let customSlug = '';
  let campaignId = '';
  let campaigns = [];
  let newCampaignName = '';

  let previewUrl = '';
  let shortUrl = '';
  let svg = '';
  let loading = false;
  let previewing = false;
  let error = '';

  /** @type {Array<{ id: number; name: string; template: string; foregroundColor: string; backgroundColor: string; borderSize: string; borderStyle: string; centerType: string; centerText: string; centerTextColor: string; errorCorrection: string }>} */
  let presets = [];
  /** @type {any[]} */
  let recentQrs = [];
  let savePresetOpen = false;
  let newPresetName = '';
  let savingPreset = false;
  let presetMessage = '';

  $: isAuthed = !!user;

  // Terms acceptance gate. Logged-in: persisted server-side per user. Anonymous:
  // persisted in localStorage. The gate is a UX check — the legal cover comes
  // from the operator's published Terms; the operator decides whether to allow
  // anonymous creation at all via ENABLE_ANONYMOUS_CREATION.
  const TERMS_LOCAL_KEY = 'open-qr-terms-accepted';
  let termsAccepted = false;

  $: needsTerms = !termsAccepted && termsVersion !== '';

  onMount(() => {
    if (isAuthed) {
      termsAccepted = user?.termsAcceptedVersion === termsVersion;
      loadPresets();
      loadRecentQrs();
      loadCampaigns();
    } else if (termsVersion) {
      try {
        termsAccepted = localStorage.getItem(TERMS_LOCAL_KEY) === termsVersion;
      } catch {/* ignore */}
    }
  });

  /** @param {Event} ev */
  async function onTermsToggle(ev) {
    const target = /** @type {HTMLInputElement} */ (ev.target);
    termsAccepted = target.checked;
    if (!termsAccepted) return;
    if (isAuthed) {
      try {
        await fetch('/api/v1/auth/accept-terms', { method: 'POST' });
      } catch {/* ignore */}
    } else {
      try {
        localStorage.setItem(TERMS_LOCAL_KEY, termsVersion);
      } catch {/* ignore */}
    }
  }

  async function loadPresets() {
    try {
      const r = await fetch('/api/v1/presets');
      const j = await r.json();
      if (j.success) presets = j.data;
    } catch {/* ignore */}
  }

  async function loadRecentQrs() {
    try {
      const r = await fetch('/api/v1/qr');
      const j = await r.json();
      if (j.success) recentQrs = j.data.slice(0, 25);
    } catch {/* ignore */}
  }

  async function loadCampaigns() {
    try {
      const r = await fetch('/api/v1/campaigns');
      const j = await r.json();
      if (j.success) campaigns = j.data;
    } catch {/* ignore */}
  }

  async function createCampaign() {
    const name = newCampaignName.trim();
    if (!name) return;
    const r = await fetch('/api/v1/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    const j = await r.json();
    if (j.success) {
      campaigns = [j.data, ...campaigns];
      campaignId = String(j.data.id);
      newCampaignName = '';
    }
  }

  /** @param {{ template: string; foregroundColor?: string; backgroundColor?: string; borderSize?: string; borderStyle?: string; centerType?: string; centerText?: string|null; centerTextColor?: string; errorCorrection?: string; foreground_color?: string; background_color?: string; border_size?: string; border_style?: string; center_type?: string; center_text?: string|null; center_text_color?: string; error_correction?: string }} src */
  function applyStyle(src) {
    template = src.template || 'default';
    foregroundColor = src.foregroundColor ?? src.foreground_color ?? '#000000';
    backgroundColor = src.backgroundColor ?? src.background_color ?? '#FFFFFF';
    borderSize = src.borderSize ?? src.border_size ?? 'medium';
    borderStyle = src.borderStyle ?? src.border_style ?? 'solid';
    centerType = src.centerType ?? src.center_type ?? 'none';
    centerText = src.centerText ?? src.center_text ?? '';
    centerTextColor = src.centerTextColor ?? src.center_text_color ?? '#000000';
    errorCorrection = src.errorCorrection ?? src.error_correction ?? 'M';
  }

  /** @param {Event} ev */
  function onPresetPick(ev) {
    const target = /** @type {HTMLSelectElement} */ (ev.target);
    const id = Number(target.value);
    target.value = '';
    const p = presets.find((p) => p.id === id);
    if (p) {
      applyStyle(p);
      presetMessage = `Loaded preset "${p.name}"`;
      setTimeout(() => (presetMessage = ''), 2000);
    }
  }

  /** @param {Event} ev */
  function onCopyFromPick(ev) {
    const target = /** @type {HTMLSelectElement} */ (ev.target);
    const code = target.value;
    target.value = '';
    const qr = recentQrs.find((q) => q.short_code === code);
    if (qr) {
      applyStyle(qr);
      presetMessage = `Copied styling from /go/${code}`;
      setTimeout(() => (presetMessage = ''), 2000);
    }
  }

  async function savePreset() {
    if (!newPresetName.trim()) return;
    savingPreset = true;
    try {
      const r = await fetch('/api/v1/presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newPresetName.trim(), style: buildStyle() })
      });
      const j = await r.json();
      if (j.success) {
        presets = [j.data, ...presets];
        newPresetName = '';
        savePresetOpen = false;
        presetMessage = `Saved preset "${j.data.name}"`;
        setTimeout(() => (presetMessage = ''), 2000);
      }
    } finally {
      savingPreset = false;
    }
  }

  /** @param {number} id */
  async function deletePreset(id) {
    if (!confirm('Delete this preset?')) return;
    await fetch(`/api/v1/presets/${id}`, { method: 'DELETE' });
    presets = presets.filter((p) => p.id !== id);
  }

  /**
   * @param {string} value
   * @returns {string}
   */
  function normalizeUrl(value) {
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  }

  function buildStyle() {
    return {
      template,
      foregroundColor,
      backgroundColor,
      borderSize,
      borderStyle,
      centerType,
      centerText,
      centerTextColor,
      errorCorrection
    };
  }

  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let debounceHandle;
  /** @type {AbortController | undefined} */
  let inflight;

  async function runPreview() {
    const url = normalizeUrl(targetUrl);
    if (!url) {
      previewUrl = '';
      svg = '';
      error = '';
      return;
    }
    if (needsTerms) {
      // Don't burn previews until the user has accepted; clear any stale one.
      previewUrl = '';
      svg = '';
      return;
    }

    inflight?.abort();
    inflight = new AbortController();
    previewing = true;
    try {
      const response = await fetch('/api/v1/qr?preview=1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUrl: url, style: buildStyle() }),
        signal: inflight.signal
      });
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error?.message || result.message || 'Preview failed');
      }
      previewUrl = result.data.dataUrl;
      svg = result.data.svg;
      error = '';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      error = err instanceof Error ? err.message : 'Preview failed';
    } finally {
      previewing = false;
    }
  }

  function schedulePreview() {
    clearTimeout(debounceHandle);
    debounceHandle = setTimeout(runPreview, 200);
  }

  // Live preview: re-run whenever any style/url input changes.
  $: targetUrl,
    template,
    foregroundColor,
    backgroundColor,
    borderSize,
    borderStyle,
    centerType,
    centerText,
    centerTextColor,
    errorCorrection,
    schedulePreview();

  onDestroy(() => {
    clearTimeout(debounceHandle);
    inflight?.abort();
  });

  async function generate() {
    const url = normalizeUrl(targetUrl);
    if (!url) {
      error = 'Target URL is required';
      return;
    }
    if (needsTerms) {
      error = 'Please accept the Terms of Use to continue';
      return;
    }

    loading = true;
    error = '';

    try {
      const response = await fetch('/api/v1/qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUrl: url,
          style: buildStyle(),
          shortCode: customSlug || undefined,
          campaignId: campaignId || undefined,
          expiresAt: expiresAt || undefined,
          password: password || undefined
        })
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error?.message || result.message || 'Failed to generate QR code');
      }

      previewUrl = result.data.dataUrl;
      shortUrl = result.data.shortUrl;
      svg = result.data.svg;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to generate QR code';
    } finally {
      loading = false;
    }
  }
</script>

<div class="grid gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
  <div class="card p-6 sm:p-8">
    <div class="mb-6 flex items-center justify-between">
      <h3 class="text-lg font-semibold text-fg">Configure</h3>
      <span class="font-mono text-xs text-fg-dim">/api/v1/qr</span>
    </div>

    {#if isAuthed}
      <div class="mb-5 rounded-md border border-border bg-bg-soft p-4 space-y-3">
        <div class="flex items-center justify-between">
          <p class="eyebrow">Reuse styling</p>
          {#if presetMessage}
            <span class="text-xs text-success">{presetMessage}</span>
          {/if}
        </div>
        <div class="grid gap-3 sm:grid-cols-2">
          <div>
            <label for="preset-pick" class="field-label">Load preset</label>
            <select id="preset-pick" on:change={onPresetPick} class="select" disabled={presets.length === 0}>
              <option value="">{presets.length ? 'Pick a preset…' : 'No presets saved yet'}</option>
              {#each presets as p}
                <option value={p.id}>{p.name}</option>
              {/each}
            </select>
          </div>
          <div>
            <label for="copy-from-pick" class="field-label">Copy from existing QR</label>
            <select id="copy-from-pick" on:change={onCopyFromPick} class="select" disabled={recentQrs.length === 0}>
              <option value="">{recentQrs.length ? 'Pick a QR…' : 'No QR codes yet'}</option>
              {#each recentQrs as q}
                <option value={q.short_code}>/go/{q.short_code} — {q.target_url}</option>
              {/each}
            </select>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          {#if savePresetOpen}
            <input type="text" bind:value={newPresetName} placeholder="Preset name" class="input flex-1 min-w-[180px]" />
            <button type="button" on:click={savePreset} disabled={savingPreset || !newPresetName.trim()} class="btn-primary btn-sm">
              {savingPreset ? 'Saving…' : 'Save'}
            </button>
            <button type="button" on:click={() => { savePresetOpen = false; newPresetName = ''; }} class="btn-ghost btn-sm">Cancel</button>
          {:else}
            <button type="button" on:click={() => (savePresetOpen = true)} class="btn-secondary btn-sm">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/></svg>
              Save current as preset
            </button>
          {/if}
          {#if presets.length}
            <details class="ml-auto text-xs text-fg-dim">
              <summary class="cursor-pointer hover:text-fg">Manage presets</summary>
              <ul class="mt-2 space-y-1">
                {#each presets as p}
                  <li class="flex items-center justify-between gap-3">
                    <span class="text-fg">{p.name}</span>
                    <button type="button" on:click={() => deletePreset(p.id)} class="text-danger hover:underline">Delete</button>
                  </li>
                {/each}
              </ul>
            </details>
          {/if}
        </div>
      </div>
    {/if}

    <div class="space-y-5">
      <div>
        <label for="target-url" class="field-label">Target URL</label>
        <input
          id="target-url"
          type="url"
          bind:value={targetUrl}
          placeholder="https://example.com"
          class="input"
        />
      </div>

      {#if featureFlags.customSlugsEnabled && (!featureFlags.customSlugsAdminOnly || user?.isAdmin)}
        <div>
          <label for="custom-slug" class="field-label">Custom slug <span class="text-fg-dim font-normal">(optional)</span></label>
          <div class="flex overflow-hidden rounded-md border border-border-strong bg-surface focus-within:ring-2 focus-within:ring-accent/30">
            <span class="grid place-items-center border-r border-border px-3 font-mono text-xs text-fg-dim">/go/</span>
            <input id="custom-slug" type="text" bind:value={customSlug} placeholder="summer-sale" class="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none" />
          </div>
        </div>
      {/if}

      {#if isAuthed}
        <div class="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <label for="campaign" class="field-label">Campaign <span class="text-fg-dim font-normal">(optional)</span></label>
            <select id="campaign" bind:value={campaignId} class="select">
              <option value="">No campaign</option>
              {#each campaigns as campaign}
                <option value={campaign.id}>{campaign.name}</option>
              {/each}
            </select>
          </div>
          <div class="flex gap-2">
            <input type="text" bind:value={newCampaignName} placeholder="New campaign" class="input min-w-0" />
            <button type="button" on:click={createCampaign} disabled={!newCampaignName.trim()} class="btn-secondary shrink-0">Add</button>
          </div>
        </div>
      {/if}

      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <label for="template" class="field-label">Template</label>
          <select id="template" bind:value={template} class="select">
            <option value="default">Default</option>
            <option value="minimal">Minimal</option>
            <option value="colorful">Colorful</option>
            <option value="rounded">Rounded</option>
            <option value="dark">Dark</option>
          </select>
        </div>

        <div>
          <label for="error-correction" class="field-label">Error correction</label>
          <select id="error-correction" bind:value={errorCorrection} class="select">
            <option value="L">Low (7%)</option>
            <option value="M">Medium (15%)</option>
            <option value="Q">Quartile (25%)</option>
            <option value="H">High (30%)</option>
          </select>
        </div>
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <label for="foreground-color" class="field-label">Foreground</label>
          <input id="foreground-color" type="color" bind:value={foregroundColor} class="input" />
        </div>
        <div>
          <label for="background-color" class="field-label">Background</label>
          <input id="background-color" type="color" bind:value={backgroundColor} class="input" />
        </div>
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <label for="border-size" class="field-label">Border size</label>
          <select id="border-size" bind:value={borderSize} class="select">
            <option value="none">None</option>
            <option value="small">Small</option>
            <option value="medium">Medium</option>
            <option value="large">Large</option>
          </select>
        </div>
        <div>
          <label for="border-style" class="field-label">Border style</label>
          <select id="border-style" bind:value={borderStyle} class="select">
            <option value="solid">Solid</option>
            <option value="dashed">Dashed</option>
            <option value="dotted">Dotted</option>
          </select>
        </div>
      </div>

      <div>
        <label for="center-type" class="field-label">Center content</label>
        <select id="center-type" bind:value={centerType} class="select">
          <option value="none">None</option>
          <option value="text">Text</option>
        </select>
      </div>

      {#if centerType === 'text'}
        <div>
          <label for="center-text" class="field-label">Center text</label>
          <input
            id="center-text"
            type="text"
            bind:value={centerText}
            maxlength="10"
            placeholder="OPEN-QR"
            class="input font-mono"
          />
        </div>
      {/if}

      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <label for="expires-at" class="field-label">Expires at <span class="text-fg-dim font-normal">(optional)</span></label>
          <input id="expires-at" type="datetime-local" bind:value={expiresAt} class="input" />
        </div>
        <div>
          <label for="qr-password" class="field-label">Password <span class="text-fg-dim font-normal">(optional)</span></label>
          <input id="qr-password" type="password" bind:value={password} class="input" />
        </div>
      </div>

      {#if termsVersion}
        <label class="flex items-start gap-2.5 text-sm text-fg">
          <input
            type="checkbox"
            checked={termsAccepted}
            on:change={onTermsToggle}
            class="checkbox mt-0.5"
          />
          <span class="text-fg-muted">
            I agree to the <a href="/terms" target="_blank" rel="noopener" class="link">Terms of Use</a>
            and will not use this service to encode unlawful content
            (phishing, malware, fraud, harassment, CSAM, etc.).
          </span>
        </label>
      {/if}

      {#if error}
        <div class="alert alert-danger">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" class="mt-0.5 shrink-0"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
          <span>{error}</span>
        </div>
      {/if}

      <button
        on:click={generate}
        disabled={loading || !targetUrl || needsTerms}
        class="btn-primary btn-lg w-full"
      >
        {#if loading}
          <svg class="animate-spin" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.2-8.55" stroke-linecap="round"/></svg>
          Generating…
        {:else}
          Generate QR code
        {/if}
      </button>
    </div>
  </div>

  <aside class="card p-6 sm:p-8 lg:sticky lg:top-24">
    <div class="mb-4 flex items-center justify-between">
      <h3 class="text-lg font-semibold text-fg">Preview</h3>
      {#if previewing}
        <span class="inline-flex items-center gap-1.5 text-xs text-fg-dim">
          <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" aria-hidden="true"></span>
          Updating…
        </span>
      {:else if previewUrl}
        <span class="text-xs text-fg-dim">Live</span>
      {/if}
    </div>
    {#if previewUrl}
      <QRPreview dataUrl={previewUrl} shortUrl={shortUrl} {svg} />
    {:else}
      <div class="grid aspect-square place-items-center rounded-md border border-dashed border-border-strong bg-bg-soft text-center">
        <div class="px-4">
          <div class="mx-auto grid h-10 w-10 place-items-center rounded-md bg-surface-2 text-fg-dim">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
              <path d="M3 3h7v7H3V3zm2 2v3h3V5H5zm9-2h7v7h-7V3zm2 2v3h3V5h-3zM3 14h7v7H3v-7zm2 2v3h3v-3H5zm9-2h2v2h-2v-2zm4 0h3v2h-2v1h-1v-3zm-4 4h2v3h-2v-3zm4 1h3v2h-3v-2zm-2-1h2v2h-2v-2z"/>
            </svg>
          </div>
          <p class="mt-3 text-sm font-medium text-fg">Your QR will appear here</p>
          <p class="mt-1 text-xs text-fg-dim">Type a URL — the preview updates as you edit.</p>
        </div>
      </div>
    {/if}
  </aside>
</div>
