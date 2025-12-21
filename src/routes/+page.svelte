<script lang="ts">
  import { browser } from "$app/environment";
  import { Canvas } from "@threlte/core";
  import Sidebar from "$lib/components/Sidebar.svelte";
  import AudioDropZone from "$lib/components/AudioDropZone.svelte";
  import ControlPanel from "$lib/components/ControlPanel.svelte";
  import PhaseSpaceScene from "$lib/components/PhaseSpaceScene.svelte";
  import type { PhaseSpacePoint } from "$lib/phaseSpaceEmbedding";

  // State
  let audioFile = $state<File | null>(null);
  let audioBuffer = $state<AudioBuffer | null>(null);
  let points = $state<PhaseSpacePoint[]>([]);
  let isComputing = $state(false);

  // Parameters (UI values)
  let tau = $state(12);
  let smoothing = $state(3);
  let normalize = $state(true);
  let showPath = $state(true);

  // Web Worker for off-thread computation
  let worker: Worker | null = null;

  // Initialize worker on client side
  $effect(() => {
    if (browser && !worker) {
      worker = new Worker(
        new URL("$lib/phaseSpaceWorker.ts", import.meta.url),
        { type: "module" },
      );

      worker.onmessage = (e) => {
        if (e.data.type === "result") {
          points = e.data.points;
          isComputing = false;
        }
      };
    }

    return () => {
      worker?.terminate();
    };
  });

  // Debounced parameters (for computation)
  let debouncedTau = $state(12);
  let debouncedSmoothing = $state(3);
  let debouncedNormalize = $state(true);
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // Debounce ALL parameter changes (100ms delay)
  $effect(() => {
    const currentTau = tau;
    const currentSmoothing = smoothing;
    const currentNormalize = normalize;

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debouncedTau = currentTau;
      debouncedSmoothing = currentSmoothing;
      debouncedNormalize = currentNormalize;
    }, 100);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  });

  // Send work to Web Worker when debounced parameters change
  $effect(() => {
    if (!audioBuffer || !worker) {
      points = [];
      return;
    }

    // Use debounced values
    const currentTau = debouncedTau;
    const currentSmoothing = debouncedSmoothing;
    const shouldNormalize = debouncedNormalize;

    isComputing = true;

    // Get samples and send to worker
    const samples = audioBuffer.getChannelData(0);

    worker.postMessage({
      type: "compute",
      samples: samples,
      tau: currentTau,
      smoothing: currentSmoothing,
      normalize: shouldNormalize,
      maxPoints: 6000, // Reduced for smoother rendering
    });
  });

  function handleAudioLoaded(buffer: AudioBuffer, file: File) {
    audioBuffer = buffer;
    audioFile = file;
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
              <PhaseSpaceScene {points} {showPath} />
            </Canvas>
          {/if}

          {#if points.length === 0}
            <div class="canvas-overlay">
              <p>Drop an audio file to visualize its phase space</p>
            </div>
          {/if}
        </div>
      </div>

      <!-- Right Panel -->
      <aside class="right-panel">
        <AudioDropZone {audioFile} onAudioLoaded={handleAudioLoaded} />

        {#if audioBuffer}
          <ControlPanel
            {tau}
            {smoothing}
            {normalize}
            {showPath}
            onTauChange={(v) => (tau = v)}
            onSmoothingChange={(v) => (smoothing = v)}
            onNormalizeChange={(v) => (normalize = v)}
            onShowPathChange={(v) => (showPath = v)}
            pointCount={points.length}
            duration={audioBuffer.duration}
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
    font-weight: 700;
    margin: 0;
    color: var(--color-foreground);
    letter-spacing: -0.02em;
  }

  .page-subtitle {
    font-size: 0.9375rem;
    margin: 0;
    color: var(--color-muted-foreground);
  }

  .content-grid {
    flex: 1;
    display: grid;
    grid-template-columns: 1fr 320px;
    gap: 1.5rem;
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
    border: 1px solid var(--color-border);
    overflow: hidden;
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
    font-size: 0.9375rem;
    color: var(--color-muted-foreground);
    background: color-mix(in srgb, var(--color-background) 80%, transparent);
    padding: 0.75rem 1.25rem;
    border-radius: var(--radius-md);
    backdrop-filter: blur(4px);
  }

  .right-panel {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  @media (max-width: 1024px) {
    .content-grid {
      grid-template-columns: 1fr;
    }

    .canvas-section {
      min-height: 50vh;
    }
  }
</style>
