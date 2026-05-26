<script>
  import QRGenerator from '$lib/components/QRGenerator.svelte';
  import Navbar from '$lib/components/Navbar.svelte';
  import Footer from '$lib/components/Footer.svelte';

  /** @type {{ user?: { id: number; email: string; isAdmin: boolean; termsAcceptedVersion?: string | null } | null; termsVersion?: string }} */
  export let data;

  const features = [
    {
      title: 'Custom styling',
      desc: 'Foreground & background colors, border treatments, templates, and a 10-character center overlay.',
      icon: 'palette'
    },
    {
      title: 'Two output formats',
      desc: 'Download crisp PNG bitmaps or scalable SVG vectors. Pick the right format for print or web.',
      icon: 'download'
    },
    {
      title: 'Password-protected codes',
      desc: 'Require a password before the redirect resolves. Hashed server-side, never stored in plain text.',
      icon: 'lock'
    },
    {
      title: 'Expiration dates',
      desc: 'Schedule QR codes to deactivate automatically. Run a campaign without manual cleanup.',
      icon: 'clock'
    },
    {
      title: 'Scan analytics',
      desc: 'Count scans, country (from your reverse-proxy header), and device class — no fingerprinting, no trackers.',
      icon: 'chart'
    },
    {
      title: 'API + bulk import',
      desc: 'A clean REST API and CSV upload for generating many codes at once. Issue per-user API keys.',
      icon: 'terminal'
    }
  ];

  const steps = [
    { num: '01', title: 'Paste a URL', desc: 'Drop any destination — link, login page, Wi-Fi voucher, payment flow.' },
    { num: '02', title: 'Style and configure', desc: 'Pick colors, a template, optional center text, expiry and password.' },
    { num: '03', title: 'Share or print', desc: 'Download PNG/SVG, copy the short URL, or embed via the API.' }
  ];

  const privacyYes = [
    'Total scan count per QR code',
    'Country code from your reverse-proxy header (Cloudflare, Vercel, Fly, etc.), if present',
    'A SHA-256 hash of the visitor IP — the raw IP is never stored',
    'Device class (mobile / tablet / desktop / bot) derived from User-Agent before it is hashed',
    'Authentication session cookies — only if you log in'
  ];
  const privacyNo = [
    'Raw IP addresses or full request fingerprints',
    'Third-party trackers, pixels, or analytics SDKs',
    'Personal data brokers or ad networks of any kind',
    'Cross-site cookies, localStorage profiling, or telemetry'
  ];

  const apiSnippet = `curl -X POST https://your-host/api/v1/qr \\
  -H "Authorization: Bearer $OPENQR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "targetUrl": "https://example.com",
    "style": { "template": "minimal", "errorCorrection": "M" }
  }'`;
</script>

<svelte:head>
  <title>Open-QR — Self-hosted QR generator</title>
</svelte:head>

<Navbar user={data?.user} />

<!-- Hero ------------------------------------------------------------------ -->
<section class="relative overflow-hidden border-b border-border">
  <div
    class="pointer-events-none absolute inset-0 opacity-[0.35] dark:opacity-[0.18]"
    aria-hidden="true"
    style="background-image: linear-gradient(rgb(var(--border-strong) / 0.18) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--border-strong) / 0.18) 1px, transparent 1px); background-size: 32px 32px; mask-image: radial-gradient(ellipse at top, black, transparent 70%);"
  ></div>

  <div class="relative mx-auto max-w-7xl px-4 pt-20 pb-16 sm:px-6 lg:px-8 lg:pt-28">
    <div class="mx-auto max-w-3xl text-center">
      <p class="eyebrow">v1.0 · MIT licensed · self-hosted</p>
      <h1 class="mt-4 text-4xl font-semibold tracking-tight text-fg sm:text-5xl lg:text-6xl">
        QR codes that
        <span class="text-accent">stay yours.</span>
      </h1>
      <p class="mx-auto mt-5 max-w-2xl text-lg text-fg-muted">
        A self-hosted, open-source QR generator with optional auth, scan analytics,
        and admin controls. No SaaS account, no trackers, no third parties — ever.
      </p>
      <div class="mt-8 flex flex-wrap items-center justify-center gap-3">
        <a href="#generate" class="btn-primary btn-lg">Create a QR code</a>
        <a href="https://github.com/henrikogaard/open-qr" target="_blank" rel="noopener" class="btn-secondary btn-lg">
          View on GitHub
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M7 17 17 7M9 7h8v8" />
          </svg>
        </a>
      </div>

      <div class="mt-8 flex flex-wrap items-center justify-center gap-2 text-xs text-fg-dim">
        <span class="badge badge-neutral font-mono">docker compose up</span>
        <span class="hidden sm:inline">·</span>
        <span class="badge badge-neutral font-mono">single container</span>
        <span class="hidden sm:inline">·</span>
        <span class="badge badge-neutral font-mono">SQLite-backed</span>
      </div>
    </div>
  </div>
