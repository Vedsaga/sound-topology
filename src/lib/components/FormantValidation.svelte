<script lang="ts">
    import { onMount } from "svelte";
    import {
        generateTestVowels,
        generatePureTone,
        generateChirp,
        REFERENCE_VOWELS,
        SANSKRIT_VOWELS,
        synthesizeVowelSourceFilter,
        type SynthesizedVowel,
        type FormantSpec,
    } from "$lib/testSignalGenerator";

    // Validation results
    interface ValidationResult {
        name: string;
        expected: { f1: number; f2: number; f3: number };
        extracted: { f1: number; f2: number; f3: number };
        errors: { f1: number; f2: number; f3: number }; // Percentage error
        passed: boolean;
    }

    let results: ValidationResult[] = [];
    let isRunning = false;
    let progress = 0;
    let selectedVowelSet: "reference" | "sanskrit" = "reference";
    let errorThreshold = 15; // Percentage error threshold for pass/fail
    let lpcWorker: Worker | null = null;
    let resonanceWorker: Worker | null = null;
    let currentAudio: AudioBuffer | null = null;
    let audioContext: AudioContext | null = null;

    // Stats
    let avgError = { f1: 0, f2: 0, f3: 0 };
    let passRate = 0;

    onMount(() => {
        // Initialize workers
        lpcWorker = new Worker(new URL("$lib/lpcWorker.ts", import.meta.url), {
            type: "module",
        });
        resonanceWorker = new Worker(
            new URL("$lib/resonanceWorker.ts", import.meta.url),
            { type: "module" },
        );
        audioContext = new AudioContext();

        return () => {
            lpcWorker?.terminate();
            resonanceWorker?.terminate();
            audioContext?.close();
        };
    });

    /**
     * Extract formants using LPC worker
     */
    async function extractFormantsLPC(
        samples: Float32Array,
        sampleRate: number,
    ): Promise<{ f1: number; f2: number; f3: number }> {
        return new Promise((resolve) => {
            if (!lpcWorker) {
                resolve({ f1: 0, f2: 0, f3: 0 });
                return;
            }

            const handler = (e: MessageEvent) => {
                lpcWorker!.removeEventListener("message", handler);
                const trajectory = e.data.formantTrajectory;

                if (trajectory.length === 0) {
                    resolve({ f1: 0, f2: 0, f3: 0 });
                    return;
                }

                // Average formants across all frames
                let f1 = 0,
                    f2 = 0,
                    f3 = 0;
                for (const frame of trajectory) {
                    f1 += frame.f1;
                    f2 += frame.f2;
                    f3 += frame.f3;
                }
                resolve({
                    f1: f1 / trajectory.length,
                    f2: f2 / trajectory.length,
                    f3: f3 / trajectory.length,
                });
            };

            lpcWorker.addEventListener("message", handler);
            lpcWorker.postMessage({
                type: "compute",
                samples,
                sampleRate,
                windowMs: 25,
                maxPoints: 5000,
            });
        });
    }

    /**
     * Extract formants using Resonance worker (FFT-based)
     */
    async function extractFormantsResonance(
        samples: Float32Array,
        sampleRate: number,
    ): Promise<{ f1: number; f2: number; f3: number }> {
        return new Promise((resolve) => {
            if (!resonanceWorker) {
                resolve({ f1: 0, f2: 0, f3: 0 });
                return;
            }

            const handler = (e: MessageEvent) => {
                resonanceWorker!.removeEventListener("message", handler);
                const trajectory = e.data.formantTrajectory;

                if (trajectory.length === 0) {
                    resolve({ f1: 0, f2: 0, f3: 0 });
                    return;
                }

                // Average formants
                let f1 = 0,
                    f2 = 0,
                    f3 = 0;
                for (const frame of trajectory) {
                    f1 += frame.formants[0];
                    f2 += frame.formants[1];
                    f3 += frame.formants[2];
                }
                resolve({
                    f1: f1 / trajectory.length,
                    f2: f2 / trajectory.length,
                    f3: f3 / trajectory.length,
                });
            };

            resonanceWorker.addEventListener("message", handler);
            resonanceWorker.postMessage({
                type: "compute",
                samples,
                sampleRate,
                mode: "lissajous",
                windowMs: 25,
                maxPoints: 5000,
            });
        });
    }

    /**
     * Calculate percentage error
     */
    function percentError(expected: number, actual: number): number {
        if (expected === 0) return actual === 0 ? 0 : 100;
        return Math.abs((actual - expected) / expected) * 100;
    }

    /**
     * Run validation suite
     */
    async function runValidation() {
        if (isRunning) return;
        isRunning = true;
        results = [];
        progress = 0;

        const vowelSet =
            selectedVowelSet === "reference"
                ? REFERENCE_VOWELS
                : SANSKRIT_VOWELS;
        const vowelKeys = Object.keys(vowelSet);
        const totalTests = vowelKeys.length * 2; // LPC + Resonance for each

        for (let i = 0; i < vowelKeys.length; i++) {
            const key = vowelKeys[i];
            const formants = vowelSet[key];

            // Synthesize test signal
            const samples = synthesizeVowelSourceFilter(formants, {
                sampleRate: 44100,
                duration: 0.5,
                f0: 120,
            });

            // Test LPC extraction
            const lpcResult = await extractFormantsLPC(samples, 44100);
            const lpcErrors = {
                f1: percentError(formants.f1, lpcResult.f1),
                f2: percentError(formants.f2, lpcResult.f2),
                f3: percentError(formants.f3, lpcResult.f3),
            };

            results.push({
                name: `${key} (LPC)`,
                expected: { f1: formants.f1, f2: formants.f2, f3: formants.f3 },
                extracted: lpcResult,
                errors: lpcErrors,
                passed:
                    lpcErrors.f1 < errorThreshold &&
                    lpcErrors.f2 < errorThreshold &&
                    lpcErrors.f3 < errorThreshold,
            });

            progress = ((i * 2 + 1) / totalTests) * 100;

            // Test Resonance extraction
            const resResult = await extractFormantsResonance(samples, 44100);
            const resErrors = {
                f1: percentError(formants.f1, resResult.f1),
                f2: percentError(formants.f2, resResult.f2),
                f3: percentError(formants.f3, resResult.f3),
            };

            results.push({
                name: `${key} (FFT)`,
                expected: { f1: formants.f1, f2: formants.f2, f3: formants.f3 },
                extracted: resResult,
                errors: resErrors,
                passed:
                    resErrors.f1 < errorThreshold &&
                    resErrors.f2 < errorThreshold &&
                    resErrors.f3 < errorThreshold,
            });

            progress = ((i * 2 + 2) / totalTests) * 100;
            results = results; // Trigger reactivity
        }

        // Calculate stats
        const passed = results.filter((r) => r.passed).length;
        passRate = (passed / results.length) * 100;

        avgError = {
            f1:
                results.reduce((sum, r) => sum + r.errors.f1, 0) /
                results.length,
            f2:
                results.reduce((sum, r) => sum + r.errors.f2, 0) /
                results.length,
            f3:
                results.reduce((sum, r) => sum + r.errors.f3, 0) /
                results.length,
        };

        isRunning = false;
    }

    /**
     * Play synthesized vowel
     */
    async function playVowel(formants: FormantSpec) {
        if (!audioContext) return;

        const samples = synthesizeVowelSourceFilter(formants, {
            sampleRate: audioContext.sampleRate,
            duration: 0.5,
            f0: 120,
        });

        const buffer = audioContext.createBuffer(
            1,
            samples.length,
            audioContext.sampleRate,
        );
        buffer.getChannelData(0).set(samples);

        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContext.destination);
        source.start();
    }

    /**
     * Export results as CSV
     */
    function exportCSV() {
        const headers =
            "Vowel,Method,Expected F1,Expected F2,Expected F3,Extracted F1,Extracted F2,Extracted F3,Error F1 %,Error F2 %,Error F3 %,Passed\n";
        const rows = results
            .map(
                (r) =>
                    `${r.name},${r.expected.f1},${r.expected.f2},${r.expected.f3},${r.extracted.f1.toFixed(1)},${r.extracted.f2.toFixed(1)},${r.extracted.f3.toFixed(1)},${r.errors.f1.toFixed(1)},${r.errors.f2.toFixed(1)},${r.errors.f3.toFixed(1)},${r.passed}`,
            )
            .join("\n");

        const blob = new Blob([headers + rows], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "formant_validation_results.csv";
        a.click();
        URL.revokeObjectURL(url);
    }
</script>

<div class="validation-panel">
    <h2>🔬 Formant Extraction Validation</h2>
    <p class="description">
        Synthesize test signals with KNOWN formants and verify extraction
        accuracy. This validates that your formant analysis is working
        correctly.
    </p>

    <div class="controls">
        <div class="control-group">
            <label>
                Vowel Set:
                <select bind:value={selectedVowelSet}>
                    <option value="reference"
                        >IPA Reference (Peterson & Barney)</option
                    >
                    <option value="sanskrit">Sanskrit Vowels</option>
                </select>
            </label>
        </div>

        <div class="control-group">
            <label>
                Error Threshold:
                <input
                    type="range"
                    min="5"
                    max="30"
                    bind:value={errorThreshold}
                />
                <span>{errorThreshold}%</span>
            </label>
        </div>

        <button on:click={runValidation} disabled={isRunning}>
            {isRunning ? "Running..." : "▶ Run Validation"}
        </button>

        {#if results.length > 0}
            <button on:click={exportCSV}>📥 Export CSV</button>
        {/if}
    </div>

    {#if isRunning}
        <div class="progress-bar">
            <div class="progress-fill" style="width: {progress}%"></div>
        </div>
    {/if}

    {#if results.length > 0}
        <div
            class="summary"
            class:pass={passRate >= 80}
            class:warn={passRate >= 50 && passRate < 80}
            class:fail={passRate < 50}
        >
            <h3>Summary</h3>
            <div class="stats">
                <div class="stat">
                    <span class="label">Pass Rate:</span>
                    <span class="value">{passRate.toFixed(1)}%</span>
                </div>
                <div class="stat">
                    <span class="label">Avg F1 Error:</span>
                    <span class="value">{avgError.f1.toFixed(1)}%</span>
                </div>
                <div class="stat">
                    <span class="label">Avg F2 Error:</span>
                    <span class="value">{avgError.f2.toFixed(1)}%</span>
                </div>
                <div class="stat">
                    <span class="label">Avg F3 Error:</span>
                    <span class="value">{avgError.f3.toFixed(1)}%</span>
                </div>
            </div>
        </div>

        <div class="results-table">
            <table>
                <thead>
                    <tr>
                        <th>Vowel</th>
                        <th>Expected (F1/F2/F3)</th>
                        <th>Extracted (F1/F2/F3)</th>
                        <th>Error %</th>
                        <th>Status</th>
                        <th>Play</th>
                    </tr>
                </thead>
                <tbody>
                    {#each results as result}
                        <tr
                            class:passed={result.passed}
                            class:failed={!result.passed}
                        >
                            <td class="vowel-name">{result.name}</td>
                            <td class="formants">
                                {result.expected.f1} / {result.expected.f2} / {result
                                    .expected.f3}
                            </td>
                            <td class="formants">
                                {result.extracted.f1.toFixed(0)} / {result.extracted.f2.toFixed(
                                    0,
                                )} / {result.extracted.f3.toFixed(0)}
                            </td>
                            <td class="errors">
                                <span
                                    class:high={result.errors.f1 >
                                        errorThreshold}
                                    >{result.errors.f1.toFixed(1)}</span
                                >
                                /
                                <span
                                    class:high={result.errors.f2 >
                                        errorThreshold}
                                    >{result.errors.f2.toFixed(1)}</span
                                >
                                /
                                <span
                                    class:high={result.errors.f3 >
                                        errorThreshold}
                                    >{result.errors.f3.toFixed(1)}</span
                                >
                            </td>
                            <td class="status">
                                {result.passed ? "✅" : "❌"}
                            </td>
                            <td>
                                <button
                                    class="play-btn"
                                    on:click={() => playVowel(result.expected)}
                                >
                                    🔊
                                </button>
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>

        <!-- F1 vs F2 Scatter Plot - Key Diagnostic -->
        <div class="scatter-section">
            <h3>📊 F1 vs F2 Scatter Plot (Vowel Space)</h3>
            <p class="scatter-description">
                This is the critical diagnostic: if vowels cluster correctly,
                formant extraction works. ● = Expected formants, ▲ = Extracted
                formants. Lines connect expected → extracted.
            </p>
            <div class="scatter-plot-container">
                <svg class="scatter-plot" viewBox="0 0 500 400">
                    <!-- Axes labels -->
                    <text x="250" y="395" class="axis-label"
                        >F1 (Hz) - Opening →</text
                    >
                    <text
                        x="10"
                        y="200"
                        class="axis-label"
                        transform="rotate(-90, 10, 200)"
                        >F2 (Hz) - Frontness →</text
                    >

                    <!-- Grid lines -->
                    {#each [200, 400, 600, 800, 1000] as f1}
                        {@const x = ((f1 - 200) / 800) * 450 + 25}
                        <line
                            x1={x}
                            y1="20"
                            x2={x}
                            y2="360"
                            class="grid-line"
                        />
                        <text {x} y="375" class="tick-label">{f1}</text>
                    {/each}
                    {#each [500, 1000, 1500, 2000, 2500, 3000] as f2}
                        {@const y = 360 - ((f2 - 500) / 2500) * 340}
                        <line
                            x1="25"
                            y1={y}
                            x2="475"
                            y2={y}
                            class="grid-line"
                        />
                        <text x="15" y={y + 4} class="tick-label f2-tick"
                            >{f2}</text
                        >
                    {/each}

                    <!-- Vowel quadrant labels -->
                    <text x="100" y="60" class="quadrant-label"
                        >/i/ zone (front-close)</text
                    >
                    <text x="350" y="60" class="quadrant-label"
                        >/u/ zone (back-close)</text
                    >
                    <text x="100" y="340" class="quadrant-label"
                        >/æ/ zone (front-open)</text
                    >
                    <text x="350" y="340" class="quadrant-label"
                        >/ɑ/ zone (back-open)</text
                    >

                    <!-- Plot points -->
                    {#each results as result, i}
                        {@const expectedX =
                            ((result.expected.f1 - 200) / 800) * 450 + 25}
                        {@const expectedY =
                            360 - ((result.expected.f2 - 500) / 2500) * 340}
                        {@const extractedX =
                            ((result.extracted.f1 - 200) / 800) * 450 + 25}
                        {@const extractedY =
                            360 - ((result.extracted.f2 - 500) / 2500) * 340}
                        {@const color = result.passed ? "#4ecdc4" : "#ff6b6b"}
                        {@const vowelName = result.name.split(" ")[0]}

                        <!-- Error line connecting expected to extracted -->
                        <line
                            x1={expectedX}
                            y1={expectedY}
                            x2={extractedX}
                            y2={extractedY}
                            stroke={color}
                            stroke-width="1"
                            stroke-dasharray="3,3"
                            opacity="0.5"
                        />

                        <!-- Expected position (circle) -->
                        <circle
                            cx={expectedX}
                            cy={expectedY}
                            r="6"
                            fill="none"
                            stroke="#888"
                            stroke-width="2"
                        />

                        <!-- Extracted position (triangle) -->
                        <polygon
                            points="{extractedX},{extractedY - 7} {extractedX -
                                6},{extractedY + 5} {extractedX +
                                6},{extractedY + 5}"
                            fill={color}
                        />

                        <!-- Label -->
                        <text
                            x={expectedX + 8}
                            y={expectedY - 8}
                            class="point-label">{vowelName}</text
                        >
                    {/each}
                </svg>
            </div>
            <div class="scatter-legend">
                <div class="legend-item">
                    <span class="circle-marker">○</span> Expected position
                </div>
                <div class="legend-item">
                    <span class="triangle-marker pass">▲</span> Extracted (pass)
                </div>
                <div class="legend-item">
                    <span class="triangle-marker fail">▲</span> Extracted (fail)
                </div>
            </div>
        </div>
    {/if}

    <div class="reference-info">
        <h3>Reference Vowel Formants</h3>
        <p>
            Expected formant frequencies for validation (Peterson & Barney,
            1952):
        </p>
        <ul>
            <li>
                <strong>/i/ (ee):</strong> F1=270, F2=2290, F3=3010 Hz - Close front
            </li>
            <li>
                <strong>/ɑ/ (ah):</strong> F1=730, F2=1090, F3=2440 Hz - Open back
            </li>
            <li>
                <strong>/u/ (oo):</strong> F1=300, F2=870, F3=2240 Hz - Close back
            </li>
            <li>
                <strong>/ə/ (schwa):</strong> F1=500, F2=1500, F3=2500 Hz - Central
            </li>
        </ul>
    </div>
</div>

<style>
    .validation-panel {
        padding: 1rem;
        background: #1a1a2e;
        color: #eee;
        border-radius: 8px;
        max-width: 900px;
        margin: 0 auto;
    }

    h2 {
        margin: 0 0 0.5rem 0;
        color: #4ecdc4;
    }

    .description {
        color: #aaa;
        margin-bottom: 1rem;
    }

    .controls {
        display: flex;
        gap: 1rem;
        align-items: center;
        flex-wrap: wrap;
        margin-bottom: 1rem;
    }

    .control-group {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    select,
    input[type="range"] {
        background: #2a2a4e;
        color: #eee;
        border: 1px solid #444;
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
    }

    button {
        background: #4ecdc4;
        color: #1a1a2e;
        border: none;
        padding: 0.5rem 1rem;
        border-radius: 4px;
        cursor: pointer;
        font-weight: bold;
    }

    button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    button:hover:not(:disabled) {
        background: #3dbdb5;
    }

    .progress-bar {
        height: 4px;
        background: #333;
        border-radius: 2px;
        overflow: hidden;
        margin-bottom: 1rem;
    }

    .progress-fill {
        height: 100%;
        background: #4ecdc4;
        transition: width 0.2s;
    }

    .summary {
        padding: 1rem;
        border-radius: 8px;
        margin-bottom: 1rem;
    }

    .summary.pass {
        background: rgba(78, 205, 196, 0.2);
        border: 1px solid #4ecdc4;
    }
    .summary.warn {
        background: rgba(255, 193, 7, 0.2);
        border: 1px solid #ffc107;
    }
    .summary.fail {
        background: rgba(255, 107, 107, 0.2);
        border: 1px solid #ff6b6b;
    }

    .summary h3 {
        margin: 0 0 0.5rem 0;
    }

    .stats {
        display: flex;
        gap: 2rem;
        flex-wrap: wrap;
    }

    .stat {
        display: flex;
        gap: 0.5rem;
    }

    .stat .label {
        color: #aaa;
    }

    .stat .value {
        font-weight: bold;
    }

    .results-table {
        overflow-x: auto;
    }

    table {
        width: 100%;
        border-collapse: collapse;
    }

    th,
    td {
        padding: 0.5rem;
        text-align: left;
        border-bottom: 1px solid #333;
    }

    th {
        background: #2a2a4e;
        color: #4ecdc4;
    }

    tr.passed {
        background: rgba(78, 205, 196, 0.1);
    }
    tr.failed {
        background: rgba(255, 107, 107, 0.1);
    }

    .vowel-name {
        font-weight: bold;
    }

    .formants {
        font-family: monospace;
    }

    .errors span.high {
        color: #ff6b6b;
        font-weight: bold;
    }

    .status {
        text-align: center;
        font-size: 1.2rem;
    }

    .play-btn {
        padding: 0.25rem 0.5rem;
        font-size: 1rem;
        background: #2a2a4e;
        color: #eee;
    }

    .reference-info {
        margin-top: 2rem;
        padding: 1rem;
        background: #2a2a4e;
        border-radius: 8px;
    }

    .reference-info h3 {
        margin: 0 0 0.5rem 0;
        color: #4ecdc4;
    }

    .reference-info ul {
        margin: 0;
        padding-left: 1.5rem;
    }

    .reference-info li {
        margin: 0.25rem 0;
    }

    /* Scatter Plot Styles */
    .scatter-section {
        margin-top: 2rem;
        padding: 1rem;
        background: #1e1e38;
        border-radius: 8px;
    }

    .scatter-section h3 {
        margin: 0 0 0.5rem 0;
        color: #4ecdc4;
    }

    .scatter-description {
        color: #aaa;
        font-size: 0.85rem;
        margin-bottom: 1rem;
    }

    .scatter-plot-container {
        background: #12121e;
        border-radius: 8px;
        padding: 1rem;
    }

    .scatter-plot {
        width: 100%;
        max-width: 600px;
        margin: 0 auto;
        display: block;
    }

    .scatter-plot .grid-line {
        stroke: #333;
        stroke-width: 1;
    }

    .scatter-plot .axis-label {
        fill: #888;
        font-size: 12px;
        text-anchor: middle;
    }

    .scatter-plot .tick-label {
        fill: #666;
        font-size: 10px;
        text-anchor: middle;
    }

    .scatter-plot .tick-label.f2-tick {
        text-anchor: end;
    }

    .scatter-plot .quadrant-label {
        fill: #444;
        font-size: 10px;
        text-anchor: middle;
    }

    .scatter-plot .point-label {
        fill: #aaa;
        font-size: 9px;
    }

    .scatter-legend {
        display: flex;
        gap: 1.5rem;
        justify-content: center;
        margin-top: 1rem;
        font-size: 0.85rem;
    }

    .legend-item {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        color: #888;
    }

    .circle-marker {
        color: #888;
    }

    .triangle-marker.pass {
        color: #4ecdc4;
    }

    .triangle-marker.fail {
        color: #ff6b6b;
    }
</style>
