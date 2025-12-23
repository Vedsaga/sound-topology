<script lang="ts">
    import type { ProcessingMode } from "$lib/audioLibraryTypes";
    import * as Collapsible from "$lib/components/ui/collapsible";

    // Props
    let {
        tau = 12,
        computedTau = 12,
        smoothing = 3,
        normalize = true,
        showPath = true,
        preprocess = true,
        autoTau = true,
        pcaAlign = true,
        xrayMode = true,
        opacity = 0.15,
        processingMode = "lissajous-manifold" as ProcessingMode,
        windowMs = 25,
        formantFrequencies = null as [number, number, number] | null,
        onTauChange,
        onSmoothingChange,
        onNormalizeChange,
        onShowPathChange,
        onPreprocessChange,
        onAutoTauChange,
        onPcaAlignChange,
        onXrayModeChange,
        onOpacityChange,
        onProcessingModeChange,
        onWindowMsChange,
        pointCount = 0,
        duration = 0,
    }: {
        tau: number;
        computedTau: number;
        smoothing: number;
        normalize: boolean;
        showPath: boolean;
        preprocess: boolean;
        autoTau: boolean;
        pcaAlign: boolean;
        xrayMode: boolean;
        opacity: number;
        processingMode: ProcessingMode;
        windowMs: number;
        formantFrequencies: [number, number, number] | null;
        onTauChange: (value: number) => void;
        onSmoothingChange: (value: number) => void;
        onNormalizeChange: (value: boolean) => void;
        onShowPathChange: (value: boolean) => void;
        onPreprocessChange: (value: boolean) => void;
        onAutoTauChange: (value: boolean) => void;
        onPcaAlignChange: (value: boolean) => void;
        onXrayModeChange: (value: boolean) => void;
        onOpacityChange: (value: number) => void;
        onProcessingModeChange: (value: ProcessingMode) => void;
        onWindowMsChange: (value: number) => void;
        pointCount?: number;
        duration?: number;
    } = $props();

    let isSpectralMode = $derived(
        processingMode === "lissajous" ||
            processingMode === "cymatics" ||
            processingMode === "lissajous-manifold" ||
            processingMode === "lpc-vowel-space",
    );

    let advancedOpen = $state(false);
</script>

