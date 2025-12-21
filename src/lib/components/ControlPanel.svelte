<script lang="ts">
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
        onTauChange,
        onSmoothingChange,
        onNormalizeChange,
        onShowPathChange,
        onPreprocessChange,
        onAutoTauChange,
        onPcaAlignChange,
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
        onTauChange: (value: number) => void;
        onSmoothingChange: (value: number) => void;
        onNormalizeChange: (value: boolean) => void;
        onShowPathChange: (value: boolean) => void;
        onPreprocessChange: (value: boolean) => void;
        onAutoTauChange: (value: boolean) => void;
        onPcaAlignChange: (value: boolean) => void;
        pointCount?: number;
        duration?: number;
    } = $props();
</script>

<div class="control-panel glass">
    <!-- Preprocessing Section -->
    <div class="section">
        <h3 class="panel-title">Signal Processing</h3>

        <label class="checkbox-label">
            <input
                type="checkbox"
                checked={preprocess}
                onchange={(e) =>
                    onPreprocessChange((e.target as HTMLInputElement).checked)}
            />
            <span>Band-pass Filter</span>
            <span class="hint-inline">(60Hz-4kHz)</span>
        </label>

        <label class="checkbox-label">
            <input
                type="checkbox"
                checked={pcaAlign}
                onchange={(e) =>
                    onPcaAlignChange((e.target as HTMLInputElement).checked)}
            />
            <span>PCA Align</span>
            <span class="hint-inline">(standard view)</span>
        </label>
    </div>

    <!-- Embedding Section -->
    <div class="section">
        <h3 class="panel-title">Embedding</h3>

        <label class="checkbox-label">
            <input
                type="checkbox"
                checked={autoTau}
                onchange={(e) =>
                    onAutoTauChange((e.target as HTMLInputElement).checked)}
            />
            <span>Auto τ</span>
            {#if autoTau}
                <span class="computed-value">= {computedTau}</span>
            {/if}
        </label>

        {#if !autoTau}
            <div class="control-group">
                <div class="control-header">
                    <label for="tau-slider">τ (Delay)</label>
                    <span class="control-value">{tau}</span>
                </div>
                <input
                    id="tau-slider"
                    type="range"
                    class="slider"
                    min="1"
                    max="50"
                    step="1"
                    value={tau}
                    oninput={(e) =>
                        onTauChange(
                            parseInt((e.target as HTMLInputElement).value),
                        )}
                />
            </div>
        {/if}

        <div class="control-group">
            <div class="control-header">
                <label for="smoothing-slider">Smoothing</label>
                <span class="control-value">{smoothing}</span>
            </div>
            <input
                id="smoothing-slider"
                type="range"
                class="slider"
                min="0"
                max="20"
                step="1"
                value={smoothing}
                oninput={(e) =>
                    onSmoothingChange(
                        parseInt((e.target as HTMLInputElement).value),
                    )}
            />
            <p class="control-hint">Laplacian iterations</p>
        </div>
    </div>

    <!-- Display Section -->
    <div class="section">
        <h3 class="panel-title">Display</h3>

        <div class="control-row">
            <label class="checkbox-label">
                <input
                    type="checkbox"
                    checked={normalize}
                    onchange={(e) =>
                        onNormalizeChange(
                            (e.target as HTMLInputElement).checked,
                        )}
                />
                <span>Normalize</span>
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
                <span>Show Path</span>
            </label>
        </div>
    </div>

    {#if pointCount > 0}
        <div class="stats">
            <div class="stat">
                <span class="stat-label">Points</span>
                <span class="stat-value">{pointCount.toLocaleString()}</span>
            </div>
            <div class="stat">
                <span class="stat-label">Duration</span>
                <span class="stat-value">{duration.toFixed(2)}s</span>
            </div>
        </div>
    {/if}
</div>

<style>
    .control-panel {
        padding: 1.25rem;
        border-radius: var(--radius-lg);
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
    }

    .section {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        padding-bottom: 0.75rem;
        border-bottom: 1px solid var(--color-border);
    }

    .section:last-of-type {
        border-bottom: none;
        padding-bottom: 0;
    }

    .panel-title {
        font-size: 0.6875rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--color-muted-foreground);
        margin: 0;
    }

    .control-group {
        display: flex;
        flex-direction: column;
        gap: 0.375rem;
    }

    .control-header {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
    }

    .control-header label {
        font-size: 0.875rem;
        font-weight: 500;
        color: var(--color-foreground);
    }

    .control-value {
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--color-brand);
        font-variant-numeric: tabular-nums;
    }

    .control-hint {
        font-size: 0.75rem;
        color: var(--color-muted-foreground);
        margin: 0;
    }

    .control-row {
        display: flex;
        gap: 1.5rem;
    }

    .checkbox-label {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.875rem;
        color: var(--color-foreground);
        cursor: pointer;
    }

    .checkbox-label input[type="checkbox"] {
        width: 16px;
        height: 16px;
        accent-color: var(--color-brand);
        cursor: pointer;
    }

    .hint-inline {
        font-size: 0.75rem;
        color: var(--color-muted-foreground);
        margin-left: auto;
    }

    .computed-value {
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--color-accent-amber);
        margin-left: auto;
        font-variant-numeric: tabular-nums;
    }

    .stats {
        display: flex;
        gap: 1.5rem;
        padding-top: 0.75rem;
        border-top: 1px solid var(--color-border);
    }

    .stat {
        display: flex;
        flex-direction: column;
        gap: 0.125rem;
    }

    .stat-label {
        font-size: 0.6875rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--color-muted-foreground);
    }

    .stat-value {
        font-size: 0.9375rem;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        color: var(--color-foreground);
    }
</style>
