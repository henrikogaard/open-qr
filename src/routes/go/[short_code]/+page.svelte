<script lang="ts">
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  function focusOnMount(node: HTMLInputElement) {
    node.focus();
  }
</script>

<main class="min-h-screen bg-bg flex items-center justify-center px-4 py-12">
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

    <form method="GET" class="space-y-4">
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

      {#if data.invalidPassword}
        <div class="alert alert-danger">
          <span>Incorrect password.</span>
        </div>
      {/if}

      <button type="submit" class="btn-primary w-full">Continue</button>
    </form>
  </section>
</main>
