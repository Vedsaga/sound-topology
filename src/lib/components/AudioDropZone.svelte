<script lang="ts">
    import { Upload, FileAudio, X } from "@lucide/svelte";

    // Props
    let {
        onAudioLoaded,
        audioFile = null,
    }: {
        onAudioLoaded: (buffer: AudioBuffer, file: File) => void;
        audioFile?: File | null;
    } = $props();

    // State
    let isDragOver = $state(false);
    let isLoading = $state(false);
    let error = $state<string | null>(null);
    let fileInputRef: HTMLInputElement;

    async function processFile(file: File) {
        if (!file.type.startsWith("audio/")) {
            error = "Please upload an audio file (WAV, MP3, etc.)";
            return;
        }

        isLoading = true;
        error = null;

        try {
            const arrayBuffer = await file.arrayBuffer();
            const audioContext = new AudioContext();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

            onAudioLoaded(audioBuffer, file);
        } catch (e) {
            error = "Failed to decode audio file. Please try another file.";
            console.error("Audio decode error:", e);
        } finally {
            isLoading = false;
        }
    }

    function handleDrop(e: DragEvent) {
        e.preventDefault();
        isDragOver = false;

        const file = e.dataTransfer?.files[0];
        if (file) processFile(file);
    }

    function handleDragOver(e: DragEvent) {
        e.preventDefault();
        isDragOver = true;
    }

    function handleDragLeave() {
        isDragOver = false;
    }

    function handleFileSelect(e: Event) {
        const input = e.target as HTMLInputElement;
        const file = input.files?.[0];
        if (file) processFile(file);
    }

    function clearFile() {
        if (fileInputRef) fileInputRef.value = "";
        // Parent handles clearing audioFile
    }
</script>

<input
    bind:this={fileInputRef}
    type="file"
    accept="audio/*"
    class="hidden-input"
    onchange={handleFileSelect}
/>

{#if audioFile}
    <div class="file-loaded">
        <div class="file-info">
            <FileAudio size={20} />
            <span class="file-name">{audioFile.name}</span>
        </div>
        <button
            class="btn btn-ghost btn-icon"
            onclick={clearFile}
            title="Remove file"
        >
            <X size={18} />
        </button>
    </div>
{:else}
    <div
        class="drop-zone"
        class:drag-over={isDragOver}
        class:loading={isLoading}
        role="button"
        tabindex="0"
        ondrop={handleDrop}
        ondragover={handleDragOver}
        ondragleave={handleDragLeave}
        onclick={() => fileInputRef?.click()}
        onkeydown={(e) => e.key === "Enter" && fileInputRef?.click()}
    >
        {#if isLoading}
            <div class="spinner"></div>
            <p>Processing audio...</p>
        {:else}
            <Upload size={32} strokeWidth={1.5} />
            <p class="drop-text">Drop audio file here</p>
            <p class="drop-hint">or click to browse</p>
        {/if}
    </div>
{/if}

{#if error}
    <p class="error-text">{error}</p>
{/if}

<style>
    .hidden-input {
        display: none;
    }

    .drop-zone {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        padding: 2rem;
        border: 2px dashed var(--color-border);
        border-radius: var(--radius-lg);
        background: transparent;
        color: var(--color-muted-foreground);
        cursor: pointer;
        transition: all var(--transition-normal);
        min-height: 140px;
    }

    .drop-zone:hover,
    .drop-zone.drag-over {
        border-color: var(--color-brand);
        background: color-mix(in srgb, var(--color-brand) 5%, transparent);
        color: var(--color-brand);
    }

    .drop-zone.loading {
        pointer-events: none;
        opacity: 0.7;
    }

    .drop-text {
        font-size: 0.9375rem;
        font-weight: 500;
        margin: 0;
    }

    .drop-hint {
        font-size: 0.8125rem;
        margin: 0;
        opacity: 0.7;
    }

    .file-loaded {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.75rem 1rem;
        background: var(--color-muted);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
    }

    .file-info {
        display: flex;
        align-items: center;
        gap: 0.625rem;
        color: var(--color-foreground);
    }

    .file-name {
        font-size: 0.875rem;
        font-weight: 500;
        max-width: 180px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .error-text {
        color: var(--color-destructive);
        font-size: 0.8125rem;
        margin-top: 0.5rem;
    }

    .spinner {
        width: 24px;
        height: 24px;
        border: 2px solid var(--color-border);
        border-top-color: var(--color-brand);
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }
</style>
