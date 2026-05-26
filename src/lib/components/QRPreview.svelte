<script>
  export let dataUrl = '';
  export let shortUrl = '';
  export let svg = '';

  let copied = false;
  $: svgDataUrl = svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : '';

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
</script>

{#if dataUrl}
  <div class="space-y-5">
    <div class="grid place-items-center rounded-md border border-border bg-white p-4">
      <img src={dataUrl} alt="QR Code" class="h-56 w-56" />
    </div>

    {#if shortUrl}
      <div>
        <p class="eyebrow mb-1.5">Short URL</p>
        <div class="flex items-stretch gap-2">
          <a
            href={shortUrl}
            target="_blank"
            rel="noopener"
            class="flex h-10 flex-1 items-center truncate rounded-md border border-border-strong bg-surface px-3 font-mono text-xs text-fg hover:border-accent hover:text-accent"
          >
            {shortUrl}
          </a>
          <button on:click={copyShort} class="btn-secondary btn-sm shrink-0" type="button" aria-label="Copy short URL">
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

    <div class="grid grid-cols-2 gap-2">
      <a href={dataUrl} download="open-qr.png" class="btn-secondary btn-sm">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
        PNG
      </a>
      {#if svgDataUrl}
        <a href={svgDataUrl} download="open-qr.svg" class="btn-secondary btn-sm">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
          SVG
        </a>
      {/if}
    </div>
  </div>
{/if}
