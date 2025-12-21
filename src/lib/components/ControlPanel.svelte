<script lang="ts">
    // Props
    let {
        tau = 12,
        smoothing = 3,
        normalize = true,
        showPath = true,
        onTauChange,
        onSmoothingChange,
        onNormalizeChange,
        onShowPathChange,
        pointCount = 0,
        duration = 0,
    }: {
        tau: number;
        smoothing: number;
        normalize: boolean;
        showPath: boolean;
        onTauChange: (value: number) => void;
        onSmoothingChange: (value: number) => void;
        onNormalizeChange: (value: boolean) => void;
        onShowPathChange: (value: boolean) => void;
        pointCount?: number;
        duration?: number;
    } = $props();
</script>

<div class="control-panel glass">
    <h3 class="panel-title">Embedding Parameters</h3>

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
                onTauChange(parseInt((e.target as HTMLInputElement).value))}
        />
        <p class="control-hint">Time delay in samples</p>
    </div>

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

    <div class="control-row">
        <label class="checkbox-label">
            <input
                type="checkbox"
                checked={normalize}
                onchange={(e) =>
                    onNormalizeChange((e.target as HTMLInputElement).checked)}
            />
            <span>Normalize</span>
        </label>

        <label class="checkbox-label">
            <input
                type="checkbox"
                checked={showPath}
                onchange={(e) =>
                    onShowPathChange((e.target as HTMLInputElement).checked)}
            />
            <span>Show Path</span>
        </label>
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
        gap: 1rem;
    }

    .panel-title {
        font-size: 0.8125rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--color-muted-foreground);
        margin: 0 0 0.25rem;
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

    .stats {
        display: flex;
        gap: 1.5rem;
        padding-top: 0.75rem;
        border-top: 1px solid var(--color-border);
        margin-top: 0.5rem;
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
