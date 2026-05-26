<script>
  import '../styles/app.css';

  export let data;
</script>

<svelte:head>
  {#if data.plausible?.enabled}
    <script defer data-domain={data.plausible.domain} src={data.plausible.scriptSrc}></script>
  {/if}
</svelte:head>

<div class="min-h-screen bg-bg text-fg antialiased">
  <slot />
</div>
