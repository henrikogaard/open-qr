<script>
  import Navbar from '$lib/components/Navbar.svelte';
  import Footer from '$lib/components/Footer.svelte';

  export let data;
</script>

<svelte:head>
  <title>Status — Open-QR</title>
</svelte:head>

<Navbar user={null} />

<main class="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
  <header class="mb-8">
    <p class="eyebrow">Status</p>
    <h1 class="mt-1 text-3xl font-semibold tracking-tight text-fg">Instance health</h1>
    <p class="mt-1 text-sm text-fg-muted">Operational checks for this Open-QR deployment.</p>
  </header>

  <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
    {#each data.status.checks as check}
      <section class="card">
        <p class="eyebrow">{check.label}</p>
        <p class="mt-2 text-lg font-semibold {check.ok ? 'text-success' : 'text-danger'}">
          {check.ok ? 'OK' : 'Needs attention'}
        </p>
        <p class="mt-1 text-xs text-fg-dim">{check.detail}</p>
      </section>
    {/each}
  </div>

  <section class="card mt-8">
    <p class="eyebrow">Configuration</p>
    <dl class="mt-4 grid gap-3 text-sm sm:grid-cols-2">
      <div><dt class="text-fg-dim">Version</dt><dd class="font-mono text-fg">{data.status.version}</dd></div>
      <div><dt class="text-fg-dim">Generated</dt><dd class="font-mono text-fg">{data.status.generatedAt}</dd></div>
      <div><dt class="text-fg-dim">Plausible</dt><dd class="text-fg">{data.status.features.plausible ? 'Enabled' : 'Disabled'}</dd></div>
      <div><dt class="text-fg-dim">Threat intelligence</dt><dd class="text-fg">{data.status.features.threatIntel ? 'Enabled' : 'Disabled'}</dd></div>
    </dl>
  </section>
</main>

<Footer />
