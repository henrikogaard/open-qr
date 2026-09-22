<script>
  import { sha256Hex } from '$lib/sha256';

  let email = '';
  let website = ''; // honeypot — real users never see or fill this
  let loading = false;
  let solving = false;
  let error = '';

  /**
   * Solve the proof-of-work challenge: find n in [0, maxnumber) such that
   * sha256(salt + n) equals the challenge hash. ~500k hashes on average —
   * about a second of CPU in the browser, invisible to humans, but a real
   * per-attempt cost for scripts.
   */
  async function solveCaptcha() {
    const response = await fetch('/api/v1/auth/captcha');
    const result = await response.json();
    if (!result.success) throw new Error('Could not start verification');
    const { payload, salt, challenge, maxnumber } = result.data;

    for (let n = 0; n < maxnumber; n++) {
      if (sha256Hex(salt + n) === challenge) {
        return { payload, number: n };
      }
    }
    throw new Error('Could not verify — please try again');
  }

  async function sendOTP() {
    loading = true;
    solving = !website;
    error = '';

    try {
      const captcha = website ? null : await solveCaptcha();
      const response = await fetch('/api/v1/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, captcha, website })
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error?.message || result.message || 'Failed to send OTP');
      }

      window.location.href = `/verify-otp?email=${encodeURIComponent(email)}`;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to send OTP';
    } finally {
      loading = false;
      solving = false;
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

          <!-- Honeypot: hidden from humans, bait for form-filling bots. -->
          <input
            type="text"
            name="website"
            bind:value={website}
            tabindex="-1"
            autocomplete="off"
            aria-hidden="true"
            class="hidden"
          />

          {#if error}
            <div class="alert alert-danger">
              <span>{error}</span>
            </div>
          {/if}

          <button type="submit" disabled={loading || !email} class="btn-primary w-full">
            {solving ? 'Verifying you are human…' : loading ? 'Sending…' : 'Send code'}
          </button>
        </form>
      </div>

      <p class="mt-6 text-center text-xs text-fg-dim">
        By signing in you agree to host your own data. Open-QR doesn't.
      </p>
    </div>
  </div>
</div>
