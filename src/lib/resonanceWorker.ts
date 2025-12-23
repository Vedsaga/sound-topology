/**
 * Resonance Worker - Spectral Geometry Pipeline
 *
 * Extracts formant structure from audio and generates geometry:
 * 1. FFT → log-magnitude spectrum
 * 2. Cepstral smoothing → spectral envelope
 * 3. Envelope peak detection → formants (F1, F2, F3)
 * 4. Geometry generation:
 *    - Lissajous: formant-ratio parametric curves
 *    - Cymatics: formant-weighted Chladni patterns
 */

type ResPoint3D = { x: number; y: number; z: number; t: number };
type ResFormantFrame = { time: number; formants: [number, number, number] };

interface ResWorkerMessage {
    type: 'compute';
    samples: Float32Array;
    sampleRate: number;
    mode: 'lissajous' | 'cymatics' | 'lissajous-manifold';
    windowMs: number;
    maxPoints: number;
}

interface ResWorkerResult {
    type: 'result';
    points: ResPoint3D[];
    formantTrajectory: ResFormantFrame[];
}

// ============================================
// FFT IMPLEMENTATION (Cooley-Tukey)
// ============================================

/**
 * Compute FFT of real signal, returns magnitude spectrum
 */
function fft(signal: Float32Array): Float32Array {
    const n = signal.length;
    // Pad to next power of 2
    const fftSize = Math.pow(2, Math.ceil(Math.log2(n)));
    const real = new Float32Array(fftSize);
    const imag = new Float32Array(fftSize);

    // Copy and zero-pad
    for (let i = 0; i < n; i++) real[i] = signal[i];
    for (let i = n; i < fftSize; i++) real[i] = 0;
    for (let i = 0; i < fftSize; i++) imag[i] = 0;

    // Bit-reversal permutation
    const bits = Math.log2(fftSize);
    for (let i = 0; i < fftSize; i++) {
        const rev = bitReverse(i, bits);
        if (rev > i) {
            [real[i], real[rev]] = [real[rev], real[i]];
            [imag[i], imag[rev]] = [imag[rev], imag[i]];
        }
    }

    // Cooley-Tukey FFT
    for (let size = 2; size <= fftSize; size *= 2) {
        const halfSize = size / 2;
        const angle = -2 * Math.PI / size;

        for (let i = 0; i < fftSize; i += size) {
            for (let j = 0; j < halfSize; j++) {
                const wr = Math.cos(angle * j);
                const wi = Math.sin(angle * j);
                const tr = wr * real[i + j + halfSize] - wi * imag[i + j + halfSize];
                const ti = wr * imag[i + j + halfSize] + wi * real[i + j + halfSize];
                real[i + j + halfSize] = real[i + j] - tr;
                imag[i + j + halfSize] = imag[i + j] - ti;
                real[i + j] += tr;
                imag[i + j] += ti;
            }
        }
    }

    // Compute magnitude (only positive frequencies)
    const mag = new Float32Array(fftSize / 2);
    for (let i = 0; i < fftSize / 2; i++) {
        mag[i] = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
    }
    return mag;
}

function bitReverse(x: number, bits: number): number {
    let result = 0;
    for (let i = 0; i < bits; i++) {
        result = (result << 1) | (x & 1);
        x >>= 1;
    }
    return result;
}

// ============================================
// SPECTRAL ENVELOPE EXTRACTION
// ============================================

/**
 * Extract spectral envelope using cepstral smoothing
 * This removes pitch harmonics, keeping only resonance structure
 */
