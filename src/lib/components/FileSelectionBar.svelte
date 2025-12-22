<script lang="ts">
    import { Plus, X, Music } from "@lucide/svelte";
    import type { AudioFileEntry } from "$lib/audioLibraryTypes";

    let {
        files = [],
        activeFileId = null,
        compareFileId = null,
        isCompareMode = false,
        isOverlayMode = false,
        overlayFileIds = [],
        onFileSelect,
        onFileRemove,
        onFilesAdded,
    }: {
        files: AudioFileEntry[];
        activeFileId: string | null;
        compareFileId: string | null;
        isCompareMode: boolean;
        isOverlayMode?: boolean;
        overlayFileIds?: string[];
        onFileSelect: (id: string, slot: "primary" | "secondary") => void;
        onFileRemove: (id: string) => void;
        onFilesAdded: (newFiles: { file: File; buffer: AudioBuffer }[]) => void;
    } = $props();

    // Local state
    let isDragOver = $state(false);
    let isLoading = $state(false);

    // Audio context
    let audioContext: AudioContext | null = null;
    function getAudioContext(): AudioContext {
        if (!audioContext) audioContext = new AudioContext();
        return audioContext;
    }

    // File handling
    async function handleFiles(fileList: FileList | File[]) {
        isLoading = true;
        const ctx = getAudioContext();
        const results: { file: File; buffer: AudioBuffer }[] = [];

        for (const file of fileList) {
            if (!file.name.endsWith(".wav") && !file.name.endsWith(".mp3"))
                continue;
            try {
                const arrayBuffer = await file.arrayBuffer();
                const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
                results.push({ file, buffer: audioBuffer });
            } catch (e) {
                console.error(`Failed to decode ${file.name}:`, e);
            }
        }

        if (results.length > 0) onFilesAdded(results);
        isLoading = false;
    }

    // Drag handlers
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

        const allFiles: File[] = [];
        for (const item of e.dataTransfer.items) {
            if (item.webkitGetAsEntry) {
                const entry = item.webkitGetAsEntry();
                if (entry) await processEntry(entry, allFiles);
            } else if (item.kind === "file") {
                const file = item.getAsFile();
                if (file) allFiles.push(file);
            }
        }
        if (allFiles.length > 0) await handleFiles(allFiles);
    }

    async function processEntry(
        entry: FileSystemEntry,
        files: File[],
    ): Promise<void> {
        if (entry.isFile) {
            const fileEntry = entry as FileSystemFileEntry;
            const file = await new Promise<File>((resolve) =>
                fileEntry.file(resolve),
            );
            if (file.name.endsWith(".wav") || file.name.endsWith(".mp3"))
                files.push(file);
        } else if (entry.isDirectory) {
            const dirEntry = entry as FileSystemDirectoryEntry;
            const reader = dirEntry.createReader();
            const entries = await new Promise<FileSystemEntry[]>((resolve) =>
                reader.readEntries(resolve),
            );
            for (const e of entries) await processEntry(e, files);
        }
    }

    // File input
    let fileInputRef: HTMLInputElement;
    function triggerFileInput() {
        fileInputRef?.click();
    }
    function handleInputChange(e: Event) {
        const input = e.target as HTMLInputElement;
        if (input.files) {
            handleFiles(input.files);
            input.value = "";
        }
    }

    // Click handler for file selection
    function handleFileClick(id: string) {
        if (isOverlayMode) {
            // In overlay mode, just add to overlay
            onFileSelect(id, "primary");
        } else if (isCompareMode && activeFileId && activeFileId !== id) {
            // In compare mode, second click sets secondary
            onFileSelect(id, "secondary");
        } else {
            onFileSelect(id, "primary");
        }
    }

    // Check if file is in overlay
    function isInOverlay(id: string): boolean {
        return overlayFileIds.includes(id);
    }
</script>

<div
    class="file-bar"
    class:drag-over={isDragOver}
    ondragover={handleDragOver}
    ondragleave={handleDragLeave}
    ondrop={handleDrop}
    role="region"
    aria-label="File selection"
