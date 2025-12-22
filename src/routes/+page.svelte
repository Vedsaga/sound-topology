<script lang="ts">
  import { browser } from "$app/environment";
  import { Canvas } from "@threlte/core";
  import Sidebar from "$lib/components/Sidebar.svelte";
  import FileSelectionBar from "$lib/components/FileSelectionBar.svelte";
  import ControlPanel from "$lib/components/ControlPanel.svelte";
  import PhaseSpaceScene from "$lib/components/PhaseSpaceScene.svelte";
  import { Maximize2, Grid3x3, GitCompare } from "@lucide/svelte";
  import type { PhaseSpacePoint } from "$lib/phaseSpaceEmbedding";
  import type { AudioFileEntry, AnalysisConfig } from "$lib/audioLibraryTypes";
  import {
    parseFilename,
    generateFileId,
    getDefaultConfig,
  } from "$lib/audioLibraryTypes";

  // ═══════════════════════════════════════════
  // VIEW MODE
  // ═══════════════════════════════════════════
  type ViewMode = "single" | "grid" | "compare";
  let viewMode = $state<ViewMode>("single");

  // ═══════════════════════════════════════════
  // FILE STATE
  // ═══════════════════════════════════════════
  let fileMap = $state(new Map<string, AudioFileEntry>());
  let fileOrder = $state<string[]>([]);

  let primaryFileId = $state<string | null>(null);
  let secondaryFileId = $state<string | null>(null);

  let showPath = $state(true);

  // Primary display state
  let primaryPoints = $state<PhaseSpacePoint[]>([]);
  let primaryConfig = $state<AnalysisConfig>(getDefaultConfig());
  let primaryComputedTau = $state(12);
  let primaryDuration = $state(0);

  // Secondary display state
  let secondaryPoints = $state<PhaseSpacePoint[]>([]);
  let secondaryConfig = $state<AnalysisConfig>(getDefaultConfig());
  let secondaryComputedTau = $state(12);
  let secondaryDuration = $state(0);

  // Derived file names for display
  let primaryFileName = $derived(
    primaryFileId
      ? (fileMap.get(primaryFileId)?.metadata.rawName ?? "File A")
      : "Select file",
  );
  let secondaryFileName = $derived(
    secondaryFileId
      ? (fileMap.get(secondaryFileId)?.metadata.rawName ?? "File B")
      : "Select file",
  );

  // Multi-select filter state
  let filterLetters = $state<string[]>([]);
  let filterGenders = $state<("male" | "female" | "golden")[]>([]);
  let filterSpeakerIds = $state<string[]>([]);

  // All audio files
  let audioFiles = $derived(
    fileOrder
      .map((id) => fileMap.get(id))
      .filter((f): f is AudioFileEntry => f !== undefined),
  );

  // Available filter options
  let availableLetters = $derived(
    [...new Set(audioFiles.map((f) => f.metadata.letter))].sort(),
  );
  let availableSpeakerIds = $derived(
    [...new Set(audioFiles.map((f) => f.metadata.speakerId))].sort(),
  );
  let availableGenders = $derived(() => {
    const genders: ("male" | "female" | "golden")[] = [];
    if (audioFiles.some((f) => f.metadata.gender === "male"))
      genders.push("male");
    if (audioFiles.some((f) => f.metadata.gender === "female"))
      genders.push("female");
    if (audioFiles.some((f) => f.metadata.gender === "golden"))
      genders.push("golden");
    return genders;
  });

  // Helper to toggle multi-select
  function toggleFilter<T>(arr: T[], val: T): T[] {
    return arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];
  }

  // Filtered files for grid view
  let filteredFiles = $derived(
    audioFiles.filter((f) => {
      if (
        filterLetters.length > 0 &&
        !filterLetters.includes(f.metadata.letter)
      )
        return false;
      if (
        filterGenders.length > 0 &&
        !filterGenders.includes(
          f.metadata.gender as "male" | "female" | "golden",
        )
      )
        return false;
      if (
        filterSpeakerIds.length > 0 &&
        !filterSpeakerIds.includes(f.metadata.speakerId)
      )
        return false;
      return true;
    }),
  );

  // ═══════════════════════════════════════════
  // WEB WORKER
  // ═══════════════════════════════════════════
  let worker: Worker | null = null;
  let pendingFileId: string | null = null;
  let pendingSlot: "primary" | "secondary" = "primary";

  $effect(() => {
    if (browser && !worker) {
      worker = new Worker(
        new URL("$lib/phaseSpaceWorker.ts", import.meta.url),
        { type: "module" },
      );

      worker.onmessage = (e) => {
        if (e.data.type === "result" && pendingFileId) {
          const file = fileMap.get(pendingFileId);
          if (file) {
            file.points = e.data.points;
            file.computedTau = e.data.computedTau;
            file.isProcessing = false;

            if (pendingSlot === "primary" && pendingFileId === primaryFileId) {
              primaryPoints = e.data.points;
              primaryComputedTau = e.data.computedTau;
            } else if (
              pendingSlot === "secondary" &&
              pendingFileId === secondaryFileId
            ) {
              secondaryPoints = e.data.points;
              secondaryComputedTau = e.data.computedTau;
            }
          }
          pendingFileId = null;
        }
      };
    }
    return () => worker?.terminate();
  });

  // ═══════════════════════════════════════════
  // FILE MANAGEMENT
  // ═══════════════════════════════════════════
  function handleFilesAdded(newFiles: { file: File; buffer: AudioBuffer }[]) {
    const newIds: string[] = [];

    for (const { file, buffer } of newFiles) {
      const id = generateFileId();
      const entry: AudioFileEntry = {
        id,
        file,
        buffer,
        metadata: parseFilename(file.name),
        config: getDefaultConfig(),
        points: [],
        computedTau: 12,
        isProcessing: true,
      };
      fileMap.set(id, entry);
      newIds.push(id);
    }

    fileOrder = [...fileOrder, ...newIds];

    if (!primaryFileId && newIds.length > 0) {
      selectFile(newIds[0], "primary");
    }
  }

  function selectFile(id: string, slot: "primary" | "secondary") {
    const file = fileMap.get(id);
    if (!file) return;

    // Toggle: if clicking same file, unselect it
    if (slot === "primary" && primaryFileId === id) {
      primaryFileId = null;
      primaryPoints = [];
      return;
    }
    if (slot === "secondary" && secondaryFileId === id) {
      secondaryFileId = null;
      secondaryPoints = [];
      return;
    }

    if (slot === "primary") {
      primaryFileId = id;
      primaryPoints = file.points;
      primaryConfig = { ...file.config };
      primaryComputedTau = file.computedTau;
      primaryDuration = file.buffer.duration;

      if (file.points.length === 0) {
        triggerComputation(file, "primary");
      }
    } else {
      secondaryFileId = id;
      secondaryPoints = file.points;
      secondaryConfig = { ...file.config };
      secondaryComputedTau = file.computedTau;
      secondaryDuration = file.buffer.duration;

      if (file.points.length === 0) {
        triggerComputation(file, "secondary");
      }
    }
  }

  function handleFileRemove(id: string) {
    fileMap.delete(id);
    fileOrder = fileOrder.filter((fid) => fid !== id);

    if (primaryFileId === id) {
      primaryFileId = fileOrder.length > 0 ? fileOrder[0] : null;
      if (primaryFileId) selectFile(primaryFileId, "primary");
      else primaryPoints = [];
    }
    if (secondaryFileId === id) {
      secondaryFileId = null;
      secondaryPoints = [];
    }
  }

  // ═══════════════════════════════════════════
  // COMPUTATION
  // ═══════════════════════════════════════════
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  function triggerComputation(
    file: AudioFileEntry,
    slot: "primary" | "secondary",
  ) {
    if (!worker) return;

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      pendingFileId = file.id;
      pendingSlot = slot;
      file.isProcessing = true;

      worker!.postMessage({
        type: "compute",
        samples: file.buffer.getChannelData(0),
        sampleRate: file.buffer.sampleRate,
        tau: file.config.tau,
        autoTau: file.config.autoTau,
        smoothing: file.config.smoothing,
        normalize: file.config.normalize,
        preprocess: file.config.preprocess,
        pcaAlign: file.config.pcaAlign,
        maxPoints: 5000,
      });
    }, 100);
  }

  // ═══════════════════════════════════════════
  // CONFIG UPDATES
  // ═══════════════════════════════════════════
  function updateConfig<K extends keyof AnalysisConfig>(
    slot: "primary" | "secondary",
    key: K,
    value: AnalysisConfig[K],
  ) {
    const fileId = slot === "primary" ? primaryFileId : secondaryFileId;
    if (!fileId) return;
    const file = fileMap.get(fileId);
    if (!file) return;

    file.config = { ...file.config, [key]: value };

    if (slot === "primary") {
      primaryConfig = { ...file.config };
    } else {
      secondaryConfig = { ...file.config };
    }

    triggerComputation(file, slot);
  }

  const viewModes: { mode: ViewMode; icon: typeof Maximize2; label: string }[] =
    [
      { mode: "single", icon: Maximize2, label: "Single" },
      { mode: "grid", icon: Grid3x3, label: "Grid" },
      { mode: "compare", icon: GitCompare, label: "Compare" },
    ];
