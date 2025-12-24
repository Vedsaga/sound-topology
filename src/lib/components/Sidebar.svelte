<script lang="ts">
    import {
        Atom,
        Waves,
        Settings,
        HelpCircle,
        PanelLeftClose,
        PanelLeft,
        FlaskConical,
    } from "@lucide/svelte";

    // Props
    let {
        currentView = "phase-space",
        collapsed = false,
        onCollapseChange,
    }: {
        currentView?: string;
        collapsed?: boolean;
        onCollapseChange?: (collapsed: boolean) => void;
    } = $props();

    // Local collapse state - synced from prop
    let isCollapsed = $state(false);

    // Sync from prop when it changes
    $effect(() => {
        isCollapsed = collapsed;
    });

    function toggleCollapse() {
        isCollapsed = !isCollapsed;
        onCollapseChange?.(isCollapsed);
    }

    const navItems = [
        { id: "phase-space", label: "Phase Space", icon: Atom, href: "/" },
        { id: "validation", label: "Validation", icon: FlaskConical, href: "/validation" },
        { id: "waveform", label: "Waveform", icon: Waves, disabled: true },
    ];
</script>

<aside class="sidebar" class:collapsed={isCollapsed}>
    <!-- Logo / Brand -->
    <div class="logo">
        <Atom size={24} strokeWidth={1.5} />
        {#if !isCollapsed}
            <span class="logo-text">Sound Topology</span>
        {/if}
    </div>

    <!-- Collapse toggle -->
    <button
        class="collapse-btn"
        onclick={toggleCollapse}
        title={isCollapsed ? "Expand" : "Collapse"}
    >
        {#if isCollapsed}
            <PanelLeft size={18} />
        {:else}
            <PanelLeftClose size={18} />
        {/if}
    </button>

    <!-- Navigation -->
    <nav class="nav">
        {#each navItems as item}
            {@const Icon = item.icon}
            {#if item.href && !item.disabled}
                <a
                    href={item.href}
                    class="sidebar-item"
                    class:active={currentView === item.id}
                    title={isCollapsed ? item.label : undefined}
                >
                    <Icon size={20} />
                    {#if !isCollapsed}
                        <span>{item.label}</span>
                    {/if}
                </a>
            {:else}
                <button
                    class="sidebar-item"
                    class:active={currentView === item.id}
                    disabled={item.disabled}
                    title={isCollapsed ? item.label : undefined}
                >
                    <Icon size={20} />
                    {#if !isCollapsed}
                        <span>{item.label}</span>
                        {#if item.disabled}
                            <span class="coming-soon">Soon</span>
                        {/if}
                    {/if}
                </button>
            {/if}
        {/each}
    </nav>

    <!-- Footer -->
    <div class="sidebar-footer">
        <button
            class="sidebar-item"
            title={isCollapsed ? "Settings" : undefined}
        >
            <Settings size={20} />
            {#if !isCollapsed}<span>Settings</span>{/if}
        </button>
        <button class="sidebar-item" title={isCollapsed ? "Help" : undefined}>
            <HelpCircle size={20} />
            {#if !isCollapsed}<span>Help</span>{/if}
        </button>
    </div>
</aside>

<style>
    .sidebar {
        width: 200px;
        height: 100vh;
        display: flex;
        flex-direction: column;
        background: var(--color-card);
        border-right: 1px solid var(--color-border);
        padding: 0.75rem;
        transition: width 0.2s ease;
        flex-shrink: 0;
    }

    .sidebar.collapsed {
        width: 56px;
    }

    .logo {
        display: flex;
        align-items: center;
        gap: 0.625rem;
        padding: 0.5rem;
        margin-bottom: 0.5rem;
        color: var(--color-foreground);
        min-height: 40px;
    }

    .logo-text {
        font-size: 0.875rem;
        font-weight: 600;
        letter-spacing: -0.01em;
        white-space: nowrap;
        overflow: hidden;
    }

    .collapse-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        padding: 0.5rem;
        border: none;
        border-radius: var(--radius-sm);
        background: transparent;
        color: var(--color-muted-foreground);
        cursor: pointer;
        transition: all 0.15s ease;
        margin-bottom: 0.5rem;
    }

    .collapse-btn:hover {
        background: var(--color-muted);
        color: var(--color-foreground);
    }

    .sidebar.collapsed .collapse-btn {
        justify-content: center;
    }

    .nav {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        overflow-y: auto;
    }

    .sidebar-item {
        display: flex;
        align-items: center;
        gap: 0.625rem;
        width: 100%;
        padding: 0.5rem;
        border: none;
        border-radius: var(--radius-md);
        background: transparent;
        color: var(--color-muted-foreground);
        font-size: 0.8125rem;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s ease;
        text-align: left;
        white-space: nowrap;
        text-decoration: none;
    }

    a.sidebar-item {
        cursor: pointer;
    }

    .sidebar.collapsed .sidebar-item {
        justify-content: center;
        padding: 0.625rem;
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
        font-size: 0.5625rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        padding: 0.125rem 0.25rem;
        background: var(--color-muted);
        border-radius: var(--radius-full);
        color: var(--color-muted-foreground);
    }

    .sidebar-footer {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        padding-top: 0.75rem;
        border-top: 1px solid var(--color-border);
        margin-top: 0.5rem;
    }
</style>
