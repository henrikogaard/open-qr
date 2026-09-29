<script>
  // @ts-nocheck
  import QRPreview from './QRPreview.svelte';
  import { onDestroy, onMount } from 'svelte';
  import { confirmDialog } from '$lib/stores/confirm';
  import { EMPTY_UTM, appendUtmParams } from '$lib/utm';

  /** @type {{ id: number; email: string; isAdmin: boolean; termsAcceptedVersion?: string | null } | null | undefined} */
  export let user = null;
  /** Current required Terms version (from layout data). */
  export let termsVersion = '';
  export let featureFlags = {};
  /** Admin-configured generator defaults (DEFAULT_TEMPLATE / DEFAULT_ERROR_CORRECTION). */
  export let defaults = { template: 'default', errorCorrection: 'M' };

  let kind = 'url';
  let targetUrl = '';
  let template = defaults.template || 'default';
  let foregroundColor = '#000000';
  let backgroundColor = '#FFFFFF';
  let borderSize = 'medium';
  let borderStyle = 'solid';
  let centerType = 'none';
  let centerImageUrl = '';
  let centerText = '';
  let centerTextColor = '#000000';
  let errorCorrection = defaults.errorCorrection || 'M';
  let expiresAt = '';
  let password = '';
  let customSlug = '';
  let campaignId = '';
  let campaigns = [];
  let newCampaignName = '';

  /** @type {Array<{ id: number; name: string; template: string; foregroundColor: string; backgroundColor: string; borderSize: string; borderStyle: string; centerType: string; centerText: string; centerTextColor: string; errorCorrection: string }>} */
  let presets = [];
  /** @type {any[]} */
  let recentQrs = [];
  let savePresetOpen = false;
  let newPresetName = '';
  let savingPreset = false;
  let presetMessage = '';

  // Static payload forms, one object per content type. Field names and
  // validation live server-side (qr-payloads.ts); the UI just collects them.
  let payload = {
    text: { text: '' },
    wifi: { ssid: '', password: '', encryption: 'WPA', hidden: false },
    vcard: { firstName: '', lastName: '', org: '', title: '', phone: '', email: '', url: '', address: '', note: '' },
    event: { title: '', location: '', start: '', end: '', allDay: false, description: '' },
    email: { to: '', subject: '', body: '' },
    sms: { phone: '', message: '' },
    geo: { lat: '', lng: '' }
  };

  let utmOpen = false;
  let utm = { ...EMPTY_UTM };

  let previewUrl = '';
  let shortUrl = '';
  let generatedCode = '';
  let svg = '';
  let loading = false;
  let previewing = false;
  let error = '';
  /** Earliest selectable expiry (client clock), set on mount to avoid SSR mismatch. */
  let minExpiresAt = '';

  $: isAuthed = !!user;
  $: isStatic = kind !== 'url';
  $: finalTargetUrl = isStatic ? '' : appendUtmParams(normalizeUrl(targetUrl), utm);

  const KIND_OPTIONS = [
    { value: 'url', label: 'Website URL (tracked)' },
    { value: 'wifi', label: 'Wi-Fi network' },
    { value: 'vcard', label: 'Contact card (vCard)' },
    { value: 'event', label: 'Calendar event' },
    { value: 'text', label: 'Plain text' },
    { value: 'email', label: 'Email' },
    { value: 'sms', label: 'SMS' },
    { value: 'geo', label: 'Location' }
  ];

  // Terms acceptance gate. Logged-in: persisted server-side per user. Anonymous:
  // persisted in localStorage. The gate is a UX check — the legal cover comes
  // from the operator's published Terms; the operator decides whether to allow
  // anonymous creation at all via ENABLE_ANONYMOUS_CREATION.
  const TERMS_LOCAL_KEY = 'open-qr-terms-accepted';
  let termsAccepted = false;

  // --- Draft persistence -----------------------------------------------------
  // The landing form is long; a refresh shouldn't cost the user their input.
  // Passwords and one-shot fields (custom slug, campaign) stay out of storage.
  // Saving is gated until the stored draft has been restored — reactive
  // statements run at init with default values and would otherwise clobber
  // the draft before onMount gets to read it.
  const DRAFT_KEY = 'open-qr-draft';
  let draftReady = false;

  function saveDraft() {
    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          kind, targetUrl,
          template, foregroundColor, backgroundColor, borderSize, borderStyle,
          centerType, centerImageUrl, centerText, centerTextColor, errorCorrection,
          payload, utm, expiresAt
        })
      );
    } catch { /* ignore */ }
  }

  function restoreDraft() {
    let d;
    try {
      d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    } catch {
      return;
    }
    if (!d || typeof d !== 'object') return;

    if (typeof d.kind === 'string' && payload[d.kind]) kind = d.kind;
    if (typeof d.targetUrl === 'string') targetUrl = d.targetUrl;
    if (typeof d.template === 'string') template = d.template;
    if (/^#[0-9a-f]{6}$/i.test(d.foregroundColor || '')) foregroundColor = d.foregroundColor;
    if (/^#[0-9a-f]{6}$/i.test(d.backgroundColor || '')) backgroundColor = d.backgroundColor;
    if (typeof d.borderSize === 'string') borderSize = d.borderSize;
    if (typeof d.borderStyle === 'string') borderStyle = d.borderStyle;
    if (typeof d.centerType === 'string') centerType = d.centerType;
    if (typeof d.centerImageUrl === 'string') centerImageUrl = d.centerImageUrl;
    if (typeof d.centerText === 'string') centerText = d.centerText;
    if (/^#[0-9a-f]{6}$/i.test(d.centerTextColor || '')) centerTextColor = d.centerTextColor;
    if (typeof d.errorCorrection === 'string') errorCorrection = d.errorCorrection;
    if (typeof d.expiresAt === 'string') expiresAt = d.expiresAt;

    if (d.payload && typeof d.payload === 'object') {
      for (const k of Object.keys(payload)) {
        const saved = d.payload[k];
        if (!saved || typeof saved !== 'object') continue;
        for (const field of Object.keys(payload[k])) {
          const value = saved[field];
          // Booleans, strings and numbers keep their type; everything else
          // (undefined, arrays, objects) falls back to the default.
          if (typeof value === 'boolean' || typeof value === 'string' || typeof value === 'number') {
            payload[k][field] = value;
          }
        }
      }
    }
    if (d.utm && typeof d.utm === 'object') {
      for (const field of Object.keys(utm)) {
        if (typeof d.utm[field] === 'string') utm[field] = d.utm[field];
      }
    }
  }

  function clearForm() {
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    kind = 'url';
    targetUrl = '';
    applyStyle({ template: defaults.template || 'default', errorCorrection: defaults.errorCorrection || 'M' });
    centerImageUrl = '';
    payload = {
      text: { text: '' },
      wifi: { ssid: '', password: '', encryption: 'WPA', hidden: false },
      vcard: { firstName: '', lastName: '', org: '', title: '', phone: '', email: '', url: '', address: '', note: '' },
      event: { title: '', location: '', start: '', end: '', allDay: false, description: '' },
      email: { to: '', subject: '', body: '' },
      sms: { phone: '', message: '' },
      geo: { lat: '', lng: '' }
    };
    utm = { ...EMPTY_UTM };
    expiresAt = '';
    password = '';
    customSlug = '';
    error = '';
  }

  /** @param {KeyboardEvent} ev */
  function onKeydown(ev) {
    // Native Enter already submits from single-line inputs; this makes it
    // work from textareas (the plain-text kind) and anywhere else.
    if ((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter') {
      ev.preventDefault();
      generate();
    }
  }

  $: needsTerms = !termsAccepted && termsVersion !== '';

  onMount(() => {
    minExpiresAt = new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    restoreDraft();
    draftReady = true;
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
    const ok = await confirmDialog({
      title: 'Delete preset?',
      message: 'This styling preset will be removed. QR codes already generated with it are not affected.',
      confirmLabel: 'Delete',
      danger: true
    });
    if (!ok) return;
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
      centerImageUrl: centerType === 'image' ? centerImageUrl : undefined,
      centerText,
      centerTextColor,
      errorCorrection
    };
  }

  /** True when the current form has enough input to attempt a render. */
  $: hasInput = isStatic ? true : Boolean(targetUrl.trim());

  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let debounceHandle;
  /** @type {AbortController | undefined} */
  let inflight;

  async function runPreview() {
    if (!hasInput) {
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
        body: JSON.stringify(isStatic ? { kind, payload: payload[kind], style: buildStyle() } : { targetUrl: finalTargetUrl, style: buildStyle() }),
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

  // Live preview: re-run whenever any style/url/payload input changes —
  // including the terms gate, so accepting consent immediately renders a
  // pending preview (and un-accepting clears one).
  $: previewDeps = [
    kind,
    targetUrl,
    payload.text.text,
    payload.wifi.ssid, payload.wifi.password, payload.wifi.encryption, payload.wifi.hidden,
    payload.vcard.firstName, payload.vcard.lastName, payload.vcard.org, payload.vcard.title,
    payload.vcard.phone, payload.vcard.email, payload.vcard.url, payload.vcard.address, payload.vcard.note,
    payload.event.title, payload.event.location, payload.event.start, payload.event.end, payload.event.allDay, payload.event.description,
    payload.email.to, payload.email.subject, payload.email.body,
    payload.sms.phone, payload.sms.message,
    payload.geo.lat, payload.geo.lng,
    template,
    foregroundColor,
    backgroundColor,
    borderSize,
    borderStyle,
    centerType,
    centerImageUrl,
    centerText,
    centerTextColor,
    errorCorrection,
    needsTerms,
    expiresAt,
    utm.source, utm.medium, utm.campaign, utm.term, utm.content
  ];
  // Re-render the preview and persist the draft whenever any input changes —
  // restoring a draft fires both, exactly like the user re-typing it.
  $: if (previewDeps) {
    schedulePreview();
    if (draftReady) saveDraft();
  }

  onDestroy(() => {
    clearTimeout(debounceHandle);
    inflight?.abort();
  });

  function focusTerms() {
    const el = document.getElementById('terms-accept');
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.focus();
  }

  /** Preview panel reference for post-generation scrolling on small screens. */
  /** @type {HTMLElement | undefined} */
  let previewPanel;

  async function generate() {
    if (!hasInput) {
      error = isStatic ? 'Please fill in the content fields' : 'Target URL is required';
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
          ...(isStatic
            ? { kind, payload: payload[kind] }
            : { targetUrl: finalTargetUrl }),
          style: buildStyle(),
          shortCode: customSlug || undefined,
          campaignId: campaignId || undefined,
          expiresAt: !isStatic && expiresAt ? expiresAt : undefined,
          password: !isStatic && password ? password : undefined
        })
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error?.message || result.message || 'Failed to generate QR code');
      }

      previewUrl = result.data.dataUrl;
      shortUrl = result.data.shortUrl || '';
      generatedCode = result.data.shortCode || '';
      svg = result.data.svg;

      // On small screens the preview sits below the long form — bring the
      // result into view so the tap visibly did something.
      if (previewPanel && window.innerWidth < 640) {
        previewPanel.scrollIntoView({
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
          block: 'start'
        });
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to generate QR code';
    } finally {
      loading = false;
    }
  }
</script>

<svelte:window on:keydown={onKeydown} />

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
            <span class="text-xs text-success" role="status">{presetMessage}</span>
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

    <form class="space-y-5" on:submit|preventDefault={generate}>
      <div>
        <label for="content-type" class="field-label">Content type</label>
        <select id="content-type" bind:value={kind} class="select">
          {#each KIND_OPTIONS as option}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
        {#if isStatic}
          <p class="mt-1.5 text-xs text-fg-dim">
            Static codes encode their content directly — they work offline but scans are not tracked and the content can't be changed after printing.
          </p>
        {/if}
      </div>

      {#if kind === 'url'}
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

        <div class="rounded-md border border-border bg-bg-soft p-4">
          <button type="button" class="flex w-full items-center justify-between text-left" on:click={() => (utmOpen = !utmOpen)} aria-expanded={utmOpen}>
            <span>
              <span class="field-label">UTM tracking parameters <span class="text-fg-dim font-normal">(optional)</span></span>
              <span class="mt-0.5 block text-xs text-fg-dim">Tag the destination for the receiving site's analytics</span>
            </span>
            <span class="text-fg-dim" aria-hidden="true">{utmOpen ? '−' : '+'}</span>
          </button>
          {#if utmOpen}
            <div class="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <label for="utm-source" class="field-label">utm_source</label>
                <input id="utm-source" type="text" bind:value={utm.source} placeholder="poster" class="input font-mono text-xs" />
              </div>
              <div>
                <label for="utm-medium" class="field-label">utm_medium</label>
                <input id="utm-medium" type="text" bind:value={utm.medium} placeholder="qr" class="input font-mono text-xs" />
              </div>
              <div>
                <label for="utm-campaign" class="field-label">utm_campaign</label>
                <input id="utm-campaign" type="text" bind:value={utm.campaign} placeholder="spring-launch" class="input font-mono text-xs" />
              </div>
              <div>
                <label for="utm-term" class="field-label">utm_term</label>
                <input id="utm-term" type="text" bind:value={utm.term} placeholder="" class="input font-mono text-xs" />
              </div>
              <div class="sm:col-span-2">
                <label for="utm-content" class="field-label">utm_content</label>
                <input id="utm-content" type="text" bind:value={utm.content} placeholder="" class="input font-mono text-xs" />
              </div>
              {#if targetUrl.trim()}
                <p class="sm:col-span-2 break-all rounded-md border border-border bg-surface px-3 py-2 font-mono text-xs text-fg-muted">{finalTargetUrl}</p>
              {/if}
            </div>
          {/if}
        </div>
      {:else if kind === 'text'}
        <div>
          <label for="payload-text" class="field-label">Text</label>
          <textarea id="payload-text" bind:value={payload.text.text} rows="4" maxlength="1200" class="input" placeholder="Any text — a note, a code, a message…"></textarea>
        </div>
      {:else if kind === 'wifi'}
        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label for="wifi-ssid" class="field-label">Network name (SSID)</label>
            <input id="wifi-ssid" type="text" bind:value={payload.wifi.ssid} class="input" />
          </div>
          <div>
            <label for="wifi-encryption" class="field-label">Security</label>
            <select id="wifi-encryption" bind:value={payload.wifi.encryption} class="select">
              <option value="WPA">WPA / WPA2 / WPA3</option>
              <option value="WEP">WEP</option>
              <option value="nopass">None (open network)</option>
            </select>
          </div>
          {#if payload.wifi.encryption !== 'nopass'}
            <div>
              <label for="wifi-password" class="field-label">Password</label>
              <input id="wifi-password" type="text" bind:value={payload.wifi.password} class="input font-mono" autocomplete="off" />
            </div>
          {/if}
          <label class="flex items-center gap-2 self-end pb-2 text-sm text-fg">
            <input id="wifi-hidden" type="checkbox" bind:checked={payload.wifi.hidden} class="checkbox" />
            <span>Hidden network</span>
          </label>
        </div>
      {:else if kind === 'vcard'}
        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label for="vcard-first" class="field-label">First name</label>
            <input id="vcard-first" type="text" bind:value={payload.vcard.firstName} class="input" />
          </div>
          <div>
            <label for="vcard-last" class="field-label">Last name</label>
            <input id="vcard-last" type="text" bind:value={payload.vcard.lastName} class="input" />
          </div>
          <div>
            <label for="vcard-org" class="field-label">Organization</label>
            <input id="vcard-org" type="text" bind:value={payload.vcard.org} class="input" />
          </div>
          <div>
            <label for="vcard-title" class="field-label">Job title</label>
            <input id="vcard-title" type="text" bind:value={payload.vcard.title} class="input" />
          </div>
          <div>
            <label for="vcard-phone" class="field-label">Phone</label>
            <input id="vcard-phone" type="tel" bind:value={payload.vcard.phone} class="input" />
          </div>
          <div>
            <label for="vcard-email" class="field-label">Email</label>
            <input id="vcard-email" type="email" bind:value={payload.vcard.email} class="input" />
          </div>
          <div>
            <label for="vcard-url" class="field-label">Website</label>
            <input id="vcard-url" type="url" bind:value={payload.vcard.url} class="input" />
          </div>
          <div>
            <label for="vcard-address" class="field-label">Address</label>
            <input id="vcard-address" type="text" bind:value={payload.vcard.address} class="input" />
          </div>
          <div class="sm:col-span-2">
            <label for="vcard-note" class="field-label">Note</label>
            <input id="vcard-note" type="text" bind:value={payload.vcard.note} class="input" />
          </div>
        </div>
      {:else if kind === 'event'}
        <div class="grid gap-4 sm:grid-cols-2">
          <div class="sm:col-span-2">
            <label for="event-title" class="field-label">Event title</label>
            <input id="event-title" type="text" bind:value={payload.event.title} class="input" />
          </div>
          <div class="sm:col-span-2">
            <label for="event-location" class="field-label">Location</label>
            <input id="event-location" type="text" bind:value={payload.event.location} class="input" />
          </div>
          <div>
            <label for="event-start" class="field-label">Start</label>
            <input id="event-start" type={payload.event.allDay ? 'date' : 'datetime-local'} bind:value={payload.event.start} class="input" />
          </div>
          <div>
            <label for="event-end" class="field-label">End <span class="text-fg-dim font-normal">(optional)</span></label>
            <input id="event-end" type={payload.event.allDay ? 'date' : 'datetime-local'} bind:value={payload.event.end} class="input" />
          </div>
          <label class="flex items-center gap-2 text-sm text-fg sm:col-span-2">
            <input id="event-allday" type="checkbox" bind:checked={payload.event.allDay} class="checkbox" />
            <span>All-day event</span>
          </label>
          <div class="sm:col-span-2">
            <label for="event-desc" class="field-label">Description <span class="text-fg-dim font-normal">(optional)</span></label>
            <textarea id="event-desc" bind:value={payload.event.description} rows="2" class="input"></textarea>
          </div>
        </div>
      {:else if kind === 'email'}
        <div class="grid gap-4">
          <div>
            <label for="email-to" class="field-label">Email address</label>
            <input id="email-to" type="email" bind:value={payload.email.to} class="input" />
          </div>
          <div>
            <label for="email-subject" class="field-label">Subject <span class="text-fg-dim font-normal">(optional)</span></label>
            <input id="email-subject" type="text" bind:value={payload.email.subject} class="input" />
          </div>
          <div>
            <label for="email-body" class="field-label">Message <span class="text-fg-dim font-normal">(optional)</span></label>
            <textarea id="email-body" bind:value={payload.email.body} rows="3" class="input"></textarea>
          </div>
        </div>
      {:else if kind === 'sms'}
        <div class="grid gap-4">
          <div>
            <label for="sms-phone" class="field-label">Phone number</label>
            <input id="sms-phone" type="tel" bind:value={payload.sms.phone} class="input" placeholder="+47 123 45 678" />
          </div>
          <div>
            <label for="sms-message" class="field-label">Message <span class="text-fg-dim font-normal">(optional)</span></label>
            <textarea id="sms-message" bind:value={payload.sms.message} rows="3" class="input"></textarea>
          </div>
        </div>
      {:else if kind === 'geo'}
        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label for="geo-lat" class="field-label">Latitude</label>
            <input id="geo-lat" type="number" step="any" min="-90" max="90" bind:value={payload.geo.lat} class="input" />
          </div>
          <div>
            <label for="geo-lng" class="field-label">Longitude</label>
            <input id="geo-lng" type="number" step="any" min="-180" max="180" bind:value={payload.geo.lng} class="input" />
          </div>
        </div>
      {/if}

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
          <option value="image">Image (logo)</option>
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
      {:else if centerType === 'image'}
        <div>
          <label for="center-image" class="field-label">Logo image URL</label>
          <input
            id="center-image"
            type="url"
            bind:value={centerImageUrl}
            placeholder="https://example.com/logo.png"
            class="input"
          />
          <p class="mt-1.5 text-xs text-fg-dim">
            Fetched server-side, embedded into the code, and capped at 1 MB. Private/internal addresses are rejected.
          </p>
        </div>
      {/if}

      {#if kind === 'url'}
        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label for="expires-at" class="field-label">Expires at <span class="text-fg-dim font-normal">(optional)</span></label>
            <input id="expires-at" type="datetime-local" bind:value={expiresAt} min={minExpiresAt} class="input" />
          </div>
          <div>
            <label for="qr-password" class="field-label">Password <span class="text-fg-dim font-normal">(optional)</span></label>
            <input id="qr-password" type="password" bind:value={password} class="input" />
          </div>
        </div>
      {/if}

      {#if termsVersion}
        <label class="flex items-start gap-2.5 text-sm text-fg">
          <input
            id="terms-accept"
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
        <div class="alert alert-danger" role="alert">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" class="mt-0.5 shrink-0"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
          <span>{error}</span>
        </div>
      {/if}

      <button
        type="submit"
        disabled={loading || !hasInput || needsTerms}
        class="btn-primary btn-lg w-full"
        title="⌘/Ctrl + Enter"
      >
        {#if loading}
          <svg class="animate-spin" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.2-8.55" stroke-linecap="round"/></svg>
          Generating…
        {:else}
          Generate QR code
        {/if}
      </button>

      <button type="button" class="btn-ghost btn-sm mx-auto" on:click={clearForm}>Clear form</button>
    </form>
  </div>

  <aside bind:this={previewPanel} class="card scroll-mt-20 p-6 sm:p-8 lg:sticky lg:top-24">
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
      <QRPreview dataUrl={previewUrl} shortUrl={shortUrl} {svg} shortCode={generatedCode} {isStatic} />
      {#if shortUrl && !isAuthed}
        <p class="alert alert-info mt-4 text-xs" role="status">
          This code isn't tied to an account — sign in first and codes you generate stay manageable in your dashboard.
        </p>
      {/if}
    {:else}
      <div class="grid aspect-square place-items-center rounded-md border border-dashed border-border-strong bg-bg-soft text-center">
        <div class="px-4">
          <div class="mx-auto grid h-10 w-10 place-items-center rounded-md bg-surface-2 text-fg-dim">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
              <path d="M3 3h7v7H3V3zm2 2v3h3V5H5zm9-2h7v7h-7V3zm2 2v3h3V5h-3zM3 14h7v7H3v-7zm2 2v3h3v-3H5zm9-2h2v2h-2v-2zm4 0h3v2h-2v1h-1v-3zm-4 4h2v3h-2v-3zm4 1h3v2h-3v-2zm-2-1h2v2h-2v-2z"/>
            </svg>
          </div>
          {#if hasInput && needsTerms}
            <p class="mt-3 text-sm font-medium text-fg">Almost there</p>
            <p class="mt-1 text-xs text-fg-dim">Accept the Terms of Use below to see the live preview.</p>
            <button type="button" class="link mt-2 text-xs" on:click={focusTerms}>Take me to it</button>
          {:else}
            <p class="mt-3 text-sm font-medium text-fg">Your QR will appear here</p>
            <p class="mt-1 text-xs text-fg-dim">{isStatic ? 'Fill in the content — the preview updates as you edit.' : 'Type a URL — the preview updates as you edit.'}</p>
          {/if}
        </div>
      </div>
    {/if}
  </aside>
</div>
