<script>
  import Navbar from '$lib/components/Navbar.svelte';

  export let data;
  export let form;
</script>

<svelte:head>
  <title>Report QR — Open-QR</title>
</svelte:head>

<Navbar user={null} />

<main class="mx-auto grid min-h-[70vh] max-w-xl place-items-center px-4 py-12">
  <section class="card w-full p-8">
    <p class="eyebrow">Abuse report</p>
    <h1 class="mt-2 text-2xl font-semibold tracking-tight text-fg">Report this QR code</h1>
    <p class="mt-2 text-sm text-fg-muted">
      Report <span class="font-mono">/go/{data.shortCode}</span>{#if data.targetHost} pointing to <span class="font-mono">{data.targetHost}</span>{/if}.
    </p>

    {#if form?.success}
      <div class="alert alert-success mt-6">Thanks. The operator can review this report from the admin panel.</div>
    {:else}
      <form method="POST" class="mt-6 space-y-4">
        <div>
          <label for="reason" class="field-label">Reason</label>
          <select id="reason" name="reason" required class="select">
            <option value="phishing">Phishing or impersonation</option>
            <option value="malware">Malware or exploit</option>
            <option value="fraud">Fraud or scam</option>
            <option value="illegal">Illegal content</option>
            <option value="other">Other abuse</option>
          </select>
        </div>
        <div>
          <label for="details" class="field-label">Details</label>
          <textarea id="details" name="details" rows="4" class="input min-h-28" placeholder="What did you see?"></textarea>
        </div>
        <div>
          <label for="email" class="field-label">Email <span class="text-fg-dim font-normal">(optional)</span></label>
          <input id="email" name="email" type="email" class="input" />
        </div>
        {#if form?.error}
          <div class="alert alert-danger">{form.error}</div>
        {/if}
        <button class="btn-primary w-full">Submit report</button>
      </form>
    {/if}
  </section>
</main>
