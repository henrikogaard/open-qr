<script>
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  
  /** @type {{ user?: { id: number; email: string; isAdmin: boolean } | null }} */
  export let data;
  
  onMount(() => {
    if (!data.user) {
      goto('/login');
    }
  });
</script>

{#if data.user}
  <slot />
{/if}
