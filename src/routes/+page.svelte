<script lang="ts">
  import { browser } from "$app/environment";
  import { Canvas } from "@threlte/core";
  import Sidebar from "$lib/components/Sidebar.svelte";
  import FileSelectionBar from "$lib/components/FileSelectionBar.svelte";
  import ControlPanel from "$lib/components/ControlPanel.svelte";
  import PhaseSpaceScene from "$lib/components/PhaseSpaceScene.svelte";
  import OverlayScene from "$lib/components/OverlayScene.svelte";
  import { Maximize2, Grid3x3, GitCompare, Layers } from "@lucide/svelte";
  import type { PhaseSpacePoint } from "$lib/phaseSpaceEmbedding";
  import type {
    AudioFileEntry,
    AnalysisConfig,
    ProcessingMode,
    FormantFrame,
  } from "$lib/audioLibraryTypes";
  import {
    parseFilename,
    generateFileId,
    getDefaultConfig,
  } from "$lib/audioLibraryTypes";

  // ═══════════════════════════════════════════
  // VIEW MODE
  // ═══════════════════════════════════════════
  type ViewMode = "single" | "grid" | "compare" | "overlap";
  let viewMode = $state<ViewMode>("single");

  // Overlay config per file with transforms
  interface OverlayFileConfig {
    fileId: string;
    color: string;
    visible: boolean;
    xrayMode: boolean;
    opacity: number;
    processingMode: ProcessingMode;
    // Per-cloud 3D transforms
    position: [number, number, number];
    rotation: [number, number, number]; // Euler angles in degrees
    scale: number;
  }

  // Currently selected overlay file for editing
  let selectedOverlayId = $state<string | null>(null);
  // NOTE: selectedOverlayFile and selectedOverlayConfig are declared after overlayConfigs

  // Color palette for overlays
  const OVERLAY_COLORS = [
    "#E91E63", // pink
    "#2196F3", // blue
    "#4CAF50", // green
    "#FF9800", // orange
    "#9C27B0", // purple
    "#00BCD4", // cyan
    "#FF5722", // deep orange
    "#607D8B", // gray
  ];

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
  let primaryFormants = $state<[number, number, number] | null>(null);

  // Secondary display state
  let secondaryPoints = $state<PhaseSpacePoint[]>([]);
  let secondaryConfig = $state<AnalysisConfig>(getDefaultConfig());
  let secondaryComputedTau = $state(12);
  let secondaryDuration = $state(0);
  let secondaryFormants = $state<[number, number, number] | null>(null);

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
            file.signalDynamicsPoints = e.data.points;
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
  // RESONANCE WORKER
  // ═══════════════════════════════════════════
  let resonanceWorker: Worker | null = null;
  let pendingResonanceFileId: string | null = null;
  let pendingResonanceSlot: "primary" | "secondary" = "primary";
  let pendingResonanceMode: "lissajous" | "cymatics" | "lissajous-manifold" =
    "lissajous-manifold";

  $effect(() => {
    if (browser && !resonanceWorker) {
      resonanceWorker = new Worker(
        new URL("$lib/resonanceWorker.ts", import.meta.url),
        { type: "module" },
      );

      resonanceWorker.onmessage = (e) => {
        if (e.data.type === "result" && pendingResonanceFileId) {
          const file = fileMap.get(pendingResonanceFileId);
          if (file) {
            // Store in appropriate cache
            if (pendingResonanceMode === "lissajous") {
              file.lissajousPoints = e.data.points;
            } else if (pendingResonanceMode === "lissajous-manifold") {
              file.lissajousManifoldPoints = e.data.points;
            } else {
              file.cymaticsPoints = e.data.points;
            }
            file.formantTrajectory = e.data.formantTrajectory;
            file.isProcessing = false;

            // Update display if this is the active file
            const slot = pendingResonanceSlot;
            const fileId = slot === "primary" ? primaryFileId : secondaryFileId;
            if (fileId === pendingResonanceFileId) {
              if (slot === "primary") {
                primaryPoints = e.data.points;
                if (e.data.formantTrajectory?.length > 0) {
                  const last =
                    e.data.formantTrajectory[
                      e.data.formantTrajectory.length - 1
                    ];
                  primaryFormants = last.formants;
                }
              } else {
                secondaryPoints = e.data.points;
                if (e.data.formantTrajectory?.length > 0) {
                  const last =
                    e.data.formantTrajectory[
                      e.data.formantTrajectory.length - 1
                    ];
                  secondaryFormants = last.formants;
                }
              }
            }
          }
          pendingResonanceFileId = null;
        }
      };
    }
    return () => resonanceWorker?.terminate();
  });

  // ═══════════════════════════════════════════
  // LPC WORKER (Scientific-grade formant extraction)
  // ═══════════════════════════════════════════
  let lpcWorker: Worker | null = null;
  let pendingLpcFileId: string | null = null;
  let pendingLpcSlot: "primary" | "secondary" = "primary";

  $effect(() => {
    if (browser && !lpcWorker) {
      lpcWorker = new Worker(new URL("$lib/lpcWorker.ts", import.meta.url), {
        type: "module",
      });

      lpcWorker.onmessage = (e) => {
        if (e.data.type === "result" && pendingLpcFileId) {
          const file = fileMap.get(pendingLpcFileId);
          if (file) {
            file.lpcVowelSpacePoints = e.data.points;
            file.lpcFormantTrajectory = e.data.formantTrajectory;
            file.isProcessing = false;

            // Update display if this is the active file
            const slot = pendingLpcSlot;
            const fileId = slot === "primary" ? primaryFileId : secondaryFileId;
            if (fileId === pendingLpcFileId) {
              if (slot === "primary") {
                primaryPoints = e.data.points.map(
                  (p: { x: number; y: number; z: number; t: number }) => ({
                    x: p.x,
                    y: p.y,
                    z: p.z,
                    t: p.t,
                  }),
                );
                // LPC formants are in lpcFormantTrajectory, use last frame for display
                if (e.data.formantTrajectory?.length > 0) {
                  const last =
                    e.data.formantTrajectory[
                      e.data.formantTrajectory.length - 1
                    ];
                  primaryFormants = [last.f1, last.f2, last.f3];
                }
              } else {
                secondaryPoints = e.data.points.map(
                  (p: { x: number; y: number; z: number; t: number }) => ({
                    x: p.x,
                    y: p.y,
                    z: p.z,
                    t: p.t,
                  }),
                );
                if (e.data.formantTrajectory?.length > 0) {
                  const last =
                    e.data.formantTrajectory[
                      e.data.formantTrajectory.length - 1
                    ];
                  secondaryFormants = [last.f1, last.f2, last.f3];
                }
              }
            }
          }
          pendingLpcFileId = null;
        }
      };
    }
    return () => lpcWorker?.terminate();
  });

  // Helper: get active points based on processing mode
  function getActivePoints(file: AudioFileEntry): PhaseSpacePoint[] {
    switch (file.config.processingMode) {
      case "signal-dynamics":
        return file.signalDynamicsPoints;
      case "lissajous":
        return file.lissajousPoints;
      case "cymatics":
        return file.cymaticsPoints;
      case "lissajous-manifold":
        return file.lissajousManifoldPoints;
      case "lpc-vowel-space":
        // LPC points have opacity, map to PhaseSpacePoint format
        return file.lpcVowelSpacePoints.map((p) => ({
          x: p.x,
          y: p.y,
          z: p.z,
          t: p.t,
        }));
      default:
        return file.signalDynamicsPoints;
    }
  }

  // Helper: get points for a specific mode (for overlay per-file mode)
  function getPointsForMode(
    file: AudioFileEntry,
    mode: ProcessingMode,
  ): PhaseSpacePoint[] {
    switch (mode) {
      case "signal-dynamics":
        return file.signalDynamicsPoints;
      case "lissajous":
        return file.lissajousPoints;
      case "cymatics":
        return file.cymaticsPoints;
      case "lissajous-manifold":
        return file.lissajousManifoldPoints;
      case "lpc-vowel-space":
        return file.lpcVowelSpacePoints.map((p) => ({
          x: p.x,
          y: p.y,
          z: p.z,
          t: p.t,
        }));
      default:
        return file.signalDynamicsPoints;
    }
  }

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
        signalDynamicsPoints: [],
        lissajousPoints: [],
        cymaticsPoints: [],
        lissajousManifoldPoints: [],
        lpcVowelSpacePoints: [],
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
      primaryFormants = null;
      return;
    }
    if (slot === "secondary" && secondaryFileId === id) {
      secondaryFileId = null;
      secondaryPoints = [];
      secondaryFormants = null;
      return;
    }

    if (slot === "primary") {
      primaryFileId = id;
      primaryPoints = getActivePoints(file);
      primaryConfig = { ...file.config };
      primaryComputedTau = file.computedTau;
      primaryDuration = file.buffer.duration;
      // Set formants if available
      if (file.formantTrajectory?.length) {
        const last = file.formantTrajectory[file.formantTrajectory.length - 1];
        primaryFormants = last.formants;
      } else {
        primaryFormants = null;
      }

      if (getActivePoints(file).length === 0) {
        triggerComputation(file, "primary");
      }
    } else {
      secondaryFileId = id;
      secondaryPoints = getActivePoints(file);
      secondaryConfig = { ...file.config };
      secondaryComputedTau = file.computedTau;
      secondaryDuration = file.buffer.duration;
      if (file.formantTrajectory?.length) {
        const last = file.formantTrajectory[file.formantTrajectory.length - 1];
        secondaryFormants = last.formants;
      } else {
        secondaryFormants = null;
      }

      if (getActivePoints(file).length === 0) {
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
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      file.isProcessing = true;

      const mode = file.config.processingMode;

      if (mode === "signal-dynamics") {
        // Use phase space worker
        if (!worker) return;
        pendingFileId = file.id;
        pendingSlot = slot;

        worker.postMessage({
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
      } else if (mode === "lpc-vowel-space") {
        // Use LPC worker (scientific-grade formant extraction)
        if (!lpcWorker) return;
        pendingLpcFileId = file.id;
        pendingLpcSlot = slot;

        lpcWorker.postMessage({
          type: "compute",
          samples: file.buffer.getChannelData(0),
          sampleRate: file.buffer.sampleRate,
          windowMs: file.config.windowMs,
          maxPoints: 5000,
        });
      } else {
        // Use resonance worker (lissajous, cymatics, lissajous-manifold)
        if (!resonanceWorker) return;
        pendingResonanceFileId = file.id;
        pendingResonanceSlot = slot;
        pendingResonanceMode = mode as
          | "lissajous"
          | "cymatics"
          | "lissajous-manifold";

        resonanceWorker.postMessage({
          type: "compute",
          samples: file.buffer.getChannelData(0),
          sampleRate: file.buffer.sampleRate,
          mode: mode,
          windowMs: file.config.windowMs,
          maxPoints: 5000,
        });
      }
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
      { mode: "overlap", icon: Layers, label: "Overlap" },
    ];

  // ═══════════════════════════════════════════
  // OVERLAP MODE STATE
  // ═══════════════════════════════════════════
  let overlayConfigs = $state<OverlayFileConfig[]>([]);
  let globalXray = $state(true);

  // Selected overlay file derived values (must be after fileMap and overlayConfigs)
  let selectedOverlayFile = $derived(
    selectedOverlayId ? fileMap.get(selectedOverlayId) : null,
  );
  let selectedOverlayConfig = $derived(
    overlayConfigs.find((c) => c.fileId === selectedOverlayId) ?? null,
  );

  // Derived: points for overlay rendering with transforms
  let overlayDatasets = $derived(
    overlayConfigs
      .filter((c) => c.visible)
      .map((c) => {
        const file = fileMap.get(c.fileId);
        return file
          ? {
              id: c.fileId,
              label: file.metadata.rawName,
              points: getPointsForMode(file, c.processingMode),
              color: c.color,
              xrayMode: c.xrayMode,
              opacity: c.opacity,
              position: c.position,
              rotation: c.rotation,
              scale: c.scale,
            }
          : null;
      })
      .filter(
        (d): d is NonNullable<typeof d> => d !== null && d.points.length > 0,
      ),
  );

  function addToOverlay(fileId: string) {
    if (overlayConfigs.some((c) => c.fileId === fileId)) {
      // Already in overlay - toggle selection
      if (selectedOverlayId === fileId) {
        selectedOverlayId = null; // Unselect
      } else {
        selectedOverlayId = fileId; // Select
      }
      return;
    }
    const file = fileMap.get(fileId);
    const colorIndex = overlayConfigs.length % OVERLAY_COLORS.length;
    const defaultMode: ProcessingMode = "lissajous-manifold";
    overlayConfigs = [
      ...overlayConfigs,
      {
        fileId,
        color: OVERLAY_COLORS[colorIndex],
        visible: true,
        xrayMode: globalXray,
        opacity: 0.15,
        processingMode: defaultMode,
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: 1,
      },
    ];

    // Auto-select newly added file
    selectedOverlayId = fileId;

    // Ensure file is computed for the overlay default mode
    if (file && getPointsForMode(file, defaultMode).length === 0) {
      triggerOverlayComputation(file, defaultMode);
    }
  }

  function removeFromOverlay(fileId: string) {
    overlayConfigs = overlayConfigs.filter((c) => c.fileId !== fileId);
    if (selectedOverlayId === fileId) {
      selectedOverlayId =
        overlayConfigs.length > 0 ? overlayConfigs[0].fileId : null;
    }
  }

  function toggleOverlayVisibility(fileId: string) {
    overlayConfigs = overlayConfigs.map((c) =>
      c.fileId === fileId ? { ...c, visible: !c.visible } : c,
    );
  }

  function setOverlayXray(fileId: string, xray: boolean) {
    overlayConfigs = overlayConfigs.map((c) =>
      c.fileId === fileId ? { ...c, xrayMode: xray } : c,
    );
  }

  function setOverlayOpacity(fileId: string, opacity: number) {
    overlayConfigs = overlayConfigs.map((c) =>
      c.fileId === fileId ? { ...c, opacity } : c,
    );
  }

  function setOverlayProcessingMode(fileId: string, mode: ProcessingMode) {
    overlayConfigs = overlayConfigs.map((c) =>
      c.fileId === fileId ? { ...c, processingMode: mode } : c,
    );
    // Ensure the file has computed points for this mode
    const file = fileMap.get(fileId);
    if (file && getPointsForMode(file, mode).length === 0) {
      // Trigger computation for this specific mode without modifying file.config
      triggerOverlayComputation(file, mode);
    }
  }

  // Dedicated computation trigger for overlay (doesn't affect global/single view state)
  function triggerOverlayComputation(
    file: AudioFileEntry,
    mode: ProcessingMode,
  ) {
    file.isProcessing = true;

    if (mode === "signal-dynamics") {
      if (!worker) return;
      pendingFileId = file.id;
      pendingSlot = "primary";

      worker.postMessage({
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
    } else if (mode === "lpc-vowel-space") {
      if (!lpcWorker) return;
      pendingLpcFileId = file.id;
      pendingLpcSlot = "primary";

      lpcWorker.postMessage({
        type: "compute",
        samples: file.buffer.getChannelData(0),
        sampleRate: file.buffer.sampleRate,
        windowMs: file.config.windowMs,
        maxPoints: 5000,
      });
    } else {
      if (!resonanceWorker) return;
      pendingResonanceFileId = file.id;
      pendingResonanceSlot = "primary";
      pendingResonanceMode = mode as
        | "lissajous"
        | "cymatics"
        | "lissajous-manifold";

      resonanceWorker.postMessage({
        type: "compute",
        samples: file.buffer.getChannelData(0),
        sampleRate: file.buffer.sampleRate,
        mode: mode,
        windowMs: file.config.windowMs,
        maxPoints: 5000,
      });
    }
  }

  function toggleGlobalXray() {
    globalXray = !globalXray;
    overlayConfigs = overlayConfigs.map((c) => ({
      ...c,
      xrayMode: globalXray,
    }));
  }

  // Transform functions for overlay clouds
  function setOverlayPosition(fileId: string, axis: 0 | 1 | 2, value: number) {
    overlayConfigs = overlayConfigs.map((c) => {
      if (c.fileId !== fileId) return c;
      const position: [number, number, number] = [...c.position];
      position[axis] = value;
      return { ...c, position };
    });
  }

  function setOverlayRotation(fileId: string, axis: 0 | 1 | 2, value: number) {
    overlayConfigs = overlayConfigs.map((c) => {
      if (c.fileId !== fileId) return c;
      const rotation: [number, number, number] = [...c.rotation];
      rotation[axis] = value;
      return { ...c, rotation };
    });
  }

  function setOverlayScale(fileId: string, scale: number) {
    overlayConfigs = overlayConfigs.map((c) =>
      c.fileId === fileId ? { ...c, scale } : c,
    );
  }

  function resetOverlayTransform(fileId: string) {
    overlayConfigs = overlayConfigs.map((c) =>
      c.fileId === fileId
        ? {
            ...c,
            position: [0, 0, 0] as [number, number, number],
            rotation: [0, 0, 0] as [number, number, number],
            scale: 1,
          }
        : c,
    );
  }
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
                processingMode={primaryConfig.processingMode}
                windowMs={primaryConfig.windowMs}
                formantFrequencies={primaryFormants}
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
                onProcessingModeChange={(v) =>
                  updateConfig("primary", "processingMode", v)}
                onWindowMsChange={(v) => updateConfig("primary", "windowMs", v)}
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
                      {#if browser && getActivePoints(file).length > 0}
                        <Canvas>
                          <PhaseSpaceScene
                            points={getActivePoints(file)}
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
                  processingMode={primaryConfig.processingMode}
                  windowMs={primaryConfig.windowMs}
                  formantFrequencies={primaryFormants}
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
                  onProcessingModeChange={(v) =>
                    updateConfig("primary", "processingMode", v)}
                  onWindowMsChange={(v) =>
                    updateConfig("primary", "windowMs", v)}
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
                  processingMode={secondaryConfig.processingMode}
                  windowMs={secondaryConfig.windowMs}
                  formantFrequencies={secondaryFormants}
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
                  onProcessingModeChange={(v) =>
                    updateConfig("secondary", "processingMode", v)}
                  onWindowMsChange={(v) =>
                    updateConfig("secondary", "windowMs", v)}
                  pointCount={secondaryPoints.length}
                  duration={secondaryDuration}
                />
              </div>
            {/if}
          </div>
        </div>
      {:else if viewMode === "overlap"}
        <!-- OVERLAP VIEW -->
        <div class="overlap-layout">
          <div class="canvas-area overlap-canvas">
            {#if browser}
              <Canvas>
                <OverlayScene datasets={overlayDatasets} />
              </Canvas>
            {/if}
            {#if overlayDatasets.length === 0}
              <div class="canvas-placeholder">
                <p>Add files from the bottom bar ↓</p>
              </div>
            {/if}
          </div>

          <aside class="overlay-sidebar">
            <!-- Section 1: File List -->
            <div class="overlay-files-section">
              <div class="section-header">
                <span class="section-title">Overlay Files</span>
                <div class="header-actions">
                  <button
                    class="header-btn"
                    class:active={globalXray}
                    onclick={toggleGlobalXray}
                    title="Toggle X-ray for all"
                  >
                    X-ray
                  </button>
                </div>
              </div>

              {#if overlayConfigs.length === 0}
                <p class="overlay-empty">Click files below to add</p>
              {:else}
                <div class="overlay-file-list">
                  {#each overlayConfigs as config (config.fileId)}
                    {@const file = fileMap.get(config.fileId)}
                    {#if file}
                      <div
                        class="overlay-file-row"
                        class:focused={selectedOverlayId === config.fileId}
                        onclick={() => (selectedOverlayId = config.fileId)}
                        role="button"
                        tabindex="0"
                        onkeydown={(e) =>
                          e.key === "Enter" &&
                          (selectedOverlayId = config.fileId)}
                      >
                        <!-- Visibility checkbox -->
                        <label class="visibility-check">
                          <input
                            type="checkbox"
                            checked={config.visible}
                            onclick={(e) => e.stopPropagation()}
                            onchange={() =>
                              toggleOverlayVisibility(config.fileId)}
                          />
                        </label>

                        <!-- Color dot & name -->
                        <span
                          class="file-color"
                          style="background: {config.color}"
                        ></span>
                        <span class="file-name"
                          >{file.metadata.letter} - {file.metadata
                            .speakerId}</span
                        >

                        <!-- Inline opacity -->
                        <input
                          type="range"
                          min="0.02"
                          max="0.5"
                          step="0.01"
                          value={config.opacity}
                          oninput={(e) =>
                            setOverlayOpacity(
                              config.fileId,
                              parseFloat(e.currentTarget.value),
                            )}
                          class="inline-opacity"
                          onclick={(e) => e.stopPropagation()}
                        />

                        <!-- Remove button -->
                        <button
                          class="remove-btn"
                          onclick={(e) => {
                            e.stopPropagation();
                            removeFromOverlay(config.fileId);
                          }}
                          title="Remove">×</button
                        >
                      </div>
                    {/if}
                  {/each}
                </div>
              {/if}
            </div>

            <!-- Section 2: Editing Panel for Focused File -->
            {#if selectedOverlayConfig && selectedOverlayFile}
              <div class="editing-section">
                <div class="editing-header">
                  <span class="editing-title">
                    <span
                      class="file-color-sm"
                      style="background: {selectedOverlayConfig.color}"
                    ></span>
                    Editing: {selectedOverlayFile.metadata.letter}
                  </span>
                  <button
                    class="reset-all-btn"
                    onclick={() =>
                      resetOverlayTransform(selectedOverlayConfig.fileId)}
                  >
                    Reset
                  </button>
                </div>

                <!-- Transform Controls -->
                <div class="editing-group">
                  <span class="group-label">Transform</span>

                  <div class="control-row">
                    <span class="row-label">Pos</span>
                    <label
                      >X<input
                        type="range"
                        min="-2"
                        max="2"
                        step="0.05"
                        value={selectedOverlayConfig.position[0]}
                        oninput={(e) =>
                          setOverlayPosition(
                            selectedOverlayConfig.fileId,
                            0,
                            parseFloat(e.currentTarget.value),
                          )}
                      /></label
                    >
                    <label
                      >Y<input
                        type="range"
                        min="-2"
                        max="2"
                        step="0.05"
                        value={selectedOverlayConfig.position[1]}
                        oninput={(e) =>
                          setOverlayPosition(
                            selectedOverlayConfig.fileId,
                            1,
                            parseFloat(e.currentTarget.value),
                          )}
                      /></label
                    >
                    <label
                      >Z<input
                        type="range"
                        min="-2"
                        max="2"
                        step="0.05"
                        value={selectedOverlayConfig.position[2]}
                        oninput={(e) =>
                          setOverlayPosition(
                            selectedOverlayConfig.fileId,
                            2,
                            parseFloat(e.currentTarget.value),
                          )}
                      /></label
                    >
                  </div>

                  <div class="control-row">
                    <span class="row-label">Rot</span>
                    <label
                      >X<input
                        type="range"
                        min="-180"
                        max="180"
                        step="5"
                        value={selectedOverlayConfig.rotation[0]}
                        oninput={(e) =>
                          setOverlayRotation(
                            selectedOverlayConfig.fileId,
                            0,
                            parseFloat(e.currentTarget.value),
                          )}
                      /></label
                    >
                    <label
                      >Y<input
                        type="range"
                        min="-180"
                        max="180"
                        step="5"
                        value={selectedOverlayConfig.rotation[1]}
                        oninput={(e) =>
                          setOverlayRotation(
                            selectedOverlayConfig.fileId,
                            1,
                            parseFloat(e.currentTarget.value),
                          )}
                      /></label
                    >
                    <label
                      >Z<input
                        type="range"
                        min="-180"
                        max="180"
                        step="5"
                        value={selectedOverlayConfig.rotation[2]}
                        oninput={(e) =>
                          setOverlayRotation(
                            selectedOverlayConfig.fileId,
                            2,
                            parseFloat(e.currentTarget.value),
                          )}
                      /></label
                    >
                  </div>

                  <div class="control-row">
                    <span class="row-label">Scale</span>
                    <input
                      type="range"
                      min="0.2"
                      max="3"
                      step="0.1"
                      value={selectedOverlayConfig.scale}
                      oninput={(e) =>
                        setOverlayScale(
                          selectedOverlayConfig.fileId,
                          parseFloat(e.currentTarget.value),
                        )}
                      class="scale-input"
                    />
                    <span class="scale-val"
                      >{selectedOverlayConfig.scale.toFixed(1)}x</span
                    >
                  </div>
                </div>

                <!-- X-ray control for focused file -->
                <div class="editing-group">
                  <span class="group-label">Display</span>
                  <div class="control-row">
                    <label class="toggle-label">
                      <input
                        type="checkbox"
                        checked={selectedOverlayConfig.xrayMode}
                        onchange={() =>
                          setOverlayXray(
                            selectedOverlayConfig.fileId,
                            !selectedOverlayConfig.xrayMode,
                          )}
                      />
                      X-ray Mode
                    </label>
                  </div>
                </div>

                <!-- Processing Mode for focused file -->
                <div class="editing-group">
                  <span class="group-label">Processing</span>
                  <div class="mode-toggle-row">
                    <button
                      class="mode-btn"
                      class:active={selectedOverlayConfig.processingMode ===
                        "signal-dynamics"}
                      onclick={() =>
                        setOverlayProcessingMode(
                          selectedOverlayConfig.fileId,
                          "signal-dynamics",
                        )}
                      title="Signal Dynamics (Takens)"
                    >
                      Signal
                    </button>
                    <button
                      class="mode-btn"
                      class:active={selectedOverlayConfig.processingMode ===
                        "lissajous"}
                      onclick={() =>
                        setOverlayProcessingMode(
                          selectedOverlayConfig.fileId,
                          "lissajous",
                        )}
                      title="Lissajous (Formant Ratios)"
                    >
                      Lissajous
                    </button>
                    <button
                      class="mode-btn featured"
                      class:active={selectedOverlayConfig.processingMode ===
                        "lissajous-manifold"}
                      onclick={() =>
                        setOverlayProcessingMode(
                          selectedOverlayConfig.fileId,
                          "lissajous-manifold",
                        )}
                      title="Manifold (Topology)"
                    >
                      Manifold
                    </button>
                    <button
                      class="mode-btn"
                      class:active={selectedOverlayConfig.processingMode ===
                        "cymatics"}
                      onclick={() =>
                        setOverlayProcessingMode(
                          selectedOverlayConfig.fileId,
                          "cymatics",
                        )}
                      title="Cymatics (Chladni)"
                    >
                      Cymatics
                    </button>
                    <button
                      class="mode-btn scientific"
                      class:active={selectedOverlayConfig.processingMode ===
                        "lpc-vowel-space"}
                      onclick={() =>
                        setOverlayProcessingMode(
                          selectedOverlayConfig.fileId,
                          "lpc-vowel-space",
                        )}
                      title="LPC (Scientific)"
                    >
                      LPC
                    </button>
                  </div>
                </div>
              </div>
            {:else if overlayConfigs.length > 0}
              <div class="editing-placeholder">
                <p>Click a file above to edit</p>
              </div>
            {/if}
          </aside>
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
        isOverlayMode={viewMode === "overlap"}
        overlayFileIds={overlayConfigs.map((c) => c.fileId)}
        onFileSelect={(id, slot) => {
          if (viewMode === "overlap") {
            addToOverlay(id);
          } else {
            selectFile(id, slot);
          }
        }}
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
  .mode-btn.featured.active {
    background: var(--amber, #f59e0b);
    color: var(--amber-foreground, #1c1917);
  }
  .mode-btn.scientific.active {
    background: oklch(0.65 0.18 250); /* Scientific blue */
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
    .compare-layout,
    .overlap-layout {
      grid-template-columns: 1fr;
    }
  }

  /* Overlap View */
  .overlap-layout {
    display: grid;
    grid-template-columns: 1fr 280px;
    gap: 0.75rem;
    height: 100%;
  }

  .overlap-canvas {
    min-height: 400px;
  }

  /* Overlay Sidebar */
  .overlay-sidebar {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    overflow: hidden;
  }

  .overlay-files-section {
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .section-title {
    font-size: 0.6875rem;
    font-weight: 600;
    color: var(--color-foreground);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .header-actions {
    display: flex;
    gap: 0.25rem;
  }

  .header-btn {
    font-size: 0.625rem;
    padding: 0.2rem 0.4rem;
    border: 1px solid var(--color-border);
    background: transparent;
    color: var(--color-muted-foreground);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .header-btn.active {
    background: var(--color-brand);
    border-color: var(--color-brand);
    color: white;
  }

  .overlay-empty {
    font-size: 0.75rem;
    color: var(--color-muted-foreground);
    text-align: center;
    padding: 0.5rem;
  }

  .overlay-file-list {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    max-height: 180px;
    overflow-y: auto;
  }

  .overlay-file-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.5rem;
    background: var(--color-background);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .overlay-file-row:hover {
    border-color: var(--color-muted-foreground);
  }

  .overlay-file-row.focused {
    border-color: var(--color-brand);
    background: color-mix(
      in srgb,
      var(--color-brand) 8%,
      var(--color-background)
    );
  }

  .visibility-check {
    display: flex;
    align-items: center;
  }

  .visibility-check input {
    width: 14px;
    height: 14px;
    cursor: pointer;
    accent-color: var(--color-brand);
  }

  .file-color {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .file-name {
    flex: 1;
    font-size: 0.75rem;
    color: var(--color-foreground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .inline-opacity {
    width: 50px;
    height: 4px;
    appearance: none;
    background: var(--color-border);
    border-radius: 2px;
    cursor: pointer;
  }

  .inline-opacity::-webkit-slider-thumb {
    appearance: none;
    width: 8px;
    height: 8px;
    background: var(--color-brand);
    border-radius: 50%;
  }

  .remove-btn {
    width: 18px;
    height: 18px;
    border: none;
    background: transparent;
    color: var(--color-muted-foreground);
    cursor: pointer;
    font-size: 1rem;
    line-height: 1;
    opacity: 0;
    transition: all 0.15s ease;
  }

  .overlay-file-row:hover .remove-btn {
    opacity: 1;
  }

  .remove-btn:hover {
    color: var(--color-destructive);
  }

  /* Editing Section */
  .editing-section {
    padding: 0.75rem;
    border-top: 1px solid var(--color-border);
    background: var(--color-background);
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    flex: 1;
    overflow-y: auto;
  }

  .editing-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .editing-title {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--color-foreground);
  }

  .file-color-sm {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .reset-all-btn {
    font-size: 0.625rem;
    padding: 0.2rem 0.4rem;
    border: 1px solid var(--color-border);
    background: transparent;
    color: var(--color-muted-foreground);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .reset-all-btn:hover {
    border-color: var(--color-foreground);
    color: var(--color-foreground);
  }

  .editing-group {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .group-label {
    font-size: 0.625rem;
    color: var(--color-muted-foreground);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .control-row {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    flex-wrap: wrap;
  }

  .row-label {
    font-size: 0.625rem;
    color: var(--color-muted-foreground);
    width: 2rem;
  }

  .control-row label {
    display: flex;
    align-items: center;
    gap: 0.125rem;
    font-size: 0.625rem;
    color: var(--color-foreground);
    flex: 1;
  }

  .control-row input[type="range"] {
    flex: 1;
    height: 4px;
    appearance: none;
    background: var(--color-border);
    border-radius: 2px;
    cursor: pointer;
    min-width: 40px;
  }

  .control-row input[type="range"]::-webkit-slider-thumb {
    appearance: none;
    width: 10px;
    height: 10px;
    background: var(--color-brand);
    border-radius: 50%;
  }

  .scale-input {
    flex: 1;
  }

  .scale-val {
    font-size: 0.625rem;
    color: var(--color-muted-foreground);
    min-width: 2rem;
    text-align: right;
  }

  .toggle-label {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.75rem;
    color: var(--color-foreground);
    cursor: pointer;
  }

  .toggle-label input {
    width: 14px;
    height: 14px;
    accent-color: var(--color-brand);
  }

  .editing-placeholder {
    padding: 1rem;
    text-align: center;
    border-top: 1px solid var(--color-border);
  }

  .editing-placeholder p {
    font-size: 0.75rem;
    color: var(--color-muted-foreground);
  }

  .mode-toggle-row {
    display: flex;
    gap: 0.25rem;
  }

  .mode-btn {
    flex: 1;
    padding: 0.375rem 0.25rem;
    font-size: 0.625rem;
    font-weight: 500;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    color: var(--color-muted-foreground);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .mode-btn:hover {
    border-color: var(--color-foreground);
    color: var(--color-foreground);
  }

  .mode-btn.active {
    background: var(--color-brand);
    border-color: var(--color-brand);
    color: var(--color-brand-foreground);
  }
</style>
