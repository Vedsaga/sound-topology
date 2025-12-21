<script lang="ts">
  import { browser } from "$app/environment";
  import { Canvas } from "@threlte/core";
  import Sidebar from "$lib/components/Sidebar.svelte";
  import AudioLibrary from "$lib/components/AudioLibrary.svelte";
  import ControlPanel from "$lib/components/ControlPanel.svelte";
  import PhaseSpaceScene from "$lib/components/PhaseSpaceScene.svelte";
  import type { PhaseSpacePoint } from "$lib/phaseSpaceEmbedding";
  import type { AudioFileEntry, AnalysisConfig } from "$lib/audioLibraryTypes";
  import {
    parseFilename,
    generateFileId,
    getDefaultConfig,
  } from "$lib/audioLibraryTypes";

  // ═══════════════════════════════════════════
  // STABLE STATE (avoid $derived chains)
  // ═══════════════════════════════════════════

  // File storage (use Map for O(1) lookup without array recreation)
  let fileMap = $state(new Map<string, AudioFileEntry>());
  let fileOrder = $state<string[]>([]); // Just IDs for ordering
  let activeFileId = $state<string | null>(null);
  let libraryViewMode = $state<"list" | "grid">("list");

  // Display-only state (doesn't trigger computation)
  let showPath = $state(true);

  // Current visualization state (only updates when switching files or computation completes)
  let currentPoints = $state<PhaseSpacePoint[]>([]);
  let currentComputedTau = $state(12);
  let currentConfig = $state<AnalysisConfig>(getDefaultConfig());
  let currentDuration = $state(0);

  // Derive files array only when needed for display
  let audioFiles = $derived(
    fileOrder.map((id) => fileMap.get(id)!).filter(Boolean),
  );

  // ═══════════════════════════════════════════
  // WEB WORKER
  // ═══════════════════════════════════════════
  let worker: Worker | null = null;
  let pendingFileId: string | null = null;

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
            // Update file in map (mutate directly, Map is mutable)
            file.points = e.data.points;
            file.computedTau = e.data.computedTau;
            file.isProcessing = false;

            // If this is the active file, update display state
            if (pendingFileId === activeFileId) {
              currentPoints = e.data.points;
              currentComputedTau = e.data.computedTau;
            }
          }
          pendingFileId = null;
        }
      };
    }

    return () => {
      worker?.terminate();
    };
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

    // Auto-select first if none selected
    if (!activeFileId && newIds.length > 0) {
      selectFile(newIds[0]);
    }
  }

  function selectFile(id: string) {
    const file = fileMap.get(id);
    if (!file) return;

    activeFileId = id;

    // Update display state from file
    currentPoints = file.points;
    currentComputedTau = file.computedTau;
    currentConfig = { ...file.config };
    currentDuration = file.buffer.duration;

    // Trigger computation if needed
    if (file.points.length === 0 || file.isProcessing) {
      triggerComputation(file);
    }
  }

  function handleFileRemove(id: string) {
    fileMap.delete(id);
    fileOrder = fileOrder.filter((fid) => fid !== id);

    if (activeFileId === id) {
      if (fileOrder.length > 0) {
        selectFile(fileOrder[0]);
      } else {
        activeFileId = null;
        currentPoints = [];
      }
    }
  }

  // ═══════════════════════════════════════════
  // COMPUTATION
  // ═══════════════════════════════════════════
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  function triggerComputation(file: AudioFileEntry) {
    if (!worker) return;

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      pendingFileId = file.id;
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
    key: K,
    value: AnalysisConfig[K],
  ) {
    if (!activeFileId) return;
    const file = fileMap.get(activeFileId);
    if (!file) return;

    // Update file config
    file.config[key] = value;

    // Update display state
    currentConfig = { ...file.config };

    // Trigger recomputation
    triggerComputation(file);
  }
</script>

<svelte:head>
  <title>Sound Topology - Phase Space Explorer</title>
  <meta
    name="description"
    content="Explore the topological structure of sound using Takens' Embedding Theorem"
  />
