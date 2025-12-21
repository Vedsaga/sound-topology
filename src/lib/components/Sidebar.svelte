<script lang="ts">
    import { Atom, Waves, Settings, HelpCircle } from "@lucide/svelte";

    // Props
    let { currentView = "phase-space" }: { currentView?: string } = $props();

    const navItems = [
        { id: "phase-space", label: "Phase Space", icon: Atom },
        { id: "waveform", label: "Waveform", icon: Waves, disabled: true },
    ];
</script>

<aside class="sidebar">
    <div class="logo">
        <Atom size={28} strokeWidth={1.5} />
        <span class="logo-text">Sound Topology</span>
    </div>

    <nav class="nav">
        {#each navItems as item}
            <button
                class="sidebar-item"
                class:active={currentView === item.id}
                disabled={item.disabled}
            >
                <svelte:component this={item.icon} size={20} />
                <span>{item.label}</span>
                {#if item.disabled}
                    <span class="coming-soon">Soon</span>
                {/if}
            </button>
        {/each}
    </nav>

    <div class="sidebar-footer">
        <button class="sidebar-item">
            <Settings size={20} />
            <span>Settings</span>
        </button>
        <button class="sidebar-item">
            <HelpCircle size={20} />
            <span>Help</span>
        </button>
    </div>
</aside>

<style>
    .sidebar {
        width: 220px;
        height: 100vh;
        display: flex;
        flex-direction: column;
        background: var(--color-card);
        border-right: 1px solid var(--color-border);
        padding: 1rem;
    }

    .logo {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.5rem 0.75rem;
        margin-bottom: 1.5rem;
        color: var(--color-foreground);
    }

    .logo-text {
        font-size: 1rem;
        font-weight: 600;
        letter-spacing: -0.01em;
    }

    .nav {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }

    .sidebar-item {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        width: 100%;
        padding: 0.625rem 0.75rem;
        border: none;
        border-radius: var(--radius-md);
        background: transparent;
        color: var(--color-muted-foreground);
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
        transition: all var(--transition-fast);
        text-align: left;
    }

    .sidebar-item:hover:not(:disabled) {
        background: var(--color-muted);
        color: var(--color-foreground);
    }

    .sidebar-item.active {
        background: color-mix(in srgb, var(--color-brand) 15%, transparent);
        color: var(--color-brand);
    }

    .sidebar-item:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .coming-soon {
        margin-left: auto;
        font-size: 0.625rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        padding: 0.125rem 0.375rem;
        background: var(--color-muted);
        border-radius: var(--radius-full);
        color: var(--color-muted-foreground);
    }

    .sidebar-footer {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        padding-top: 1rem;
        border-top: 1px solid var(--color-border);
        margin-top: 1rem;
    }
</style>
