<script lang="ts">
  import type { PageData } from './$types';
  import type { ActionData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  function focusOnMount(node: HTMLInputElement) {
    node.focus();
  }

  const staticLabels: Record<string, string> = {
    text: 'Plain text',
    wifi: 'Wi-Fi network',
    vcard: 'Contact card',
    event: 'Calendar event',
    email: 'Email',
    sms: 'SMS',
    geo: 'Location'
  };
</script>

<main class="min-h-screen bg-bg flex items-center justify-center px-4 py-12">
  {#if data.interstitial}
  <section class="w-full max-w-lg card p-8">
    <div class="mb-6">
      <p class="eyebrow">Leaving Open-QR</p>
      <h1 class="mt-2 text-2xl font-semibold text-fg">Continue to destination?</h1>
      <p class="mt-2 text-sm text-fg-muted">This QR code points to:</p>
      <p class="mt-3 break-all rounded-md border border-border bg-bg-soft px-3 py-2 font-mono text-sm text-fg">{data.targetHost}</p>
    </div>
    <div class="flex flex-col gap-2 sm:flex-row">
      <a href={data.continueHref} class="btn-primary flex-1 justify-center">Continue</a>
      <a href={`/report/${data.shortCode}`} class="btn-secondary flex-1 justify-center">Report QR</a>
    </div>
  </section>
  {:else if data.staticContent}
  <section class="w-full max-w-lg card p-8">
    <div class="mb-6">
      <p class="eyebrow">Static QR code</p>
      <h1 class="mt-2 text-2xl font-semibold text-fg">{staticLabels[data.staticKind] ?? 'Content'}</h1>
      <p class="mt-2 text-sm text-fg-muted">
        This QR encodes its content directly — scanning it opens this on the phone
        without passing through this server. This page is just what the code contains.
      </p>
    </div>
    <pre class="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-md border border-border bg-bg-soft px-3 py-2 font-mono text-xs leading-relaxed text-fg">{data.staticContent}</pre>
  </section>
  {:else}
  <section class="w-full max-w-sm card p-8">
    <div class="mb-6 flex items-center gap-3">
      <span class="grid h-10 w-10 place-items-center rounded-md bg-accent/15 text-accent">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="3" y="11" width="18" height="11" rx="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
      </span>
      <div>
        <h1 class="text-lg font-semibold text-fg">Protected link</h1>
        <p class="text-xs text-fg-dim font-mono">Enter password to continue</p>
      </div>
    </div>

    <form method="POST" action="?/password" class="space-y-4">
      <div>
        <label for="qr-password" class="field-label">Password</label>
        <input
          id="qr-password"
          name="password"
          type="password"
          required
          class="input"
          use:focusOnMount
        />
      </div>

      {#if form?.throttled}
        <div class="alert alert-warning">
          <span>Too many attempts — wait a few minutes and try again.</span>
        </div>
      {:else if form?.invalid}
        <div class="alert alert-danger">
          <span>Incorrect password.</span>
        </div>
      {/if}

      <button type="submit" class="btn-primary w-full">Continue</button>
    </form>
  </section>
  {/if}
</main>
