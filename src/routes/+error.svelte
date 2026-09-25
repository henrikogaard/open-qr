<script>
  import { page } from '$app/stores';

  $: status = $page.status;
  $: isGoPage = $page.url.pathname.startsWith('/go/');
  // /go/<code> paths carry the short code in the second segment.
  $: shortCode = isGoPage ? $page.url.pathname.split('/')[2] || '' : '';

  // Scanner-facing states get dedicated copy — /go/* is the highest-traffic
  // page in the product and the trust moment for "this code is broken".
  $: view = (() => {
    if (isGoPage && status === 410) {
      return {
        title: 'This QR code has expired',
        body: 'The owner set an expiry date and it has passed. Nothing is wrong with your phone or the app you scanned with.'
      };
    }
    if (isGoPage && status === 403) {
      return {
        title: 'This QR code is switched off',
        body: 'The owner has disabled it. If you expected it to work, contact whoever printed or shared the code.'
      };
    }
    if (isGoPage && status === 404) {
      return {
        title: 'This QR code doesn\u2019t exist',
        body: 'It may have been deleted, or the printed link was damaged or mistyped. If the code looked suspicious, please report it.'
      };
    }
    if (status === 404) {
      return {
        title: 'Page not found',
        body: `The page ${$page.url.pathname} doesn\u2019t exist.`
      };
    }
    if (status >= 500) {
      return {
        title: 'Something went wrong',
        body: 'An unexpected error occurred on the server. Try again in a moment — if it persists, contact the operator of this instance.'
      };
    }
    return {
      title: `Error ${status}`,
      body: $page.error?.message || 'An unexpected error occurred.'
    };
  })();
</script>

<svelte:head>
  <title>{view.title} — Open-QR</title>
</svelte:head>

<main class="flex min-h-screen items-center justify-center bg-bg px-4 py-12">
  <section class="w-full max-w-md text-center">
    <a href="/" class="mx-auto mb-8 flex w-fit items-center gap-2.5" aria-label="Open-QR home">
      <span class="grid h-9 w-9 place-items-center rounded-md bg-accent text-accent-fg">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
          <path d="M3 3h7v7H3V3zm2 2v3h3V5H5zm9-2h7v7h-7V3zm2 2v3h3V5h-3zM3 14h7v7H3v-7zm2 2v3h3v-3H5zm9-2h2v2h-2v-2zm4 0h3v2h-2v1h-1v-3zm-4 4h2v3h-2v-3zm4 1h3v2h-3v-2zm-2-1h2v2h-2v-2z"/>
        </svg>
      </span>
      <span class="text-base font-semibold tracking-tight text-fg">
        Open<span class="text-accent">·</span>QR
      </span>
    </a>

    <div class="card p-8">
      <p class="font-mono text-xs text-fg-dim">{status}</p>
      <h1 class="mt-2 text-2xl font-semibold tracking-tight text-fg">{view.title}</h1>
      <p class="mt-3 text-sm text-fg-muted">{view.body}</p>

      <div class="mt-6 flex flex-col gap-2 sm:flex-row">
        <a href="/" class="btn-primary flex-1 justify-center">Go to homepage</a>
        {#if isGoPage && shortCode}
          <a href={`/report/${shortCode}`} class="btn-secondary flex-1 justify-center">Report this QR</a>
        {/if}
      </div>
    </div>
  </section>
</main>