<div class="control-panel">
    <!-- Processing Mode Selector -->
    <section class="section">
        <h3 class="section-title">Mode</h3>
        <div class="toggle-group">
            <button
                class="toggle-item"
                class:active={processingMode === "signal-dynamics"}
                onclick={() => onProcessingModeChange("signal-dynamics")}
            >
                Signal
            </button>
            <button
                class="toggle-item"
                class:active={processingMode === "lissajous"}
                onclick={() => onProcessingModeChange("lissajous")}
            >
                Lissajous
            </button>
            <button
                class="toggle-item featured"
                class:active={processingMode === "lissajous-manifold"}
                onclick={() => onProcessingModeChange("lissajous-manifold")}
                title="Time-stacked topology - reveals vowel identity"
            >
                Manifold
            </button>
            <button
                class="toggle-item"
                class:active={processingMode === "cymatics"}
                onclick={() => onProcessingModeChange("cymatics")}
            >
                Cymatics
            </button>
            <button
                class="toggle-item scientific"
                class:active={processingMode === "lpc-vowel-space"}
                onclick={() => onProcessingModeChange("lpc-vowel-space")}
                title="LPC formant extraction - scientific-grade (Bark scale)"
            >
                LPC
            </button>
        </div>
    </section>

    <!-- Formant Display (for spectral modes) -->
    {#if isSpectralMode && formantFrequencies}
        <section class="section formant-section">
            <div class="formant-bars">
                <div
                    class="formant-bar"
                    style="--height: {Math.min(
                        (formantFrequencies[0] / 800) * 100,
                        100,
                    )}%"
                >
                    <span class="formant-label">F1</span>
                    <span class="formant-value"
                        >{formantFrequencies[0].toFixed(0)}</span
                    >
                </div>
                <div
                    class="formant-bar"
                    style="--height: {Math.min(
                        (formantFrequencies[1] / 2500) * 100,
                        100,
                    )}%"
                >
                    <span class="formant-label">F2</span>
                    <span class="formant-value"
                        >{formantFrequencies[1].toFixed(0)}</span
                    >
                </div>
                <div
                    class="formant-bar"
                    style="--height: {Math.min(
                        (formantFrequencies[2] / 3500) * 100,
                        100,
                    )}%"
                >
                    <span class="formant-label">F3</span>
                    <span class="formant-value"
                        >{formantFrequencies[2].toFixed(0)}</span
                    >
                </div>
            </div>
        </section>
    {/if}

    <!-- Display Settings -->
    <section class="section">
        <div class="display-row">
            <div class="switch-row">
                <span class="switch-label">X-ray</span>
                <button
                    class="switch-toggle"
                    class:on={xrayMode}
                    onclick={() => onXrayModeChange(!xrayMode)}
                    role="switch"
                    aria-checked={xrayMode}
                >
                    <span class="switch-thumb"></span>
                </button>
            </div>
            {#if xrayMode}
                <div class="opacity-control">
                    <input
                        type="range"
                        class="opacity-slider"
                        min="0.02"
                        max="0.3"
                        step="0.01"
                        value={opacity}
                        oninput={(e) =>
                            onOpacityChange(
                                parseFloat(
                                    (e.target as HTMLInputElement).value,
                                ),
                            )}
                    />
                </div>
            {/if}
        </div>

        <div class="checkboxes-row">
            <label class="checkbox-label">
                <input
                    type="checkbox"
                    checked={normalize}
                    onchange={(e) =>
                        onNormalizeChange(
                            (e.target as HTMLInputElement).checked,
                        )}
                />
                Normalize
            </label>
            <label class="checkbox-label">
                <input
                    type="checkbox"
                    checked={showPath}
                    onchange={(e) =>
                        onShowPathChange(
                            (e.target as HTMLInputElement).checked,
                        )}
                />
                Path
            </label>
        </div>
    </section>

    <!-- Stats Badges -->
    <section class="section stats-section">
        <span class="stat-badge">{pointCount.toLocaleString()} pts</span>
        <span class="stat-badge">{duration.toFixed(2)}s</span>
    </section>

    <!-- Advanced Settings (Collapsible) -->
    <Collapsible.Root bind:open={advancedOpen}>
        <Collapsible.Trigger class="advanced-trigger">
            <span>Advanced</span>
            <span class="trigger-icon" class:open={advancedOpen}>▾</span>
        </Collapsible.Trigger>
        <Collapsible.Content class="advanced-content">
            {#if isSpectralMode}
                <!-- Window slider for spectral modes -->
                <div class="control-row">
                    <span class="control-label">Window</span>
                    <input
                        type="range"
                        min="15"
                        max="50"
                        step="5"
                        value={windowMs}
                        oninput={(e) =>
                            onWindowMsChange(
                                parseInt((e.target as HTMLInputElement).value),
                            )}
                    />
                    <span class="control-value">{windowMs}ms</span>
                </div>
            {:else}
                <!-- Signal processing options -->
                <label class="checkbox-label full">
                    <input
                        type="checkbox"
                        checked={preprocess}
                        onchange={(e) =>
                            onPreprocessChange(
                                (e.target as HTMLInputElement).checked,
                            )}
                    />
                    Band-pass filter
                </label>
                <label class="checkbox-label full">
                    <input
                        type="checkbox"
                        checked={autoTau}
                        onchange={(e) =>
                            onAutoTauChange(
                                (e.target as HTMLInputElement).checked,
                            )}
                    />
                    Auto-τ
                </label>
                {#if !autoTau}
                    <div class="control-row">
                        <span class="control-label">τ</span>
                        <input
                            type="range"
                            min="1"
                            max="100"
                            value={tau}
                            oninput={(e) =>
                                onTauChange(
                                    parseInt(
                                        (e.target as HTMLInputElement).value,
                                    ),
                                )}
                        />
                        <span class="control-value">{tau}</span>
                    </div>
                {:else}
                    <div class="computed-tau">Computed τ: {computedTau}</div>
                {/if}
                <label class="checkbox-label full">
                    <input
                        type="checkbox"
                        checked={pcaAlign}
                        onchange={(e) =>
                            onPcaAlignChange(
                                (e.target as HTMLInputElement).checked,
                            )}
                    />
                    PCA align
                </label>
                <div class="control-row">
                    <span class="control-label">Smooth</span>
                    <input
                        type="range"
                        min="1"
                        max="15"
                        value={smoothing}
                        oninput={(e) =>
                            onSmoothingChange(
                                parseInt((e.target as HTMLInputElement).value),
                            )}
                    />
                    <span class="control-value">{smoothing}</span>
                </div>
            {/if}
        </Collapsible.Content>
    </Collapsible.Root>
</div>

<style>
    .control-panel {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        padding: 1rem;
        background: var(--card);
        border-radius: var(--radius-lg);
        border: 1px solid var(--border);
        font-size: 0.875rem;
    }

    .section {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    .section-title {
        font-size: 0.75rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--muted-foreground);
        margin: 0;
    }

    /* Toggle Group */
    .toggle-group {
        display: flex;
        flex-wrap: wrap;
        gap: 2px;
        border-radius: var(--radius-md);
        border: 1px solid var(--border);
    }

    .toggle-item {
        flex: 1;
        min-width: 3.5rem;
        padding: 0.5rem 0.35rem;
        font-size: 0.7rem;
        font-weight: 500;
        background: var(--muted);
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        color: var(--muted-foreground);
        cursor: pointer;
        transition: all 0.15s ease;
    }

    .toggle-item:hover {
        background: var(--accent);
        color: var(--accent-foreground);
    }

    .toggle-item.active {
        background: var(--primary);
        color: var(--primary-foreground);
    }

    .toggle-item.featured.active {
        background: var(--amber);
        color: var(--amber-foreground);
    }

    .toggle-item.scientific.active {
        background: oklch(0.65 0.18 250); /* Scientific blue */
        color: white;
    }

    /* Formant bars visualization */
    .formant-section {
        padding: 0.5rem 0;
    }

    .formant-bars {
        display: flex;
        gap: 0.75rem;
        height: 3rem;
        align-items: flex-end;
    }

    .formant-bar {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.25rem;
    }

    .formant-bar::before {
        content: "";
        width: 100%;
        height: var(--height);
        background: linear-gradient(
            to top,
            var(--amber),
            oklch(0.828 0.189 84.429 / 0.5)
        );
        border-radius: 2px;
        min-height: 4px;
    }

    .formant-label {
        font-size: 0.625rem;
        font-weight: 600;
        color: var(--muted-foreground);
    }

    .formant-value {
        font-size: 0.75rem;
        font-variant-numeric: tabular-nums;
        color: var(--foreground);
    }

    /* Display settings */
    .display-row {
        display: flex;
        align-items: center;
        gap: 0.75rem;
    }

    .switch-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .switch-label {
        font-size: 0.75rem;
        color: var(--muted-foreground);
    }

    .switch-toggle {
        width: 2.25rem;
        height: 1.25rem;
        padding: 2px;
        border-radius: 999px;
        border: none;
        background: var(--input);
        cursor: pointer;
        transition: background 0.15s;
    }

    .switch-toggle.on {
        background: var(--primary);
    }

    .switch-thumb {
        display: block;
        width: 1rem;
        height: 1rem;
        border-radius: 999px;
        background: var(--background);
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
        transition: transform 0.15s;
    }

    .switch-toggle.on .switch-thumb {
        transform: translateX(1rem);
    }

    .opacity-control {
        flex: 1;
    }

    .opacity-slider {
        width: 100%;
        height: 4px;
        accent-color: var(--primary);
    }

    .checkboxes-row {
        display: flex;
        gap: 1rem;
    }

    .checkbox-label {
        display: flex;
        align-items: center;
        gap: 0.375rem;
        font-size: 0.75rem;
        color: var(--muted-foreground);
        cursor: pointer;
    }

    .checkbox-label.full {
        width: 100%;
    }

    .checkbox-label input {
        accent-color: var(--primary);
    }

    /* Stats badges */
    .stats-section {
        flex-direction: row;
        gap: 0.5rem;
    }

    .stat-badge {
        display: inline-flex;
        align-items: center;
        padding: 0.25rem 0.5rem;
        font-size: 0.7rem;
        font-weight: 500;
        font-variant-numeric: tabular-nums;
        background: var(--secondary);
        color: var(--secondary-foreground);
        border-radius: 999px;
    }

    /* Advanced collapsible */
    :global(.advanced-trigger) {
        display: flex;
        justify-content: space-between;
        align-items: center;
        width: 100%;
        padding: 0.5rem;
        font-size: 0.75rem;
        font-weight: 500;
        color: var(--muted-foreground);
        background: transparent;
        border: 1px dashed var(--border);
        border-radius: var(--radius-sm);
        cursor: pointer;
        transition:
            color 0.15s,
            border-color 0.15s;
    }

    :global(.advanced-trigger:hover) {
        color: var(--foreground);
        border-color: var(--muted-foreground);
    }

    .trigger-icon {
        transition: transform 0.2s;
    }

    .trigger-icon.open {
        transform: rotate(180deg);
    }

    :global(.advanced-content) {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        padding-top: 0.5rem;
    }

    .control-row {
        display: grid;
        grid-template-columns: 3.5rem 1fr 2.5rem;
        align-items: center;
        gap: 0.5rem;
    }

    .control-label {
        font-size: 0.75rem;
        color: var(--muted-foreground);
    }

    .control-row input[type="range"] {
        width: 100%;
        height: 4px;
        accent-color: var(--primary);
    }

    .control-value {
        font-size: 0.75rem;
        font-variant-numeric: tabular-nums;
        color: var(--foreground);
        text-align: right;
    }

    .computed-tau {
        font-size: 0.75rem;
        color: var(--muted-foreground);
        padding: 0.25rem 0;
    }
</style>
