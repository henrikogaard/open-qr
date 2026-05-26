<script>
  let email = '';
  let loading = false;
  let error = '';
  let sent = false;
  
  async function sendOTP() {
    loading = true;
    error = '';
    
    try {
      const response = await fetch('/api/v1/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to send OTP');
      }
      
      sent = true;
      window.location.href = `/verify-otp?email=${encodeURIComponent(email)}`;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to send OTP';
    } finally {
      loading = false;
    }
  }
</script>

<div class="min-h-screen bg-bg flex flex-col">
  <div class="flex flex-1 items-center justify-center px-4 py-12">
    <div class="w-full max-w-md">
      <a href="/" class="mx-auto mb-8 flex w-fit items-center gap-2.5">
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
        <div class="mb-6">
          <h1 class="text-2xl font-semibold text-fg">Sign in</h1>
          <p class="mt-1.5 text-sm text-fg-muted">Enter your email to receive a one-time code.</p>
        </div>

        <form on:submit|preventDefault={sendOTP} class="space-y-5">
          <div>
            <label for="email" class="field-label">Email address</label>
            <input
              id="email"
              type="email"
              bind:value={email}
              required
              autocomplete="email"
              placeholder="you@example.com"
              class="input"
            />
          </div>

          {#if error}
            <div class="alert alert-danger">
              <span>{error}</span>
            </div>
          {/if}

          <button type="submit" disabled={loading || !email} class="btn-primary w-full">
            {loading ? 'Sending…' : 'Send code'}
          </button>
        </form>
      </div>

      <p class="mt-6 text-center text-xs text-fg-dim">
        By signing in you agree to host your own data. Open-QR doesn't.
      </p>
    </div>
  </div>
</div>