</svelte:head>

<div class="app-layout">
  <Sidebar currentView="phase-space" />

  <main class="main-content">
    <header class="header">
      <div class="header-left">
        <h1 class="page-title">Phase Space Explorer</h1>
        <p class="page-subtitle">Visualize the attractor geometry of sound</p>
      </div>
    </header>

    <div class="content-grid">
      <!-- 3D Canvas -->
      <div class="canvas-section">
        <div class="canvas-container bg-noise">
          {#if browser}
            <Canvas>
              <PhaseSpaceScene
                points={currentPoints}
                {showPath}
                xrayMode={currentConfig.xrayMode}
                opacity={currentConfig.opacity}
              />
            </Canvas>
          {/if}

          {#if currentPoints.length === 0}
            <div class="canvas-overlay">
              <p>Drop audio files to visualize their phase space</p>
            </div>
          {/if}
        </div>
      </div>

      <!-- Right Panel -->
      <aside class="right-panel">
        <AudioLibrary
          files={audioFiles}
          {activeFileId}
          viewMode={libraryViewMode}
          onFilesAdded={handleFilesAdded}
          onFileSelect={selectFile}
          onFileRemove={handleFileRemove}
          onViewModeChange={(mode) => (libraryViewMode = mode)}
        />

        {#if activeFileId}
          <ControlPanel
            tau={currentConfig.tau}
            computedTau={currentComputedTau}
            smoothing={currentConfig.smoothing}
            normalize={currentConfig.normalize}
            {showPath}
            preprocess={currentConfig.preprocess}
            autoTau={currentConfig.autoTau}
            pcaAlign={currentConfig.pcaAlign}
            xrayMode={currentConfig.xrayMode}
            opacity={currentConfig.opacity}
            onTauChange={(v) => updateConfig("tau", v)}
            onSmoothingChange={(v) => updateConfig("smoothing", v)}
            onNormalizeChange={(v) => updateConfig("normalize", v)}
            onShowPathChange={(v) => (showPath = v)}
            onPreprocessChange={(v) => updateConfig("preprocess", v)}
            onAutoTauChange={(v) => updateConfig("autoTau", v)}
            onPcaAlignChange={(v) => updateConfig("pcaAlign", v)}
            onXrayModeChange={(v) => updateConfig("xrayMode", v)}
            onOpacityChange={(v) => updateConfig("opacity", v)}
            pointCount={currentPoints.length}
            duration={currentDuration}
          />
        {/if}
      </aside>
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
    padding: 1.5rem 2rem;
    max-height: 100vh;
    overflow: hidden;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 1.5rem;
  }

  .header-left {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .page-title {
    font-size: 1.5rem;
    font-weight: 600;
    margin: 0;
    color: var(--color-foreground);
  }

  .page-subtitle {
    font-size: 0.875rem;
    color: var(--color-muted-foreground);
    margin: 0;
  }

  .content-grid {
    display: grid;
    grid-template-columns: 1fr 320px;
    gap: 1.5rem;
    flex: 1;
    min-height: 0;
  }

  .canvas-section {
    position: relative;
    min-height: 400px;
  }

  .canvas-container {
    position: absolute;
    inset: 0;
    border-radius: var(--radius-lg);
    overflow: hidden;
    border: 1px solid var(--color-border);
  }

  .canvas-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }

  .canvas-overlay p {
    color: var(--color-muted-foreground);
    font-size: 0.875rem;
    background: color-mix(in srgb, var(--color-background) 80%, transparent);
    padding: 0.75rem 1.25rem;
    border-radius: var(--radius-md);
    backdrop-filter: blur(4px);
  }

  .right-panel {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    overflow-y: auto;
    max-height: 100%;
  }

  @media (max-width: 900px) {
    .content-grid {
      grid-template-columns: 1fr;
    }

    .canvas-section {
      min-height: 300px;
    }
  }
</style>
