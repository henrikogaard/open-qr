<script>
  // @ts-nocheck
  import Navbar from '$lib/components/Navbar.svelte';

  export let data;

  const SIZE_OPTIONS = [20, 25, 30, 40, 50];
  let size = 30;
  let showCaption = true;

  const STATIC_KIND_LABELS = {
    wifi: 'Wi-Fi network',
    vcard: 'contact card',
    event: 'calendar event',
    email: 'email draft',
    sms: 'SMS draft',
    geo: 'location',
    text: 'plain text'
  };
  $: caption = data.isStatic
    ? `Scan to open the ${STATIC_KIND_LABELS[data.qr.kind] || data.qr.kind}`
    : data.shortUrl;
</script>

<svelte:head>
  <title>Print /go/{data.qr.short_code} — Open-QR</title>
</svelte:head>

<Navbar user={data.user} />

<main class="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
  <div class="no-print mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div>
      <p class="eyebrow">Print sheet</p>
      <h1 class="mt-1 text-3xl font-semibold tracking-tight text-fg">/go/{data.qr.short_code}</h1>
      <p class="mt-1 max-w-xl truncate text-sm text-fg-muted">{data.qr.target_url}</p>
    </div>
    <div class="flex gap-2">
      <a href={`/dashboard/qr/${data.qr.short_code}`} class="btn-secondary">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
        Back
      </a>
      <button type="button" class="btn-primary" on:click={() => window.print()}>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
        Print
      </button>
    </div>
  </div>

  <div class="no-print card mb-8 space-y-5">
    <div>
      <p class="eyebrow mb-2">Printed size</p>
      <div class="inline-flex rounded-md border border-border bg-surface p-1 text-sm" role="group" aria-label="Printed QR size">
        {#each SIZE_OPTIONS as mm}
          <button
            type="button"
            on:click={() => (size = mm)}
            class="rounded-[5px] px-3 py-1.5 transition-colors {size === mm ? 'bg-accent text-accent-fg' : 'text-fg-muted hover:text-fg'}"
          >
            {mm} mm
          </button>
        {/each}
      </div>
      <p class="mt-2 text-xs text-fg-dim">
        Physical size of the printed QR including its quiet-zone border. 25–30&nbsp;mm works for posters and table tents scanned at arm's length; go larger for distances beyond ~2&nbsp;m.
      </p>
    </div>
    <label class="flex items-center gap-2 text-sm text-fg">
      <input type="checkbox" bind:checked={showCaption} class="checkbox" />
      <span>Print the caption under the QR (short URL or content hint)</span>
    </label>
    <p class="text-xs text-fg-dim">
      The preview below is approximately to scale; the print dialog is authoritative. Leave "fit to page" off to keep the exact size.
    </p>
  </div>

  <section class="sheet rounded-lg border border-border bg-surface p-10 text-center" aria-label="Print preview">
    <div class="mx-auto" style={`width:${size}mm;height:${size}mm`}>
      <img
        src={`/api/v1/qr/${data.qr.short_code}/image?format=svg`}
        alt="QR code for /go/{data.qr.short_code}"
        class="qr-img"
      />
    </div>
    {#if showCaption}
      <p class="mt-5 break-all font-mono text-sm text-fg">{caption}</p>
      <p class="mt-1 text-xs text-fg-dim">Scan with your phone camera</p>
    {/if}
  </section>
</main>

<style>
  .qr-img {
    display: block;
    width: 100%;
    height: 100%;
  }

  /* The sheet prints as the whole page: nav, controls and page chrome drop
     out, and the QR keeps its exact physical size and baked-in colors. */
  @media print {
    :global(nav),
    .no-print {
      display: none !important;
    }
    :global(main) {
      max-width: none !important;
      padding: 0 !important;
    }
    .sheet {
      border: none !important;
      border-radius: 0 !important;
      background: transparent !important;
      padding: 0 !important;
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }
  }
</style>
