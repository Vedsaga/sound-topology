<script lang="ts">
    import { LayoutGrid, List, Plus, X, Music } from "@lucide/svelte";
    import type { AudioFileEntry, FilterState } from "$lib/audioLibraryTypes";
    import {
        parseFilename,
        generateFileId,
        getDefaultConfig,
        filterFiles,
        getFilterOptions,
    } from "$lib/audioLibraryTypes";

    // Props
    let {
        files = [],
        activeFileId = null,
        viewMode = "list",
        onFilesAdded,
        onFileSelect,
        onFileRemove,
        onViewModeChange,
    }: {
        files: AudioFileEntry[];
        activeFileId: string | null;
        viewMode: "list" | "grid";
        onFilesAdded: (newFiles: { file: File; buffer: AudioBuffer }[]) => void;
        onFileSelect: (id: string) => void;
        onFileRemove: (id: string) => void;
        onViewModeChange: (mode: "list" | "grid") => void;
    } = $props();

    // Local state
    let isDragOver = $state(false);
    let isLoading = $state(false);
    let filter = $state<FilterState>({
        letters: [],
        genders: [],
        speakerIds: [],
    });

    // Derived
    let filteredFiles = $derived(filterFiles(files, filter));
    let filterOptions = $derived(getFilterOptions(files));

    // Audio context for decoding
    let audioContext: AudioContext | null = null;

    function getAudioContext(): AudioContext {
        if (!audioContext) {
            audioContext = new AudioContext();
        }
        return audioContext;
    }

    // Handle file input
    async function handleFiles(fileList: FileList | File[]) {
        isLoading = true;
        const ctx = getAudioContext();
        const results: { file: File; buffer: AudioBuffer }[] = [];

        for (const file of fileList) {
            if (!file.name.endsWith(".wav") && !file.name.endsWith(".mp3")) {
                continue;
            }
            try {
                const arrayBuffer = await file.arrayBuffer();
                const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
                results.push({ file, buffer: audioBuffer });
            } catch (e) {
                console.error(`Failed to decode ${file.name}:`, e);
            }
        }

        if (results.length > 0) {
            onFilesAdded(results);
        }
        isLoading = false;
    }

    // Drag and drop handlers
    function handleDragOver(e: DragEvent) {
        e.preventDefault();
        isDragOver = true;
    }

    function handleDragLeave() {
        isDragOver = false;
    }

    async function handleDrop(e: DragEvent) {
        e.preventDefault();
        isDragOver = false;

        if (!e.dataTransfer) return;

        const items = e.dataTransfer.items;
        const allFiles: File[] = [];

        // Process items (files or directories)
        for (const item of items) {
            if (item.webkitGetAsEntry) {
                const entry = item.webkitGetAsEntry();
                if (entry) {
                    await processEntry(entry, allFiles);
                }
            } else if (item.kind === "file") {
                const file = item.getAsFile();
                if (file) allFiles.push(file);
            }
        }

        if (allFiles.length > 0) {
            await handleFiles(allFiles);
        }
    }

    // Recursively process directory entries
    async function processEntry(
        entry: FileSystemEntry,
        files: File[],
    ): Promise<void> {
        if (entry.isFile) {
            const fileEntry = entry as FileSystemFileEntry;
            const file = await new Promise<File>((resolve) => {
                fileEntry.file(resolve);
            });
            if (file.name.endsWith(".wav") || file.name.endsWith(".mp3")) {
                files.push(file);
            }
        } else if (entry.isDirectory) {
            const dirEntry = entry as FileSystemDirectoryEntry;
            const reader = dirEntry.createReader();
            const entries = await new Promise<FileSystemEntry[]>((resolve) => {
                reader.readEntries(resolve);
            });
            for (const e of entries) {
                await processEntry(e, files);
            }
        }
    }

    // File input click
    let fileInputRef: HTMLInputElement;
    function triggerFileInput() {
        fileInputRef?.click();
    }

    function handleInputChange(e: Event) {
        const input = e.target as HTMLInputElement;
        if (input.files) {
            handleFiles(input.files);
            input.value = ""; // Reset for re-upload
        }
    }

    // Format config for display
    function formatConfig(file: AudioFileEntry): string {
        const parts = [];
        if (file.config.autoTau) {
            parts.push(`τ=${file.computedTau}`);
        } else {
            parts.push(`τ=${file.config.tau}`);
        }
        parts.push(`sm=${file.config.smoothing}`);
        if (file.config.pcaAlign) parts.push("PCA");
        return parts.join(" · ");
    }
</script>

<div
    class="audio-library glass"
    class:drag-over={isDragOver}
    ondragover={handleDragOver}
    ondragleave={handleDragLeave}
    ondrop={handleDrop}
    role="region"
    aria-label="Audio file library"