>
    <input
        bind:this={fileInputRef}
        type="file"
        accept=".wav,.mp3"
        multiple
        hidden
        onchange={handleInputChange}
    />

    {#if files.length === 0}
        <div class="empty-bar">
            <Music size={20} />
            <span>Drop audio files here or</span>
            <button class="add-link" onclick={triggerFileInput}>browse</button>
        </div>
    {:else}
        <div class="file-chips">
            {#each files as file (file.id)}
                <div
                    class="file-chip"
                    class:active={file.id === activeFileId}
                    class:compare={file.id === compareFileId}
                    class:in-overlay={isOverlayMode && isInOverlay(file.id)}
                    onclick={() => handleFileClick(file.id)}
                    onkeydown={(e) =>
                        e.key === "Enter" && handleFileClick(file.id)}
                    role="button"
                    tabindex="0"
                >
                    <span class="chip-letter">{file.metadata.letter}</span>
                    <span class="chip-name">{file.metadata.rawName}</span>
                    {#if isOverlayMode && isInOverlay(file.id)}
                        <span class="chip-badge overlay">✓</span>
                    {:else if file.id === activeFileId}
                        <span class="chip-badge">A</span>
                    {:else if file.id === compareFileId}
                        <span class="chip-badge secondary">B</span>
                    {/if}
                    <button
                        class="chip-remove"
                        onclick={(e) => {
                            e.stopPropagation();
                            onFileRemove(file.id);
                        }}
                        title="Remove"
                    >
                        <X size={12} />
                    </button>
                </div>
            {/each}
        </div>
        <button class="add-btn" onclick={triggerFileInput} title="Add files">
            <Plus size={18} />
        </button>
    {/if}

    {#if isLoading}
        <div class="loading-indicator">Loading...</div>
    {/if}
    {#if isDragOver}
        <div class="drop-overlay">
            <Plus size={24} />
            <span>Drop files</span>
        </div>
    {/if}
</div>

<style>
    .file-bar {
        position: relative;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem 0.75rem;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        min-height: 48px;
    }

    .file-bar.drag-over {
        border-color: var(--color-brand);
        background: color-mix(
            in srgb,
            var(--color-brand) 5%,
            var(--color-surface)
        );
    }

    .empty-bar {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        color: var(--color-muted-foreground);
        font-size: 0.875rem;
        width: 100%;
        justify-content: center;
    }

    .add-link {
        background: none;
        border: none;
        color: var(--color-brand);
        cursor: pointer;
        font-size: inherit;
        text-decoration: underline;
    }

    .file-chips {
        display: flex;
        gap: 0.375rem;
        overflow-x: auto;
        flex: 1;
        padding: 0.25rem 0;
    }

    .file-chips::-webkit-scrollbar {
        height: 4px;
    }

    .file-chips::-webkit-scrollbar-thumb {
        background: var(--color-border);
        border-radius: 2px;
    }

    .file-chip {
        display: flex;
        align-items: center;
        gap: 0.375rem;
        padding: 0.375rem 0.5rem;
        background: var(--color-background);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        cursor: pointer;
        white-space: nowrap;
        transition: all 0.15s ease;
        flex-shrink: 0;
    }

    .file-chip:hover {
        border-color: var(--color-muted-foreground);
    }

    .file-chip.active {
        border-color: var(--color-brand);
        background: color-mix(
            in srgb,
            var(--color-brand) 10%,
            var(--color-background)
        );
    }

    .file-chip.compare {
        border-color: var(--color-accent-amber);
        background: color-mix(
            in srgb,
            var(--color-accent-amber) 10%,
            var(--color-background)
        );
    }

    .chip-letter {
        font-weight: 600;
        color: var(--color-brand);
    }

    .chip-name {
        font-size: 0.75rem;
        color: var(--color-muted-foreground);
        max-width: 120px;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .chip-badge {
        font-size: 0.625rem;
        font-weight: 700;
        padding: 0.125rem 0.25rem;
        border-radius: 2px;
        background: var(--color-brand);
        color: white;
    }

    .chip-badge.secondary {
        background: var(--color-accent-amber);
    }

    .chip-badge.overlay {
        background: #4caf50;
    }

    .file-chip.in-overlay {
        border-color: #4caf50;
        background: color-mix(in srgb, #4caf50 10%, var(--color-background));
    }

    .chip-remove {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 16px;
        height: 16px;
        border: none;
        background: transparent;
        color: var(--color-muted-foreground);
        border-radius: 2px;
        cursor: pointer;
        opacity: 0;
        transition: all 0.15s ease;
    }

    .file-chip:hover .chip-remove {
        opacity: 1;
    }

    .chip-remove:hover {
        background: var(--color-destructive);
        color: white;
    }

    .add-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border: 1px dashed var(--color-border);
        background: transparent;
        color: var(--color-muted-foreground);
        border-radius: var(--radius-sm);
        cursor: pointer;
        flex-shrink: 0;
        transition: all 0.15s ease;
    }

    .add-btn:hover {
        border-color: var(--color-brand);
        color: var(--color-brand);
    }

    .loading-indicator {
        position: absolute;
        right: 0.5rem;
        font-size: 0.75rem;
        color: var(--color-muted-foreground);
    }

    .drop-overlay {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        background: color-mix(
            in srgb,
            var(--color-background) 90%,
            transparent
        );
        border: 2px dashed var(--color-brand);
        border-radius: var(--radius-md);
        color: var(--color-brand);
        font-weight: 500;
        z-index: 5;
    }
</style>
