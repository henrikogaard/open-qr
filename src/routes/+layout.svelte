<script>
  import '../styles/app.css';
  import ConfirmHost from '$lib/components/ConfirmHost.svelte';
  import { afterNavigate } from '$app/navigation';
  import { page } from '$app/stores';
  import { publicPageview } from '$lib/public-analytics';

  afterNavigate(() => {
    const event = publicPageview({
      ...$page.data.plausible,
      url: $page.url,
      authenticated: !!$page.data.user,
      dnt: navigator.doNotTrack,
      gpc: navigator.globalPrivacyControl === true
    });
    if (!event) return;
    void fetch(event.endpoint, {
      method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer', keepalive: true,
      headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(event.body)
    }).catch(() => {});
  });
</script>

<div class="min-h-screen bg-bg text-fg antialiased">
  <slot />
</div>

<ConfirmHost />
