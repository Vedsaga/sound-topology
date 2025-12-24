<script lang="ts">
    import { browser } from '$app/environment';
    import Sidebar from '$lib/components/Sidebar.svelte';
    import FormantValidation from '$lib/components/FormantValidation.svelte';
</script>

<svelte:head>
    <title>Formant Validation - Sound Topology</title>
</svelte:head>

<div class="app-layout">
    <Sidebar currentView="validation" />
    
    <main class="main-content">
        <div class="validation-container">
            {#if browser}
                <FormantValidation />
            {:else}
                <p>Loading...</p>
            {/if}
        </div>
    </main>
</div>

<style>
    .app-layout {
        display: flex;
        height: 100vh;
        overflow: hidden;
        background: var(--color-background);
    }

    .main-content {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }

    .validation-container {
        flex: 1;
        overflow-y: auto;
        padding: 2rem;
    }
</style>
