<script>
  // @ts-nocheck
  import { onDestroy, onMount } from 'svelte';
  import Navbar from '$lib/components/Navbar.svelte';
  import QRPreview from '$lib/components/QRPreview.svelte';
  import { EMPTY_UTM, appendUtmParams } from '$lib/utm';

  export let data;

  let isStatic = Boolean(data.isStatic);
  let staticKind = data.qr.kind || 'url';
  let decoded = data.decodedPayload || null;

  let targetUrl = data.qr.target_url;
  let isActive = Boolean(data.qr.is_active);
  let expiresAt = data.qr.expires_at ? data.qr.expires_at.slice(0, 16) : '';
  let password = '';
  let campaignId = data.qr.campaign_id ? String(data.qr.campaign_id) : '';
  let template = data.qr.template || 'default';
  let foregroundColor = data.qr.foreground_color || '#000000';
  let backgroundColor = data.qr.background_color || '#FFFFFF';
  let borderSize = data.qr.border_size || 'medium';
  let borderStyle = data.qr.border_style || 'solid';
  let centerType = data.qr.center_type || 'none';
  let centerImageUrl = data.qr.center_image_url || '';
  let centerText = data.qr.center_text || '';
  let centerTextColor = data.qr.center_text_color || '#000000';
  let errorCorrection = data.qr.error_correction || 'M';
  let previewUrl = '';
  let shortUrl = data.shortUrl;
  let svg = '';
  let saving = false;
  let previewing = false;
  let message = '';
  let errorMessage = '';
  /** Earliest selectable expiry (client clock), set on mount to avoid SSR mismatch. */
  let minExpiresAt = '';

  // Static payload edit form state (only when decoded prefill succeeded).
  let payload = decoded
    ? {
        text: { text: decoded.text || '' },
        wifi: { ssid: decoded.ssid || '', password: decoded.password || '', encryption: decoded.encryption || 'WPA', hidden: decoded.hidden === true },
        vcard: {
          firstName: decoded.firstName || '', lastName: decoded.lastName || '', org: decoded.org || '',
          title: decoded.title || '', phone: decoded.phone || '', email: decoded.email || '',
          url: decoded.url || '', address: decoded.address || '', note: decoded.note || ''
        },
        event: {
          title: decoded.title || '', location: decoded.location || '', start: decoded.start || '',
          end: decoded.end || '', allDay: decoded.allDay === true, description: decoded.description || ''
        },
        email: { to: decoded.to || '', subject: decoded.subject || '', body: decoded.body || '' },
        sms: { phone: decoded.phone || '', message: decoded.message || '' },
        geo: { lat: decoded.lat || '', lng: decoded.lng || '' }
      }
    : null;

  // UTM builder state — reflects the utm_* params already on the stored URL
  // (round-trips: editing the fields rewrites the destination's query).
  let utmOpen = false;
  let utm = { ...EMPTY_UTM };
  $: finalTargetUrl = isStatic ? '' : appendUtmParams(targetUrl, utm);

  // Target variants (scheduled overrides + A/B splits), url kind only.
  let variants = (data.variants || []).map((v) => ({
    label: v.label || '',
    targetUrl: v.target_url,
    weight: v.weight || 0,
    startsAt: v.starts_at ? String(v.starts_at).slice(0, 16) : '',
    endsAt: v.ends_at ? String(v.ends_at).slice(0, 16) : '',
    isActive: v.is_active !== 0
  }));
  let variantsOpen = variants.length > 0;

  function addVariant() {
    variants = [...variants, { label: '', targetUrl: '', weight: 0, startsAt: '', endsAt: '', isActive: true }];
  }

  /** @param {number} index */
  function removeVariant(index) {
    variants = variants.filter((_, i) => i !== index);
  }

  $: weightTotal = variants.filter((v) => v.weight > 0).reduce((sum, v) => sum + Number(v.weight || 0), 0);

  // Stacked split preview mirroring the server's resolveTarget semantics:
  // weights are shares of ALL traffic; anything under 100 falls back to the
  // main URL; over-subscribed totals normalize proportionally.
  const SPLIT_COLORS = ['bg-accent', 'bg-info', 'bg-success', 'bg-warning', 'bg-danger'];
  $: splitVariants = variants.filter((v) => v.weight > 0 && v.isActive !== false);
  /** @param {any[]} weighted */
  function buildSplitSegments(weighted) {
    const total = weighted.reduce((sum, v) => sum + Number(v.weight || 0), 0);
    if (!weighted.length || total <= 0) return [];
    const segments = weighted.map((v, i) => ({
      label: v.label || v.targetUrl || 'Variant',
      share: total > 100 ? (Number(v.weight) / total) * 100 : Number(v.weight),
      color: SPLIT_COLORS[i % SPLIT_COLORS.length]
    }));
    if (total < 100) segments.push({ label: 'Main URL (fallback)', share: 100 - total, color: 'bg-surface-3' });
    return segments;
  }
  // splitVariants is derived at statement level so weight/label edits re-run
  // this — reading `variants` inside buildSplitSegments wouldn't register.
  $: splitSegments = buildSplitSegments(splitVariants);

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

  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let debounceHandle;
  /** @type {AbortController | undefined} */
  let inflight;
  let mounted = false;

  async function runPreview() {
    if (isStatic ? !payload : !targetUrl) return;
    inflight?.abort();
    inflight = new AbortController();
    previewing = true;
    try {
      const response = await fetch('/api/v1/qr?preview=1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          isStatic
            ? { kind: staticKind, payload: payload[staticKind], style: buildStyle() }
            : { targetUrl, style: buildStyle() }
        ),
        signal: inflight.signal
      });
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error?.message || result.message || 'Preview failed');
      }
      previewUrl = result.data.dataUrl;
      svg = result.data.svg;
      errorMessage = '';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      errorMessage = err instanceof Error ? err.message : 'Preview failed';
    } finally {
      previewing = false;
    }
  }

  function schedulePreview() {
    if (!mounted) return;
    clearTimeout(debounceHandle);
    debounceHandle = setTimeout(runPreview, 200);
  }

  $: previewDeps = [
    targetUrl,
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
    payload && isStatic ? JSON.stringify(payload[staticKind]) : ''
  ];
  $: if (previewDeps) schedulePreview();

  onMount(() => {
    mounted = true;
    minExpiresAt = new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    runPreview();
  });

  onDestroy(() => {
    clearTimeout(debounceHandle);
    inflight?.abort();
  });

  async function save() {
    saving = true;
    message = '';
    errorMessage = '';

    try {
      const body = isStatic
        ? { payload: payload ? payload[staticKind] : undefined }
        : {
            target_url: finalTargetUrl,
            expires_at: expiresAt || null,
            password_hash: password || undefined,
            campaign_id: campaignId || null,
            variants: variants.map((v) => ({
              label: v.label || undefined,
              targetUrl: v.targetUrl,
              weight: v.weight === '' || v.weight === null ? 0 : Number(v.weight),
              startsAt: v.startsAt || undefined,
              endsAt: v.endsAt || undefined,
              isActive: v.isActive
            }))
          };

      const response = await fetch(`/api/v1/qr/${data.qr.short_code}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          is_active: isActive ? 1 : 0,
          template,
          foreground_color: foregroundColor,
          background_color: backgroundColor,
          border_size: borderSize,
          border_style: borderStyle,
          center_type: centerType,
          center_image_url: centerImageUrl || null,
          center_text: centerText || null,
          center_text_color: centerTextColor,
          error_correction: errorCorrection,
          campaign_id: campaignId || null,
          ...body
        })
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || result.error?.message || 'Failed to save QR code');
      }

      previewUrl = result.data.dataUrl;
      shortUrl = result.data.shortUrl || '';
      svg = result.data.svg;
      variants = (result.data.variants || []).map((v) => ({
        label: v.label || '',
        targetUrl: v.target_url,
        weight: v.weight || 0,
        startsAt: v.starts_at ? String(v.starts_at).slice(0, 16) : '',
        endsAt: v.ends_at ? String(v.ends_at).slice(0, 16) : '',
        isActive: v.is_active !== 0
      }));
      password = '';
      message = 'Saved';
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Failed to save QR code';
    } finally {
      saving = false;
    }
  }
</script>

<Navbar user={data.user} />

<svelte:head>
  <title>Edit /go/{data.qr.short_code} — Open-QR</title>
</svelte:head>

<main class="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
  <div class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div>
      <p class="eyebrow">Edit QR</p>
      <h1 class="mt-1 text-3xl font-semibold tracking-tight text-fg">Update settings</h1>
      <p class="mt-1 font-mono text-xs text-fg-dim">/go/{data.qr.short_code}</p>
    </div>
    <div class="flex flex-wrap gap-2">
      {#if isStatic}
        <a href={`/go/${data.qr.short_code}`} target="_blank" rel="noopener noreferrer" class="btn-secondary">
          View /go page
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14 21 3"/></svg>
        </a>
      {:else if targetUrl.trim()}
        <a href={targetUrl} target="_blank" rel="noopener noreferrer" class="btn-secondary">
          Open destination
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14 21 3"/></svg>
        </a>
      {/if}
      <a href={`/dashboard/qr/${data.qr.short_code}/print`} class="btn-secondary">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
        Print sheet
      </a>
      <a href="/dashboard" class="btn-secondary">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
        Back to dashboard
      </a>
    </div>
  </div>

  <div class="grid gap-6 lg:grid-cols-[1fr_340px] lg:items-start">
    <form on:submit|preventDefault={save} class="card p-6 sm:p-8 space-y-5">
      {#if isStatic}
        <div class="rounded-md border border-border bg-bg-soft p-4">
          <p class="eyebrow">Static content ({staticKind})</p>
          <p class="mt-1 text-xs text-fg-dim">
            Editing re-encodes the QR image — remember to reprint or re-share it, because previously printed copies keep the old content.
          </p>
        </div>

        {#if payload}
          {#if staticKind === 'text'}
            <div>
              <label for="edit-payload-text" class="field-label">Text</label>
              <textarea id="edit-payload-text" bind:value={payload.text.text} rows="4" maxlength="1200" class="input"></textarea>
            </div>
          {:else if staticKind === 'wifi'}
            <div class="grid gap-4 md:grid-cols-2">
              <div>
                <label for="edit-wifi-ssid" class="field-label">Network name (SSID)</label>
                <input id="edit-wifi-ssid" type="text" bind:value={payload.wifi.ssid} class="input" />
              </div>
              <div>
                <label for="edit-wifi-encryption" class="field-label">Security</label>
                <select id="edit-wifi-encryption" bind:value={payload.wifi.encryption} class="select">
                  <option value="WPA">WPA / WPA2 / WPA3</option>
                  <option value="WEP">WEP</option>
                  <option value="nopass">None (open network)</option>
                </select>
              </div>
              {#if payload.wifi.encryption !== 'nopass'}
                <div>
                  <label for="edit-wifi-password" class="field-label">Password</label>
                  <input id="edit-wifi-password" type="text" bind:value={payload.wifi.password} class="input font-mono" autocomplete="off" />
                </div>
              {/if}
              <label class="flex items-center gap-2 self-end pb-2 text-sm text-fg">
                <input id="edit-wifi-hidden" type="checkbox" bind:checked={payload.wifi.hidden} class="checkbox" />
                <span>Hidden network</span>
              </label>
            </div>
          {:else if staticKind === 'vcard'}
            <div class="grid gap-4 md:grid-cols-2">
              <div>
                <label for="edit-vcard-first" class="field-label">First name</label>
                <input id="edit-vcard-first" type="text" bind:value={payload.vcard.firstName} class="input" />
              </div>
              <div>
                <label for="edit-vcard-last" class="field-label">Last name</label>
                <input id="edit-vcard-last" type="text" bind:value={payload.vcard.lastName} class="input" />
              </div>
              <div>
                <label for="edit-vcard-phone" class="field-label">Phone</label>
                <input id="edit-vcard-phone" type="tel" bind:value={payload.vcard.phone} class="input" />
              </div>
              <div>
                <label for="edit-vcard-email" class="field-label">Email</label>
                <input id="edit-vcard-email" type="email" bind:value={payload.vcard.email} class="input" />
              </div>
              <div>
                <label for="edit-vcard-org" class="field-label">Organization</label>
                <input id="edit-vcard-org" type="text" bind:value={payload.vcard.org} class="input" />
              </div>
              <div>
                <label for="edit-vcard-title" class="field-label">Job title</label>
                <input id="edit-vcard-title" type="text" bind:value={payload.vcard.title} class="input" />
              </div>
              <div>
                <label for="edit-vcard-url" class="field-label">Website</label>
                <input id="edit-vcard-url" type="url" bind:value={payload.vcard.url} class="input" />
              </div>
              <div>
                <label for="edit-vcard-address" class="field-label">Address</label>
                <input id="edit-vcard-address" type="text" bind:value={payload.vcard.address} class="input" />
              </div>
              <div class="md:col-span-2">
                <label for="edit-vcard-note" class="field-label">Note</label>
                <input id="edit-vcard-note" type="text" bind:value={payload.vcard.note} class="input" />
              </div>
            </div>
          {:else if staticKind === 'event'}
            <div class="grid gap-4 md:grid-cols-2">
              <div class="md:col-span-2">
                <label for="edit-event-title" class="field-label">Event title</label>
                <input id="edit-event-title" type="text" bind:value={payload.event.title} class="input" />
              </div>
              <div class="md:col-span-2">
                <label for="edit-event-location" class="field-label">Location</label>
                <input id="edit-event-location" type="text" bind:value={payload.event.location} class="input" />
              </div>
              <div>
                <label for="edit-event-start" class="field-label">Start</label>
                <input id="edit-event-start" type={payload.event.allDay ? 'date' : 'datetime-local'} bind:value={payload.event.start} class="input" />
              </div>
              <div>
                <label for="edit-event-end" class="field-label">End</label>
                <input id="edit-event-end" type={payload.event.allDay ? 'date' : 'datetime-local'} bind:value={payload.event.end} class="input" />
              </div>
              <label class="flex items-center gap-2 text-sm text-fg md:col-span-2">
                <input id="edit-event-allday" type="checkbox" bind:checked={payload.event.allDay} class="checkbox" />
                <span>All-day event</span>
              </label>
              <div class="md:col-span-2">
                <label for="edit-event-desc" class="field-label">Description</label>
                <textarea id="edit-event-desc" bind:value={payload.event.description} rows="2" class="input"></textarea>
              </div>
            </div>
          {:else if staticKind === 'email'}
            <div class="grid gap-4">
              <div>
                <label for="edit-email-to" class="field-label">Email address</label>
                <input id="edit-email-to" type="email" bind:value={payload.email.to} class="input" />
              </div>
              <div>
                <label for="edit-email-subject" class="field-label">Subject</label>
                <input id="edit-email-subject" type="text" bind:value={payload.email.subject} class="input" />
              </div>
              <div>
                <label for="edit-email-body" class="field-label">Message</label>
                <textarea id="edit-email-body" bind:value={payload.email.body} rows="3" class="input"></textarea>
              </div>
            </div>
          {:else if staticKind === 'sms'}
            <div class="grid gap-4">
              <div>
                <label for="edit-sms-phone" class="field-label">Phone number</label>
                <input id="edit-sms-phone" type="tel" bind:value={payload.sms.phone} class="input" />
              </div>
              <div>
                <label for="edit-sms-message" class="field-label">Message</label>
                <textarea id="edit-sms-message" bind:value={payload.sms.message} rows="3" class="input"></textarea>
              </div>
            </div>
          {:else if staticKind === 'geo'}
            <div class="grid gap-4 md:grid-cols-2">
              <div>
                <label for="edit-geo-lat" class="field-label">Latitude</label>
                <input id="edit-geo-lat" type="number" step="any" bind:value={payload.geo.lat} class="input" />
              </div>
              <div>
                <label for="edit-geo-lng" class="field-label">Longitude</label>
                <input id="edit-geo-lng" type="number" step="any" bind:value={payload.geo.lng} class="input" />
              </div>
            </div>
          {/if}
        {:else}
          <div class="alert alert-warning" role="status">
            <span>
              This static payload couldn't be parsed back into a form (it may have been created via the API).
              The current encoded content is shown below; create a new code if you need to change it.
            </span>
          </div>
          <pre class="overflow-auto whitespace-pre-wrap break-all rounded-md border border-border bg-bg-soft px-3 py-2 font-mono text-xs text-fg">{data.qr.target_url}</pre>
        {/if}
      {:else}
        <div>
          <label for="edit-target-url" class="field-label">Target URL</label>
          <input id="edit-target-url" type="url" bind:value={targetUrl} required class="input" />
        </div>

        <div class="rounded-md border border-border bg-bg-soft p-4">
          <button type="button" class="flex w-full items-center justify-between text-left" on:click={() => (utmOpen = !utmOpen)} aria-expanded={utmOpen}>
            <span>
              <span class="field-label">UTM tracking parameters</span>
              <span class="mt-0.5 block text-xs text-fg-dim">Tag the destination for the receiving site's analytics</span>
            </span>
            <span class="text-fg-dim" aria-hidden="true">{utmOpen ? '−' : '+'}</span>
          </button>
          {#if utmOpen}
            <div class="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <label for="edit-utm-source" class="field-label">utm_source</label>
                <input id="edit-utm-source" type="text" bind:value={utm.source} class="input font-mono text-xs" />
              </div>
              <div>
                <label for="edit-utm-medium" class="field-label">utm_medium</label>
                <input id="edit-utm-medium" type="text" bind:value={utm.medium} class="input font-mono text-xs" />
              </div>
              <div>
                <label for="edit-utm-campaign" class="field-label">utm_campaign</label>
                <input id="edit-utm-campaign" type="text" bind:value={utm.campaign} class="input font-mono text-xs" />
              </div>
              <div>
                <label for="edit-utm-term" class="field-label">utm_term</label>
                <input id="edit-utm-term" type="text" bind:value={utm.term} class="input font-mono text-xs" />
              </div>
              <div class="sm:col-span-2">
                <label for="edit-utm-content" class="field-label">utm_content</label>
                <input id="edit-utm-content" type="text" bind:value={utm.content} class="input font-mono text-xs" />
              </div>
              {#if targetUrl.trim()}
                <p class="sm:col-span-2 break-all rounded-md border border-border bg-surface px-3 py-2 font-mono text-xs text-fg-muted">{finalTargetUrl}</p>
              {/if}
            </div>
          {/if}
        </div>

        <div>
          <button type="button" class="flex w-full items-center justify-between text-left rounded-md border border-border bg-bg-soft p-4" on:click={() => (variantsOpen = !variantsOpen)} aria-expanded={variantsOpen}>
            <span>
              <span class="field-label">Alternative targets <span class="text-fg-dim font-normal">(scheduling &amp; A/B)</span></span>
              <span class="mt-0.5 block text-xs text-fg-dim">
                {variants.length
                  ? `${variants.length} variant${variants.length === 1 ? '' : 's'} configured`
                  : 'Serve a different URL during a time window, or split traffic between targets'}
              </span>
            </span>
            <span class="text-fg-dim" aria-hidden="true">{variantsOpen ? '−' : '+'}</span>
          </button>

          {#if variantsOpen}
            <div class="mt-4 space-y-4">
              {#if splitSegments.length}
                <div data-testid="split-bar" aria-label="Traffic split preview">
                  <div class="flex h-6 overflow-hidden rounded-md border border-border bg-surface-2" role="img" aria-label="Preview of how scans will be split between targets">
                    {#each splitSegments as seg}
                      <div class="{seg.color} h-full min-w-[2px]" style={`width:${seg.share}%`} title="{seg.label}: {Math.round(seg.share)}%"></div>
                    {/each}
                  </div>
                  <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-dim">
                    {#each splitSegments as seg}
                      <span class="inline-flex items-center gap-1.5">
                        <span class="h-2 w-2 shrink-0 rounded-sm {seg.color}"></span>
                        <span class="max-w-40 truncate">{seg.label}</span>
                        <span class="font-mono tabular">{Math.round(seg.share)}%</span>
                      </span>
                    {/each}
                  </div>
                </div>
              {/if}

              {#if variants.length > 0 && weightTotal > 0 && weightTotal !== 100}
                <div class="alert alert-warning text-xs" role="status">
                  <span>A/B weights currently total {weightTotal}% — traffic splits proportionally (remaining traffic uses the main URL above).</span>
                </div>
              {/if}

              {#each variants as variant, index}
                <fieldset class="rounded-md border border-border bg-bg-soft p-4 space-y-3">
                  <legend class="px-1.5 text-xs font-medium text-fg-dim">Variant {index + 1}</legend>
                  <div class="grid gap-3 sm:grid-cols-[1fr_120px]">
                    <div>
                      <label for={`variant-url-${index}`} class="field-label">Target URL</label>
                      <input id={`variant-url-${index}`} type="url" bind:value={variant.targetUrl} class="input" placeholder="https://…" />
                    </div>
                    <div>
                      <label for={`variant-label-${index}`} class="field-label">Label <span class="font-normal text-fg-dim">(optional)</span></label>
                      <input id={`variant-label-${index}`} type="text" bind:value={variant.label} maxlength="60" class="input" placeholder="live-page" />
                    </div>
                  </div>
                  <div class="grid gap-3 sm:grid-cols-3">
                    <div>
                      <label for={`variant-weight-${index}`} class="field-label">Weight % <span class="font-normal text-fg-dim">(0 = scheduled)</span></label>
                      <input id={`variant-weight-${index}`} type="number" min="0" max="100" bind:value={variant.weight} class="input" />
                    </div>
                    <div>
                      <label for={`variant-start-${index}`} class="field-label">Starts <span class="font-normal text-fg-dim">(optional)</span></label>
                      <input id={`variant-start-${index}`} type="datetime-local" bind:value={variant.startsAt} class="input" />
                    </div>
                    <div>
                      <label for={`variant-end-${index}`} class="field-label">Ends <span class="font-normal text-fg-dim">(optional)</span></label>
                      <input id={`variant-end-${index}`} type="datetime-local" bind:value={variant.endsAt} class="input" />
                    </div>
                  </div>
                  <div class="flex items-center justify-between">
                    <label class="flex items-center gap-2 text-sm text-fg">
                      <input type="checkbox" bind:checked={variant.isActive} class="checkbox" />
                      <span>Active</span>
                    </label>
                    <button type="button" on:click={() => removeVariant(index)} class="text-xs text-danger hover:underline">Remove</button>
                  </div>
                </fieldset>
              {/each}

              <button type="button" on:click={addVariant} class="btn-secondary btn-sm" disabled={variants.length >= 10}>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
                Add variant
              </button>
              <p class="text-xs text-fg-dim">
                A weight of <span class="font-mono">0</span> makes the variant a scheduled override: it wins during its time window (e.g. point to the live stream during an event, then fall back).
                A weight above 0 joins the A/B split — scans are attributed per variant on the stats page.
              </p>
            </div>
          {/if}
        </div>

        <div class="grid gap-4 md:grid-cols-2">
          <div>
            <label for="edit-expires-at" class="field-label">Expires at</label>
            <input id="edit-expires-at" type="datetime-local" bind:value={expiresAt} min={minExpiresAt} class="input" />
          </div>
          <div>
            <label for="edit-password" class="field-label">New password</label>
            <input id="edit-password" type="password" bind:value={password} placeholder="Leave unchanged" class="input" />
          </div>
        </div>
      {/if}

      <label class="flex items-center gap-2 text-sm text-fg">
        <input type="checkbox" bind:checked={isActive} class="checkbox" />
        <span>Active</span>
      </label>

      <div>
        <label for="edit-campaign" class="field-label">Campaign</label>
        <select id="edit-campaign" bind:value={campaignId} class="select">
          <option value="">No campaign</option>
          {#each data.campaigns as campaign}
            <option value={campaign.id}>{campaign.name}</option>
          {/each}
        </select>
      </div>

      <div>
        <label for="edit-template" class="field-label">Template</label>
        <select id="edit-template" bind:value={template} class="select">
          <option value="default">Default</option>
          <option value="minimal">Minimal</option>
          <option value="colorful">Colorful</option>
          <option value="rounded">Rounded</option>
          <option value="dark">Dark</option>
        </select>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <div>
          <label for="edit-foreground-color" class="field-label">Foreground</label>
          <input id="edit-foreground-color" type="color" bind:value={foregroundColor} class="input" />
        </div>
        <div>
          <label for="edit-background-color" class="field-label">Background</label>
          <input id="edit-background-color" type="color" bind:value={backgroundColor} class="input" />
        </div>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <div>
          <label for="edit-border-size" class="field-label">Border size</label>
          <select id="edit-border-size" bind:value={borderSize} class="select">
            <option value="none">None</option>
            <option value="small">Small</option>
            <option value="medium">Medium</option>
            <option value="large">Large</option>
          </select>
        </div>
        <div>
          <label for="edit-border-style" class="field-label">Border style</label>
          <select id="edit-border-style" bind:value={borderStyle} class="select">
            <option value="solid">Solid</option>
            <option value="dashed">Dashed</option>
            <option value="dotted">Dotted</option>
          </select>
        </div>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <div>
          <label for="edit-center-type" class="field-label">Center content</label>
          <select id="edit-center-type" bind:value={centerType} class="select">
            <option value="none">None</option>
            <option value="text">Text</option>
            <option value="image">Image (logo)</option>
          </select>
        </div>
        <div>
          <label for="edit-error-correction" class="field-label">Error correction</label>
          <select id="edit-error-correction" bind:value={errorCorrection} class="select">
            <option value="L">Low (7%)</option>
            <option value="M">Medium (15%)</option>
            <option value="Q">Quartile (25%)</option>
            <option value="H">High (30%)</option>
          </select>
        </div>
      </div>

      {#if centerType === 'text'}
        <div>
          <label for="edit-center-text" class="field-label">Center text</label>
          <input id="edit-center-text" type="text" bind:value={centerText} maxlength="10" class="input font-mono" />
        </div>
      {:else if centerType === 'image'}
        <div>
          <label for="edit-center-image" class="field-label">Logo image URL</label>
          <input id="edit-center-image" type="url" bind:value={centerImageUrl} placeholder="https://example.com/logo.png" class="input" />
          <p class="mt-1.5 text-xs text-fg-dim">Fetched server-side, embedded into the code, and capped at 1 MB.</p>
        </div>
      {/if}

      {#if message}
        <div class="alert alert-success" role="status"><span>{message}</span></div>
      {/if}
      {#if errorMessage}
        <div class="alert alert-danger" role="alert"><span>{errorMessage}</span></div>
      {/if}

      <button type="submit" disabled={saving} class="btn-primary btn-lg w-full">
        {saving ? 'Saving…' : 'Save changes'}
      </button>
    </form>

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
        <QRPreview dataUrl={previewUrl} {shortUrl} {svg} shortCode={data.qr.short_code} {isStatic} />
      {:else}
        <div class="space-y-3 text-sm">
          {#if !isStatic && shortUrl}
            <p class="eyebrow">Short URL</p>
            <a href={shortUrl} target="_blank" class="block break-all font-mono text-xs text-accent hover:underline">{shortUrl}</a>
          {/if}
          <p class="text-fg-muted">Loading preview…</p>
        </div>
      {/if}
    </aside>
  </div>
</main>