</script>

<svelte:head>
  <title>Sound Topology - Phase Space Explorer</title>
</svelte:head>

<div class="app-layout">
  <Sidebar currentView="phase-space" />

  <main class="main-content">
    <!-- Workspace (no header, more canvas space) -->
    <div class="workspace">
      {#if viewMode === "single"}
        <!-- SINGLE VIEW -->
        <div class="single-layout">
          <div class="canvas-area">
            {#if browser}
              <Canvas>
                <PhaseSpaceScene
                  points={primaryPoints}
                  {showPath}
                  xrayMode={primaryConfig.xrayMode}
                  opacity={primaryConfig.opacity}
                />
              </Canvas>
            {/if}
            {#if primaryPoints.length === 0}
              <div class="canvas-placeholder">
                <p>Select a file to visualize</p>
              </div>
            {/if}
          </div>

          {#if primaryFileId}
            <aside class="control-sidebar">
              <ControlPanel
                tau={primaryConfig.tau}
                computedTau={primaryComputedTau}
                smoothing={primaryConfig.smoothing}
                normalize={primaryConfig.normalize}
                {showPath}
                preprocess={primaryConfig.preprocess}
                autoTau={primaryConfig.autoTau}
                pcaAlign={primaryConfig.pcaAlign}
                xrayMode={primaryConfig.xrayMode}
                opacity={primaryConfig.opacity}
                onTauChange={(v) => updateConfig("primary", "tau", v)}
                onSmoothingChange={(v) =>
                  updateConfig("primary", "smoothing", v)}
                onNormalizeChange={(v) =>
                  updateConfig("primary", "normalize", v)}
                onShowPathChange={(v) => (showPath = v)}
                onPreprocessChange={(v) =>
                  updateConfig("primary", "preprocess", v)}
                onAutoTauChange={(v) => updateConfig("primary", "autoTau", v)}
                onPcaAlignChange={(v) => updateConfig("primary", "pcaAlign", v)}
                onXrayModeChange={(v) => updateConfig("primary", "xrayMode", v)}
                onOpacityChange={(v) => updateConfig("primary", "opacity", v)}
                pointCount={primaryPoints.length}
                duration={primaryDuration}
              />
            </aside>
          {/if}
        </div>
      {:else if viewMode === "grid"}
        <!-- GRID VIEW - Thumbnail gallery -->
        <div class="grid-layout">
          <div class="grid-area">
            {#if audioFiles.length === 0}
              <p class="empty-message">Drop audio files to see thumbnails</p>
            {:else}
              <div class="thumbnail-grid">
                {#each filteredFiles as file (file.id)}
                  <div
                    class="thumbnail-card"
                    class:active={file.id === primaryFileId}
                    onclick={() => {
                      viewMode = "single";
                      selectFile(file.id, "primary");
                    }}
                    onkeydown={(e) =>
                      e.key === "Enter" && selectFile(file.id, "primary")}
                    role="button"
                    tabindex="0"
                  >
                    <div class="thumbnail-preview">
                      {#if browser && file.points.length > 0}
                        <Canvas>
                          <PhaseSpaceScene
                            points={file.points}
                            showPath={true}
                            xrayMode={true}
                            opacity={0.15}
                          />
                        </Canvas>
                      {:else}
                        <div class="thumbnail-loading">...</div>
                      {/if}
                    </div>
                    <div class="thumbnail-label">
                      <span class="thumbnail-letter"
                        >{file.metadata.letter}</span
                      >
                      <span class="thumbnail-name">{file.metadata.rawName}</span
                      >
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
          <aside class="filter-sidebar">
            <div class="filter-header">
              <p class="sidebar-title">Filters</p>
              {#if filterLetters.length > 0 || filterGenders.length > 0 || filterSpeakerIds.length > 0}
                <button
                  class="clear-filters-btn"
                  onclick={() => {
                    filterLetters = [];
                    filterGenders = [];
                    filterSpeakerIds = [];
                  }}
                >
                  Clear all
                </button>
              {/if}
            </div>

            <!-- Speaker filter -->
            <div class="filter-group">
              <span class="filter-label">Speaker</span>
              <div class="filter-chips">
                {#each availableSpeakerIds as speakerId}
                  <button
                    class="filter-chip"
                    class:active={filterSpeakerIds.includes(speakerId)}
                    onclick={() =>
                      (filterSpeakerIds = toggleFilter(
                        filterSpeakerIds,
                        speakerId,
                      ))}
                  >
                    {speakerId}
                  </button>
                {/each}
              </div>
              {#if availableSpeakerIds.length === 0}
                <p class="filter-empty">No speakers</p>
              {/if}
            </div>

            <!-- Letter filter -->
            <div class="filter-group">
              <span class="filter-label">Letter</span>
              <div class="filter-chips">
                {#each availableLetters as letter}
                  <button
                    class="filter-chip"
                    class:active={filterLetters.includes(letter)}
                    onclick={() =>
                      (filterLetters = toggleFilter(filterLetters, letter))}
                  >
                    {letter}
                  </button>
                {/each}
              </div>
              {#if availableLetters.length === 0}
                <p class="filter-empty">No letters</p>
              {/if}
            </div>

            <!-- Gender filter -->
            <div class="filter-group">
              <span class="filter-label">Gender</span>
              <div class="filter-chips">
                <button
                  class="filter-chip"
                  class:active={filterGenders.includes("female")}
                  onclick={() =>
                    (filterGenders = toggleFilter(filterGenders, "female"))}
                >
                  Female
                </button>
                <button
                  class="filter-chip"
                  class:active={filterGenders.includes("male")}
                  onclick={() =>
                    (filterGenders = toggleFilter(filterGenders, "male"))}
                >
                  Male
                </button>
                <button
                  class="filter-chip"
                  class:active={filterGenders.includes("golden")}
                  onclick={() =>
                    (filterGenders = toggleFilter(filterGenders, "golden"))}
                >
                  Golden
                </button>
              </div>
            </div>

            <!-- Count display -->
            <p class="filter-count">
              {filteredFiles.length} / {audioFiles.length} files
            </p>
          </aside>
        </div>
      {:else if viewMode === "compare"}
        <!-- COMPARE VIEW with control panels -->
        <div class="compare-layout">
          <!-- Panel A -->
          <div class="compare-panel">
            <div class="panel-header">A: {primaryFileName}</div>
            <div class="canvas-area">
              {#if browser}
                <Canvas>
                  <PhaseSpaceScene
                    points={primaryPoints}
                    {showPath}
                    xrayMode={primaryConfig.xrayMode}
                    opacity={primaryConfig.opacity}
                  />
                </Canvas>
              {/if}
              {#if !primaryFileId}
                <div class="canvas-placeholder"><p>Click a file for A</p></div>
              {/if}
            </div>
            {#if primaryFileId}
              <div class="compare-controls">
                <ControlPanel
                  tau={primaryConfig.tau}
                  computedTau={primaryComputedTau}
                  smoothing={primaryConfig.smoothing}
                  normalize={primaryConfig.normalize}
                  {showPath}
                  preprocess={primaryConfig.preprocess}
                  autoTau={primaryConfig.autoTau}
                  pcaAlign={primaryConfig.pcaAlign}
                  xrayMode={primaryConfig.xrayMode}
                  opacity={primaryConfig.opacity}
                  onTauChange={(v) => updateConfig("primary", "tau", v)}
                  onSmoothingChange={(v) =>
                    updateConfig("primary", "smoothing", v)}
                  onNormalizeChange={(v) =>
                    updateConfig("primary", "normalize", v)}
                  onShowPathChange={(v) => (showPath = v)}
                  onPreprocessChange={(v) =>
                    updateConfig("primary", "preprocess", v)}
                  onAutoTauChange={(v) => updateConfig("primary", "autoTau", v)}
                  onPcaAlignChange={(v) =>
                    updateConfig("primary", "pcaAlign", v)}
                  onXrayModeChange={(v) =>
                    updateConfig("primary", "xrayMode", v)}
                  onOpacityChange={(v) => updateConfig("primary", "opacity", v)}
                  pointCount={primaryPoints.length}
                  duration={primaryDuration}
                />
              </div>
            {/if}
          </div>

          <!-- Panel B -->
          <div class="compare-panel">
            <div class="panel-header">B: {secondaryFileName}</div>
            <div class="canvas-area">
              {#if browser && secondaryFileId}
                <Canvas>
                  <PhaseSpaceScene
                    points={secondaryPoints}
                    {showPath}
                    xrayMode={secondaryConfig.xrayMode}
                    opacity={secondaryConfig.opacity}
                  />
                </Canvas>
              {:else}
                <div class="canvas-placeholder"><p>Click a file for B</p></div>
              {/if}
            </div>
            {#if secondaryFileId}
              <div class="compare-controls">
                <ControlPanel
                  tau={secondaryConfig.tau}
                  computedTau={secondaryComputedTau}
                  smoothing={secondaryConfig.smoothing}
                  normalize={secondaryConfig.normalize}
                  {showPath}
                  preprocess={secondaryConfig.preprocess}
                  autoTau={secondaryConfig.autoTau}
                  pcaAlign={secondaryConfig.pcaAlign}
                  xrayMode={secondaryConfig.xrayMode}
                  opacity={secondaryConfig.opacity}
                  onTauChange={(v) => updateConfig("secondary", "tau", v)}
                  onSmoothingChange={(v) =>
                    updateConfig("secondary", "smoothing", v)}
                  onNormalizeChange={(v) =>
                    updateConfig("secondary", "normalize", v)}
                  onShowPathChange={(v) => (showPath = v)}
                  onPreprocessChange={(v) =>
                    updateConfig("secondary", "preprocess", v)}
                  onAutoTauChange={(v) =>
                    updateConfig("secondary", "autoTau", v)}
                  onPcaAlignChange={(v) =>
                    updateConfig("secondary", "pcaAlign", v)}
                  onXrayModeChange={(v) =>
                    updateConfig("secondary", "xrayMode", v)}
                  onOpacityChange={(v) =>
                    updateConfig("secondary", "opacity", v)}
                  pointCount={secondaryPoints.length}
                  duration={secondaryDuration}
                />
              </div>
            {/if}
          </div>
        </div>
      {/if}
    </div>

    <!-- Bottom bar: files + mode toggle -->
    <div class="bottom-bar">
      <FileSelectionBar
        files={audioFiles}
        activeFileId={primaryFileId}
        compareFileId={secondaryFileId}
        isCompareMode={viewMode === "compare"}
        onFileSelect={selectFile}
        onFileRemove={handleFileRemove}
        onFilesAdded={handleFilesAdded}
      />

      <div class="view-toggle">
        {#each viewModes as { mode, icon: Icon, label }}
          <button
            class="mode-btn"
            class:active={viewMode === mode}
            onclick={() => (viewMode = mode)}
            title={label}
          >
            <Icon size={16} />
          </button>
        {/each}
      </div>
    </div>
  </main>
</div>

<style>
  .app-layout {
    display: flex;
    min-height: 100vh;
    background: var(--color-background);
  }

  .main-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 0.75rem;
    gap: 0.75rem;
    max-height: 100vh;
    overflow: hidden;
  }

  .workspace {
    flex: 1;
    min-height: 0;
  }

  /* Bottom bar with files + mode toggle */
  .bottom-bar {
    display: flex;
    gap: 0.5rem;
    align-items: stretch;
  }

  .bottom-bar :global(.file-bar) {
    flex: 1;
  }

  .view-toggle {
    display: flex;
    gap: 0.125rem;
    padding: 0.25rem;
    background: var(--color-surface);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    align-self: center;
  }

  .mode-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: none;
    background: transparent;
    color: var(--color-muted-foreground);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .mode-btn:hover {
    color: var(--color-foreground);
  }
  .mode-btn.active {
    background: var(--color-brand);
    color: white;
  }

  /* Single View */
  .single-layout {
    display: grid;
    grid-template-columns: 1fr 260px;
    gap: 0.75rem;
    height: 100%;
  }

  .canvas-area {
    position: relative;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    overflow: hidden;
  }

  .canvas-placeholder {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-muted-foreground);
  }

  .control-sidebar {
    overflow-y: auto;
  }

  /* Grid View */
  .grid-layout {
    display: grid;
    grid-template-columns: 1fr 220px;
    gap: 0.75rem;
    height: 100%;
  }

  .grid-area {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    overflow-y: auto;
    padding: 0.75rem;
  }

  .thumbnail-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 1rem;
  }

  @media (max-width: 1400px) {
    .thumbnail-grid {
      grid-template-columns: repeat(3, 1fr);
    }
  }

  @media (max-width: 1100px) {
    .thumbnail-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (max-width: 700px) {
    .thumbnail-grid {
      grid-template-columns: 1fr;
    }
  }

  .thumbnail-card {
    background: var(--color-background);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all 0.15s ease;
    overflow: hidden;
    aspect-ratio: 1;
  }

  .thumbnail-card:hover {
    border-color: var(--color-muted-foreground);
  }

  .thumbnail-card.active {
    border-color: var(--color-brand);
  }

  .thumbnail-preview {
    height: calc(100% - 40px);
    position: relative;
  }

  .thumbnail-loading {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-muted-foreground);
  }

  .thumbnail-label {
    padding: 0.5rem;
    display: flex;
    gap: 0.375rem;
    align-items: center;
    border-top: 1px solid var(--color-border);
  }

  .thumbnail-letter {
    font-weight: 600;
    color: var(--color-brand);
  }

  .thumbnail-name {
    font-size: 0.6875rem;
    color: var(--color-muted-foreground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .empty-message {
    color: var(--color-muted-foreground);
    text-align: center;
    padding: 2rem;
  }

  .filter-sidebar {
    padding: 0.75rem;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    overflow-y: auto;
    max-height: 100%;
  }

  .filter-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.75rem;
  }

  .sidebar-title {
    font-weight: 600;
    font-size: 0.75rem;
    color: var(--color-muted-foreground);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 0;
  }

  .clear-filters-btn {
    font-size: 0.6875rem;
    padding: 0.25rem 0.5rem;
    border: none;
    background: transparent;
    color: var(--color-brand);
    cursor: pointer;
    transition: opacity 0.15s ease;
  }

  .clear-filters-btn:hover {
    opacity: 0.7;
  }

  .filter-empty {
    font-size: 0.75rem;
    color: var(--color-muted-foreground);
    margin: 0;
  }

  .filter-group {
    margin-bottom: 1rem;
  }

  .filter-label {
    display: block;
    font-size: 0.6875rem;
    font-weight: 500;
    color: var(--color-muted-foreground);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 0.375rem;
  }

  .filter-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  .filter-chip {
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
    border: 1px solid var(--color-border);
    background: transparent;
    color: var(--color-muted-foreground);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .filter-chip:hover {
    border-color: var(--color-foreground);
    color: var(--color-foreground);
  }

  .filter-chip.active {
    background: var(--color-brand);
    border-color: var(--color-brand);
    color: white;
  }

  .filter-count {
    font-size: 0.75rem;
    color: var(--color-muted-foreground);
    margin: 0.75rem 0 0;
  }

  /* Compare View */
  .compare-layout {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
    height: 100%;
  }

  .compare-panel {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-height: 0;
  }

  .panel-header {
    font-weight: 600;
    font-size: 0.75rem;
    padding: 0.375rem 0.625rem;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    text-align: center;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-muted-foreground);
  }

  .compare-panel .canvas-area {
    flex: 1;
    min-height: 200px;
  }

  .compare-controls {
    max-height: 180px;
    overflow-y: auto;
  }

  @media (max-width: 900px) {
    .single-layout,
    .grid-layout {
      grid-template-columns: 1fr;
    }
    .compare-layout {
      grid-template-columns: 1fr;
    }
  }
</style>