function extractSpectralEnvelope(magnitude: Float32Array, sampleRate: number): Float32Array {
    const n = magnitude.length;

    // 1. Log magnitude spectrum
    const logMag = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        logMag[i] = Math.log(Math.max(magnitude[i], 1e-10));
    }

    // 2. Compute cepstrum via IFFT approximation (simplified)
    // Real cepstrum would use IFFT, here we use moving average as approximation
    // for spectral envelope (smoother, faster)
    const smoothed = new Float32Array(n);
    const windowSize = Math.max(5, Math.floor(n / 30)); // Adaptive window

    for (let i = 0; i < n; i++) {
        let sum = 0;
        let count = 0;
        for (let j = -windowSize; j <= windowSize; j++) {
            const idx = i + j;
            if (idx >= 0 && idx < n) {
                sum += logMag[idx];
                count++;
            }
        }
        smoothed[i] = sum / count;
    }

    // 3. Convert back from log domain
    const envelope = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        envelope[i] = Math.exp(smoothed[i]);
    }

    return envelope;
}

// ============================================
// FORMANT DETECTION
// ============================================

/**
 * Detect formant peaks from spectral envelope
 * Returns top 3 formants (F1, F2, F3)
 */
function detectFormants(envelope: Float32Array, sampleRate: number): [number, number, number] {
    const n = envelope.length;
    const freqPerBin = sampleRate / (2 * n);

    // Find local maxima (peaks) with their prominence
    const peaks: { freq: number; mag: number; prominence: number }[] = [];

    // Search in typical formant range: 200Hz - 4000Hz
    const minBin = Math.floor(200 / freqPerBin);
    const maxBin = Math.min(n - 1, Math.floor(4000 / freqPerBin));

    for (let i = minBin + 1; i < maxBin - 1; i++) {
        if (envelope[i] > envelope[i - 1] && envelope[i] > envelope[i + 1]) {
            // Calculate prominence: how much higher than the lower neighbor
            const minNeighbor = Math.min(envelope[i - 1], envelope[i + 1]);
            const prominence = envelope[i] - minNeighbor;
            peaks.push({
                freq: i * freqPerBin,
                mag: envelope[i],
                prominence
            });
        }
    }

    // Sort by prominence (relative peak height) to get most distinctive peaks
    peaks.sort((a, b) => b.prominence - a.prominence);

    // Get top 3 frequencies, then sort by frequency for F1 < F2 < F3
    const topFreqs = peaks.slice(0, 3).map(p => p.freq).sort((a, b) => a - b);

    // Ensure we have 3 formants (fill with estimates if missing)
    const f1 = topFreqs[0] || 500;   // Typical F1
    const f2 = topFreqs[1] || 1500;  // Typical F2
    const f3 = topFreqs[2] || 2500;  // Typical F3

    return [f1, f2, f3];
}

// ============================================
// LISSAJOUS GEOMETRY
// ============================================

/**
 * Generate 3D Lissajous curve using formant RATIOS
 * Ratios are scale-invariant: male/female vowels collapse to same shape
 */
function generateLissajous(formantTrajectory: ResFormantFrame[], maxPoints: number): ResPoint3D[] {
    if (formantTrajectory.length === 0) return [];

    const points: ResPoint3D[] = [];

    // Average formants for stable curve
    let avgF1 = 0, avgF2 = 0, avgF3 = 0;
    for (const frame of formantTrajectory) {
        avgF1 += frame.formants[0];
        avgF2 += frame.formants[1];
        avgF3 += frame.formants[2];
    }
    avgF1 /= formantTrajectory.length;
    avgF2 /= formantTrajectory.length;
    avgF3 /= formantTrajectory.length;

    // Compute ratios (scale-invariant)
    const r12 = avgF1 / avgF2;  // F1/F2
    const r23 = avgF2 / avgF3;  // F2/F3
    const r13 = avgF1 / avgF3;  // F1/F3

    // Generate parametric Lissajous curve
    const numPoints = Math.min(maxPoints, 2000);
    const cycles = 10; // Complete cycles to trace

    for (let i = 0; i < numPoints; i++) {
        const t = (i / numPoints) * cycles * 2 * Math.PI;

        points.push({
            x: Math.sin(r13 * t),
            y: Math.sin(r23 * t + Math.PI / 4),
            z: Math.sin(r12 * t + Math.PI / 2),
            t: i / numPoints
        });
    }

    return points;
}

