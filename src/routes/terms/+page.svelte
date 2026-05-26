<script>
  // @ts-nocheck
  import Navbar from '$lib/components/Navbar.svelte';
  import Footer from '$lib/components/Footer.svelte';

  export let data;
  $: t = data.terms;
</script>

<svelte:head>
  <title>Terms of Use — {t.brandName}</title>
  <meta name="description" content="Terms of Use and acceptable-use policy for {t.brandName}." />
</svelte:head>

<Navbar user={data?.user} />

<main class="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
  <header class="mb-10">
    <p class="eyebrow">Terms of Use</p>
    <h1 class="mt-1 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
      {t.brandName} Terms of Use
    </h1>
    <p class="mt-3 text-sm text-fg-muted">
      Version <span class="font-mono">{t.version}</span>
      {#if t.operator}· operated by {t.operator}{/if}
      {#if t.contactEmail}· <a class="link" href={`mailto:${t.contactEmail}`}>{t.contactEmail}</a>{/if}
    </p>
  </header>

  <article class="space-y-10 text-sm leading-relaxed text-fg-muted">
    {#each t.sections as section}
      <section>
        <h2 class="mb-3 text-lg font-semibold text-fg">{section.heading}</h2>
        <div class="space-y-3">
          {#each section.body as paragraph}
            <p>{paragraph}</p>
          {/each}
        </div>
      </section>
    {/each}
  </article>

  <p class="mt-12 text-xs text-fg-dim">
    Open-QR is open source under the MIT license. Run your own instance:
    <a href="https://github.com/henrikogaard/open-qr" target="_blank" rel="noopener" class="link">source on GitHub</a>.
  </p>
</main>

<Footer />
