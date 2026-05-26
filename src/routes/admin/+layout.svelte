<script>
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  
  /** @type {{ user?: { id: number; email: string; isAdmin: boolean } | null }} */
  export let data;
  
  onMount(() => {
    if (!data.user?.isAdmin) {
      goto('/');
    }
  });
</script>

{#if data.user?.isAdmin}
  <slot />
{/if}
