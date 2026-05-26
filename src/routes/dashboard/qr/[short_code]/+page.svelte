<script>
  // @ts-nocheck
  import { onDestroy, onMount } from 'svelte';
  import Navbar from '$lib/components/Navbar.svelte';
  import QRPreview from '$lib/components/QRPreview.svelte';

  export let data;

  let targetUrl = data.qr.target_url;
  let isActive = Boolean(data.qr.is_active);
  let expiresAt = data.qr.expires_at ? data.qr.expires_at.slice(0, 16) : '';
  let password = '';
  let template = data.qr.template || 'default';
  let foregroundColor = data.qr.foreground_color || '#000000';
  let backgroundColor = data.qr.background_color || '#FFFFFF';
  let borderSize = data.qr.border_size || 'medium';
  let borderStyle = data.qr.border_style || 'solid';
  let centerType = data.qr.center_type || 'none';
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
  let mounted = false;

  async function runPreview() {
    if (!targetUrl) return;
    inflight?.abort();
    inflight = new AbortController();
    previewing = true;
    try {
      const response = await fetch('/api/v1/qr?preview=1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUrl, style: buildStyle() }),
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

  onMount(() => {
    mounted = true;
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
      const response = await fetch(`/api/v1/qr/${data.qr.short_code}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_url: targetUrl,
          expires_at: expiresAt || null,
          password_hash: password || undefined,
          is_active: isActive ? 1 : 0,
          template,
          foreground_color: foregroundColor,
          background_color: backgroundColor,
          border_size: borderSize,
          border_style: borderStyle,
          center_type: centerType,
          center_text: centerText || null,
          center_text_color: centerTextColor,
          error_correction: errorCorrection
        })
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || result.error?.message || 'Failed to save QR code');
      }

      previewUrl = result.data.dataUrl;
      shortUrl = result.data.shortUrl;
      svg = result.data.svg;
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

<main class="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
  <div class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div>
      <p class="eyebrow">Edit QR</p>
      <h1 class="mt-1 text-3xl font-semibold tracking-tight text-fg">Update settings</h1>
      <p class="mt-1 font-mono text-xs text-fg-dim">/go/{data.qr.short_code}</p>
    </div>
    <a href="/dashboard" class="btn-secondary">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
      Back to dashboard
    </a>
  </div>

  <div class="grid gap-6 lg:grid-cols-[1fr_340px] lg:items-start">
    <form on:submit|preventDefault={save} class="card p-6 sm:p-8 space-y-5">
      <div>
        <label for="edit-target-url" class="field-label">Target URL</label>
        <input id="edit-target-url" type="url" bind:value={targetUrl} required class="input" />
      </div>

      <label class="flex items-center gap-2 text-sm text-fg">
        <input type="checkbox" bind:checked={isActive} class="checkbox" />
        <span>Active</span>
      </label>

      <div class="grid gap-4 md:grid-cols-2">
        <div>
          <label for="edit-expires-at" class="field-label">Expires at</label>
          <input id="edit-expires-at" type="datetime-local" bind:value={expiresAt} class="input" />
        </div>
        <div>
          <label for="edit-password" class="field-label">New password</label>
          <input id="edit-password" type="password" bind:value={password} placeholder="Leave unchanged" class="input" />
        </div>
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
      {/if}

      {#if message}
        <div class="alert alert-success"><span>{message}</span></div>
      {/if}
      {#if errorMessage}
        <div class="alert alert-danger"><span>{errorMessage}</span></div>
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
        <QRPreview dataUrl={previewUrl} {shortUrl} {svg} />
      {:else}
        <div class="space-y-3 text-sm">
          <p class="eyebrow">Short URL</p>
          <a href={shortUrl} target="_blank" class="block break-all font-mono text-xs text-accent hover:underline">{shortUrl}</a>
          <p class="text-fg-muted">Loading preview…</p>
        </div>
      {/if}
    </aside>
  </div>
</main>