// ============================================
// CYMATICS GEOMETRY
// ============================================

/**
 * Generate Chladni-like plate pattern weighted by formants
 * This is a metaphorical projection of resonance stability
 */
function generateCymatics(formantTrajectory: ResFormantFrame[], maxPoints: number): ResPoint3D[] {
    if (formantTrajectory.length === 0) return [];

    const points: ResPoint3D[] = [];

    // Average formants
    let avgF1 = 0, avgF2 = 0, avgF3 = 0;
    for (const frame of formantTrajectory) {
        avgF1 += frame.formants[0];
        avgF2 += frame.formants[1];
        avgF3 += frame.formants[2];
    }
    avgF1 /= formantTrajectory.length;
    avgF2 /= formantTrajectory.length;
    avgF3 /= formantTrajectory.length;

    // Normalize to mode numbers (1-10 range for Chladni patterns)
    const n = Math.round(1 + (avgF1 / 500) * 3);  // F1 → mode n
    const m = Math.round(1 + (avgF2 / 1500) * 4); // F2 → mode m
    const k = Math.round(1 + (avgF3 / 2500) * 3); // F3 → mode k (z-modulation)

    // Generate Chladni plate surface
    // Classic pattern: sin(nx)·cos(my) ± cos(nx)·sin(my) = 0 (nodal lines)
    // We sample points near nodal lines with z as amplitude
    const gridSize = Math.floor(Math.sqrt(maxPoints));
    const scale = 2; // -scale to +scale

    for (let ix = 0; ix < gridSize; ix++) {
        for (let iy = 0; iy < gridSize; iy++) {
            const x = (ix / (gridSize - 1)) * 2 * scale - scale;
            const y = (iy / (gridSize - 1)) * 2 * scale - scale;

            // Chladni pattern value
            const pattern1 = Math.sin(n * Math.PI * x / scale) * Math.cos(m * Math.PI * y / scale);
            const pattern2 = Math.cos(n * Math.PI * x / scale) * Math.sin(m * Math.PI * y / scale);
            const z = (pattern1 + pattern2) * Math.sin(k * Math.PI * (x + y) / (2 * scale));

            // Points near nodal lines (small absolute value) are "stable"
            // Map pattern value to z-height
            points.push({
                x: x / scale,
                y: y / scale,
                z: z * 0.5,
                t: (ix * gridSize + iy) / (gridSize * gridSize)
            });
        }
    }

    return points;
}

// ============================================
// LISSAJOUS MANIFOLD GEOMETRY (Topology Mode)
// ============================================

/**
 * Golden ratio and sqrt(2) for phase jitter - irrational to prevent locking
 */
const PHI = 1.618033988749895;  // Golden ratio
const SQRT2 = 1.4142135623730951;

/**
 * Generate time-stacked Lissajous manifold using instantaneous formant ratios
 * 
 * Key differences from averaged Lissajous:
 * - Per-frame curve segments (not one global curve)
 * - Phase jitter prevents artificial coherence
 * - Stability weighting emphasizes sustained vowels
 * - Results in "thickened tube" where topology is visible
 */
