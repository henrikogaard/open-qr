<script>
  // @ts-nocheck
  import Navbar from '$lib/components/Navbar.svelte';

  export let data;

  let csvText = `targetUrl,template,foregroundColor
https://example.com,default,#000000
https://example.org,rounded,#1a73e8
`;
  let file;
  let busy = false;
  /** @type {null | { created: number; failed: number; results: any[] }} */
  let result = null;
  let errorMessage = '';

  /** @param {Event} ev */
  async function onFile(ev) {
    const target = /** @type {HTMLInputElement} */ (ev.target);
    const f = target.files?.[0];
    if (!f) return;
    csvText = await f.text();
  }

  async function submit() {
    busy = true;
    result = null;
    errorMessage = '';
    try {
      const response = await fetch('/api/v1/qr/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'text/csv' },
        body: csvText
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || data.error?.message || 'Import failed');
      }
      result = data.data;
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Import failed';
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>Bulk import — Open-QR</title></svelte:head>

<Navbar user={data.user} />

<main class="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
  <header class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div>
      <p class="eyebrow">Bulk import</p>
      <h1 class="mt-1 text-3xl font-semibold tracking-tight text-fg">Upload CSV</h1>
      <p class="mt-1 text-sm text-fg-muted">
        Create many QR codes in one go. The first row is the header; only <span class="font-mono text-xs">targetUrl</span> is required.
      </p>
    </div>
    <a href="/dashboard" class="btn-secondary">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
      Back
    </a>
  </header>

  <div class="card mb-6 space-y-2 text-sm">
    <p class="eyebrow">Supported columns</p>
    <p class="font-mono text-xs text-fg-muted leading-relaxed">
      targetUrl, template, foregroundColor, backgroundColor, borderSize, borderStyle,
      centerType, centerText, centerTextColor, errorCorrection, expiresAt, password
    </p>
  </div>

  <form on:submit|preventDefault={submit} class="card space-y-5">
    <div>
      <label for="csv-file" class="field-label">Upload .csv file</label>
      <input id="csv-file" type="file" accept=".csv,text/csv" bind:this={file} on:change={onFile} class="input" />
    </div>

    <div>
      <label for="csv-text" class="field-label">…or paste CSV directly</label>
      <textarea id="csv-text" bind:value={csvText} rows="10" class="textarea font-mono text-xs"></textarea>
    </div>

    {#if errorMessage}
      <div class="alert alert-danger"><span>{errorMessage}</span></div>
    {/if}

    <button type="submit" disabled={busy || !csvText.trim()} class="btn-primary btn-lg w-full">
      {busy ? 'Importing…' : 'Import'}
    </button>
  </form>

  {#if result}
    <section class="mt-8">
      <div class="mb-4 flex flex-wrap items-baseline gap-3">
        <h2 class="text-xl font-semibold text-fg">Result</h2>
        <span class="badge badge-success">{result.created} created</span>
        {#if result.failed}
          <span class="badge badge-danger">{result.failed} failed</span>
        {/if}
      </div>

      <div class="card-flush overflow-hidden">
        <table class="table">
          <thead>
            <tr>
              <th>Row</th>
              <th>Status</th>
              <th>Short URL / Error</th>
            </tr>
          </thead>
          <tbody>
            {#each result.results as r}
              <tr>
                <td class="font-mono tabular text-fg">{r.row}</td>
                <td>
                  {#if r.success}
                    <span class="badge badge-success">OK</span>
                  {:else}
                    <span class="badge badge-danger">Failed</span>
                  {/if}
                </td>
                <td class="font-mono text-xs text-fg-muted break-all">
                  {r.success ? r.shortUrl : r.error}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  {/if}
</main>