>
    <!-- Header -->
    <div class="library-header">
        <h3 class="library-title">Audio Files</h3>
        <div class="header-actions">
            <button
                class="icon-btn"
                class:active={viewMode === "list"}
                onclick={() => onViewModeChange("list")}
                title="List view"
            >
                <List size={16} />
            </button>
            <button
                class="icon-btn"
                class:active={viewMode === "grid"}
                onclick={() => onViewModeChange("grid")}
                title="Grid view"
            >
                <LayoutGrid size={16} />
            </button>
            <button
                class="icon-btn add-btn"
                onclick={triggerFileInput}
                title="Add files"
            >
                <Plus size={16} />
            </button>
        </div>
    </div>

    <!-- Hidden file input -->
    <input
        bind:this={fileInputRef}
        type="file"
        accept=".wav,.mp3"
        multiple
        hidden
        onchange={handleInputChange}
    />

    <!-- File List -->
    {#if files.length === 0}
        <div class="empty-state">
            <Music size={32} strokeWidth={1.5} />
            <p>Drop audio files here</p>
            <p class="hint">or click + to add</p>
        </div>
    {:else}
        <div class="file-list" class:grid-view={viewMode === "grid"}>
            {#each filteredFiles as file (file.id)}
                <div
                    class="file-card"
                    class:active={file.id === activeFileId}
                    class:processing={file.isProcessing}
                    onclick={() => onFileSelect(file.id)}
                    onkeydown={(e) =>
                        e.key === "Enter" && onFileSelect(file.id)}
                    role="button"
                    tabindex="0"
                >
                    <div class="file-info">
                        <span class="file-letter">{file.metadata.letter}</span>
                        <div class="file-details">
                            <span class="file-name"
                                >{file.metadata.rawName}</span
                            >
                            <span class="file-config">{formatConfig(file)}</span
                            >
                        </div>
                    </div>
                    <button
                        class="remove-btn"
                        onclick={(e) => {
                            e.stopPropagation();
                            onFileRemove(file.id);
                        }}
                        title="Remove"
                    >
                        <X size={14} />
                    </button>
                </div>
            {/each}
        </div>
    {/if}

    <!-- Loading overlay -->
    {#if isLoading}
        <div class="loading-overlay">
            <div class="spinner"></div>
            <p>Loading files...</p>
        </div>
    {/if}

    <!-- Drop overlay -->
    {#if isDragOver}
        <div class="drop-overlay">
            <Plus size={48} />
            <p>Drop files or folders</p>
        </div>
    {/if}
</div>

<style>
    .audio-library {
        position: relative;
        display: flex;
        flex-direction: column;
        border-radius: var(--radius-lg);
        overflow: hidden;
        min-height: 200px;
    }

    .audio-library.drag-over {
        border-color: var(--color-brand);
    }

    .library-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.75rem 1rem;
        border-bottom: 1px solid var(--color-border);
    }

    .library-title {
        font-size: 0.8125rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--color-muted-foreground);
        margin: 0;
    }

    .header-actions {
        display: flex;
        gap: 0.25rem;
    }

    .icon-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border: none;
        background: transparent;
        color: var(--color-muted-foreground);
        border-radius: var(--radius-sm);
        cursor: pointer;
        transition: all 0.15s ease;
    }

    .icon-btn:hover {
        background: var(--color-surface);
        color: var(--color-foreground);
    }

    .icon-btn.active {
        background: var(--color-surface);
        color: var(--color-brand);
    }

    .add-btn {
        color: var(--color-brand);
    }

    .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 2rem;
        color: var(--color-muted-foreground);
        text-align: center;
        gap: 0.5rem;
    }

    .empty-state p {
        margin: 0;
        font-size: 0.875rem;
    }

    .empty-state .hint {
        font-size: 0.75rem;
        opacity: 0.7;
    }

    .file-list {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        padding: 0.5rem;
        overflow-y: auto;
        max-height: 300px;
    }

    .file-list.grid-view {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 0.5rem;
    }

    .file-card {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.625rem 0.75rem;
        background: var(--color-surface);
        border: 1px solid transparent;
        border-radius: var(--radius-md);
        cursor: pointer;
        transition: all 0.15s ease;
        text-align: left;
    }

    .file-card:hover {
        border-color: var(--color-border);
    }

    .file-card.active {
        border-color: var(--color-brand);
        background: color-mix(in srgb, var(--color-brand) 10%, transparent);
    }

    .file-card.processing {
        opacity: 0.6;
        pointer-events: none;
    }

    .file-info {
        display: flex;
        align-items: center;
        gap: 0.625rem;
        min-width: 0;
        flex: 1;
    }

    .file-letter {
        font-size: 1.125rem;
        font-weight: 600;
        color: var(--color-brand);
        width: 1.5rem;
        text-align: center;
    }

    .file-details {
        display: flex;
        flex-direction: column;
        min-width: 0;
    }

    .file-name {
        font-size: 0.8125rem;
        font-weight: 500;
        color: var(--color-foreground);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .file-config {
        font-size: 0.6875rem;
        color: var(--color-muted-foreground);
        font-variant-numeric: tabular-nums;
    }

    .remove-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        border: none;
        background: transparent;
        color: var(--color-muted-foreground);
        border-radius: var(--radius-sm);
        cursor: pointer;
        opacity: 0;
        transition: all 0.15s ease;
    }

    .file-card:hover .remove-btn {
        opacity: 1;
    }

    .remove-btn:hover {
        background: var(--color-destructive);
        color: white;
    }

    .loading-overlay,
    .drop-overlay {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.75rem;
        background: color-mix(
            in srgb,
            var(--color-background) 90%,
            transparent
        );
        backdrop-filter: blur(4px);
        z-index: 10;
    }

    .drop-overlay {
        border: 2px dashed var(--color-brand);
        color: var(--color-brand);
    }

    .drop-overlay p {
        margin: 0;
        font-weight: 500;
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