function generateLissajousManifold(
    formantTrajectory: ResFormantFrame[],
    maxPoints: number
): ResPoint3D[] {
    if (formantTrajectory.length < 2) return [];

    const points: ResPoint3D[] = [];
    const pointsPerFrame = 20;  // Short segment per frame
    const cycles = 1.5;         // Cycles per segment (less = more cloud-like)

    // Track previous formants for stability calculation
    let prevF1 = formantTrajectory[0].formants[0];
    let prevF2 = formantTrajectory[0].formants[1];
    let prevF3 = formantTrajectory[0].formants[2];

    for (let frameIdx = 0; frameIdx < formantTrajectory.length; frameIdx++) {
        const frame = formantTrajectory[frameIdx];
        const [f1, f2, f3] = frame.formants;

        // Calculate stability: inverse of formant change
        // Stable vowels → higher weight → denser contribution
        const deltaF = Math.abs(f1 - prevF1) + Math.abs(f2 - prevF2) + Math.abs(f3 - prevF3);
        const stability = 1 / (deltaF + 1e-3);  // Avoid division by zero
        const weight = Math.min(stability * 0.05, 1);  // Clamp to [0, 1]

        // Skip very unstable frames (transitions between sounds)
        if (weight < 0.1) {
            prevF1 = f1; prevF2 = f2; prevF3 = f3;
            continue;
        }

        // Instantaneous ratios (NOT averaged)
        const r12 = f1 / f2;
        const r23 = f2 / f3;
        const r13 = f1 / f3;

        // Phase jitter using irrational numbers - prevents filament locking
        const phi1 = (frameIdx * PHI) % (2 * Math.PI);
        const phi2 = (frameIdx * SQRT2) % (2 * Math.PI);

        // Generate short Lissajous segment for this frame
        for (let i = 0; i < pointsPerFrame; i++) {
            const localT = (i / pointsPerFrame) * cycles * 2 * Math.PI;

            points.push({
                x: weight * Math.sin(r13 * localT + phi1),
                y: weight * Math.sin(r23 * localT + phi2),
                z: weight * Math.sin(r12 * localT),
                t: frameIdx / formantTrajectory.length  // Global time for color
            });
        }

        // Update previous formants
        prevF1 = f1; prevF2 = f2; prevF3 = f3;
    }

    // Downsample if too many points
    if (points.length > maxPoints) {
        const step = Math.ceil(points.length / maxPoints);
        return points.filter((_, i) => i % step === 0);
    }

    return points;
}

// ============================================
// MAIN PROCESSING PIPELINE
// ============================================

function processAudio(
    samples: Float32Array,
    sampleRate: number,
    mode: 'lissajous' | 'cymatics' | 'lissajous-manifold',
    windowMs: number,
    maxPoints: number
): ResWorkerResult {
    // Window parameters
    const windowSamples = Math.floor((windowMs / 1000) * sampleRate);
    const hopSamples = Math.floor(windowSamples / 2); // 50% overlap

    const formantTrajectory: ResFormantFrame[] = [];

    // Process audio in overlapping windows
    for (let start = 0; start + windowSamples <= samples.length; start += hopSamples) {
        // Extract window with Hanning taper
        const window = new Float32Array(windowSamples);
        for (let i = 0; i < windowSamples; i++) {
            const hanning = 0.5 * (1 - Math.cos(2 * Math.PI * i / windowSamples));
            window[i] = samples[start + i] * hanning;
        }

        // FFT → envelope → formants
        const magnitude = fft(window);
        const envelope = extractSpectralEnvelope(magnitude, sampleRate);
        const formants = detectFormants(envelope, sampleRate);

        formantTrajectory.push({
            time: start / sampleRate,
            formants
        });
    }

    // Generate geometry based on mode
    let points: ResPoint3D[];
    if (mode === 'lissajous') {
        points = generateLissajous(formantTrajectory, maxPoints);
    } else if (mode === 'lissajous-manifold') {
        points = generateLissajousManifold(formantTrajectory, maxPoints);
    } else {
        points = generateCymatics(formantTrajectory, maxPoints);
    }

    // Normalize to unit sphere
    if (points.length > 0) {
        let maxR = 0;
        for (const p of points) {
            const r = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
            if (r > maxR) maxR = r;
        }
        if (maxR > 0) {
            for (const p of points) {
                p.x /= maxR;
                p.y /= maxR;
                p.z /= maxR;
            }
        }
    }

    return {
        type: 'result',
        points,
        formantTrajectory
    };
}

// ============================================
// MESSAGE HANDLER
// ============================================

self.onmessage = (e: MessageEvent<ResWorkerMessage>) => {
    const { samples, sampleRate, mode, windowMs, maxPoints } = e.data;
    const result = processAudio(samples, sampleRate, mode, windowMs, maxPoints);
    self.postMessage(result);
};