</section>

<!-- Generator ------------------------------------------------------------- -->
<section id="generate" class="border-b border-border bg-bg-soft">
  <div class="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
    <div class="mb-10 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <p class="eyebrow">Generate</p>
        <h2 class="mt-2 text-3xl font-semibold tracking-tight text-fg">Build one now.</h2>
        <p class="mt-2 max-w-xl text-fg-muted">
          No sign-up required — anonymous codes are enabled by default. Sign in to manage and edit them later.
        </p>
      </div>
      {#if !data?.user}
        <a href="/login" class="btn-ghost">Have an account? Sign in →</a>
      {/if}
    </div>

    <QRGenerator user={data?.user} termsVersion={data?.termsVersion ?? ''} />
  </div>
</section>

<!-- Features -------------------------------------------------------------- -->
<section id="features" class="border-b border-border">
  <div class="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
    <div class="max-w-2xl">
      <p class="eyebrow">Features</p>
      <h2 class="mt-2 text-3xl font-semibold tracking-tight text-fg">
        Everything a serious QR workflow needs.
      </h2>
      <p class="mt-3 text-fg-muted">
        Built for teams that print, share, and track real-world links — and want the
        whole stack under their own control.
      </p>
    </div>

    <div class="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {#each features as f}
        <div class="card transition-colors hover:border-border-strong">
          <div class="mb-4 grid h-9 w-9 place-items-center rounded-md bg-accent/15 text-accent">
            {#if f.icon === 'palette'}
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2a10 10 0 1 0 0 20 5 5 0 0 0 0-10h-1a3 3 0 0 1 0-6h1a4 4 0 0 0 0-4z"/></svg>
            {:else if f.icon === 'download'}
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
            {:else if f.icon === 'lock'}
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            {:else if f.icon === 'clock'}
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
            {:else if f.icon === 'chart'}
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/></svg>
            {:else}
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 17l6-6-6-6"/><path d="M12 19h8"/></svg>
            {/if}
          </div>
          <h3 class="text-base font-semibold text-fg">{f.title}</h3>
          <p class="mt-1.5 text-sm text-fg-muted">{f.desc}</p>
        </div>
      {/each}
    </div>
  </div>
</section>

<!-- How it works ---------------------------------------------------------- -->
<section class="border-b border-border bg-bg-soft">
  <div class="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
    <div class="max-w-2xl">
      <p class="eyebrow">How it works</p>
      <h2 class="mt-2 text-3xl font-semibold tracking-tight text-fg">
        Three steps, no surprises.
      </h2>
    </div>

    <ol class="mt-12 grid gap-6 md:grid-cols-3">
      {#each steps as step}
        <li class="card">
          <p class="font-mono text-sm text-accent">{step.num}</p>
          <h3 class="mt-3 text-lg font-semibold text-fg">{step.title}</h3>
          <p class="mt-2 text-sm text-fg-muted">{step.desc}</p>
        </li>
      {/each}
    </ol>
  </div>
</section>

<!-- Privacy --------------------------------------------------------------- -->
<section id="privacy" class="border-b border-border">
  <div class="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
    <div class="grid gap-12 lg:grid-cols-2">
      <div>
        <p class="eyebrow">Privacy & tracking</p>
        <h2 class="mt-2 text-3xl font-semibold tracking-tight text-fg">
          Privacy by default, not by promise.
        </h2>
        <p class="mt-4 text-fg-muted">
          Open-QR is engineered so there is nothing for us to leak — because there is no us.
          You run it. Raw identifiers are never persisted; sessions are HTTP-only and scoped
          to the auth path; tracking pixels and third-party scripts simply do not exist in
          the codebase.
        </p>
        <p class="mt-4 text-fg-muted">
          The full source is on GitHub under the MIT license. Audit it, fork it, deploy it.
        </p>
      </div>

      <div class="grid gap-6 sm:grid-cols-2">
        <div class="card">
          <div class="flex items-center gap-2">
            <span class="grid h-6 w-6 place-items-center rounded-full bg-success/15 text-success">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
            </span>
            <h3 class="text-base font-semibold text-fg">What is collected</h3>
          </div>
          <ul class="mt-4 space-y-2 text-sm text-fg-muted">
            {#each privacyYes as item}
              <li class="flex gap-2">
                <span class="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-success" aria-hidden="true"></span>
                <span>{item}</span>
              </li>
            {/each}
          </ul>
        </div>

        <div class="card">
          <div class="flex items-center gap-2">
            <span class="grid h-6 w-6 place-items-center rounded-full bg-danger/15 text-danger">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </span>
            <h3 class="text-base font-semibold text-fg">What is never collected</h3>
          </div>
          <ul class="mt-4 space-y-2 text-sm text-fg-muted">
            {#each privacyNo as item}
              <li class="flex gap-2">
                <span class="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-danger" aria-hidden="true"></span>
                <span>{item}</span>
              </li>
            {/each}
          </ul>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- API teaser ------------------------------------------------------------ -->
<section id="api" class="border-b border-border bg-bg-soft">
  <div class="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
    <div class="grid gap-10 lg:grid-cols-2 lg:items-center">
      <div>
        <p class="eyebrow">Developer API</p>
        <h2 class="mt-2 text-3xl font-semibold tracking-tight text-fg">
          A clean REST API, on your own domain.
        </h2>
        <p class="mt-4 text-fg-muted">
          Issue per-user API keys from the dashboard, point your tooling at your own host,
          and integrate QR generation into anything — CI/CD, print pipelines, kiosk apps.
        </p>
        <div class="mt-6 flex flex-wrap gap-3">
          <a href="https://github.com/henrikogaard/open-qr" target="_blank" rel="noopener" class="btn-secondary">Read the API docs</a>
          <a href="/dashboard" class="btn-ghost">Generate an API key →</a>
        </div>
      </div>

      <div class="card-flush overflow-hidden">
        <div class="flex items-center justify-between border-b border-border px-4 py-2.5">
          <div class="flex items-center gap-1.5">
            <span class="h-2.5 w-2.5 rounded-full bg-danger/70"></span>
            <span class="h-2.5 w-2.5 rounded-full bg-warning/70"></span>
            <span class="h-2.5 w-2.5 rounded-full bg-success/70"></span>
          </div>
          <span class="font-mono text-xs text-fg-dim">POST /api/v1/qr</span>
        </div>
        <pre class="overflow-x-auto bg-bg-soft p-4 font-mono text-xs leading-relaxed text-fg"><code>{apiSnippet}</code></pre>
      </div>
    </div>
  </div>
</section>

<!-- Self-host CTA --------------------------------------------------------- -->
<section class="border-b border-border">
  <div class="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6 lg:px-8">
    <p class="eyebrow">Self-host</p>
    <h2 class="mt-2 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
      One container. Your server. Done.
    </h2>
    <p class="mt-4 text-fg-muted">
      Open-QR ships as a single Docker image with embedded SQLite. Bring your own SMTP for
      email OTP, or run it fully anonymous. There's nothing else to set up.
    </p>

    <div class="mt-6 inline-flex items-center gap-2 rounded-md border border-border-strong bg-surface px-4 py-2 font-mono text-sm text-fg">
      <span class="text-fg-dim">$</span>
      <span>docker compose up -d</span>
    </div>
  </div>
</section>

<Footer />
