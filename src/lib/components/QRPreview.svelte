<script>
  export let dataUrl = '';
  export let shortUrl = '';
  export let svg = '';
  /** Short code for download filenames; empty until the code is persisted. */
  export let shortCode = '';
  /** Static codes have no short URL to scan — show a content note instead. */
  export let isStatic = false;

  const PNG_SIZES = [
    { label: '400 px', value: 400 },
    { label: '800 px', value: 800 },
    { label: '1200 px', value: 1200 },
    { label: '2000 px (print)', value: 2000 }
  ];

  let pngSize = 800;
  let downloading = false;

  let copied = false;
  $: svgDataUrl = svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : '';
  $: fileBase = shortCode || 'open-qr';

  async function copyShort() {
    if (!shortUrl) return;
    try {
      await navigator.clipboard.writeText(shortUrl);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      /* ignore */
    }
  }

  /**
   * Rasterizes the SVG at the chosen size in the browser — print-quality PNGs
   * without a server round-trip, and it works for anonymous and static codes
   * alike. Falls back to the server-rendered 400px data URL if anything goes
   * wrong (no SVG, canvas failure).
   * @param {number} size
   */
  async function pngAtSize(size) {
    if (!svg) return dataUrl;
    const blobUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    try {
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = blobUrl;
      });
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return dataUrl;
      ctx.drawImage(img, 0, 0, size, size);
      return canvas.toDataURL('image/png');
    } catch {
      return dataUrl;
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  }

  async function downloadPng() {
    downloading = true;
    try {
      const href = await pngAtSize(pngSize);
      const a = document.createElement('a');
      a.href = href;
      a.download = `${fileBase}-${pngSize}px.png`;
      a.click();
    } finally {
      downloading = false;
    }
  }

  function downloadSvg() {
    const a = document.createElement('a');
    a.href = svgDataUrl;
    a.download = `${fileBase}.svg`;
    a.click();
  }
</script>

{#if dataUrl}
  <div class="space-y-5">
    <div class="grid place-items-center rounded-md border border-border bg-white p-4">
      <img src={dataUrl} alt="QR Code" class="h-56 w-56" />
    </div>

    {#if isStatic}
      <p class="alert alert-info text-xs" role="status">
        Static QR — the content is encoded in the image itself. Scans open it directly on the phone and are not tracked.
      </p>
    {:else if shortUrl}
      <div>
        <p class="eyebrow mb-1.5">Short URL</p>
        <div class="flex items-stretch gap-2">
          <a
            href={shortUrl}
            target="_blank"
            rel="noopener"
            class="flex min-h-10 flex-1 items-center rounded-md border border-border-strong bg-surface px-3 py-2 font-mono text-xs leading-relaxed break-all text-fg hover:border-accent hover:text-accent"
          >
            {shortUrl}
          </a>
          <button on:click={copyShort} class="btn-secondary btn-sm shrink-0" type="button" aria-label="Copy short URL" aria-live="polite">
            {#if copied}
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
              Copied
            {:else}
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              Copy
            {/if}
          </button>
        </div>
      </div>
    {/if}

    <div class="space-y-2">
      <div class="grid grid-cols-2 gap-2">
        <button on:click={downloadPng} disabled={downloading} class="btn-secondary btn-sm" type="button">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
          {downloading ? 'Rendering…' : 'PNG'}
        </button>
        {#if svgDataUrl}
          <button on:click={downloadSvg} class="btn-secondary btn-sm" type="button">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
            SVG
          </button>
        {/if}
      </div>
      <div class="flex items-center gap-2">
        <label for="png-size" class="text-xs text-fg-dim shrink-0">PNG size</label>
        <select id="png-size" bind:value={pngSize} class="select w-auto min-w-0 flex-1 text-xs">
          {#each PNG_SIZES as size}
            <option value={size.value}>{size.label}</option>
          {/each}
        </select>
      </div>
    </div>
  </div>
{/if}
