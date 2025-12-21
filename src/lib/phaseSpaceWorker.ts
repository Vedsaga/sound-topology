/**
 * Phase Space Embedding Web Worker - Enhanced Manifold Pipeline
 * 
 * Preprocesses audio to reveal the true vowel topology:
 * 1. Band-pass filter (60Hz - 4kHz)
 * 2. Adaptive downsampling
 * 3. Auto-τ via autocorrelation
 * 4. PCA alignment
 * 5. Takens embedding + normalization
 */

type Point3D = { x: number; y: number; z: number; t: number };

interface WorkerMessage {
    type: 'compute';
    samples: Float32Array;
    sampleRate: number;
    tau: number;           // Manual tau (used if autoTau is false)
    autoTau: boolean;      // Compute optimal tau automatically
    smoothing: number;
    normalize: boolean;
    preprocess: boolean;   // Apply band-pass + downsample
    pcaAlign: boolean;     // Apply PCA rotation
    maxPoints: number;
}

interface WorkerResult {
    type: 'result';
    points: Point3D[];
    computedTau: number;   // The tau actually used (for UI display)
}

// ============================================
// PHASE 1: Signal Preprocessing
// ============================================

/**
 * Simple band-pass filter using frequency domain (60Hz - 4kHz)
 * Removes breathing noise and high-frequency jitter
 */
function bandPassFilter(samples: Float32Array, sampleRate: number): Float32Array {
    const n = samples.length;

    // For simplicity, use a time-domain IIR approximation
    // Butterworth-like smoothing
    const lowCut = 60;
    const highCut = 4000;

    // High-pass (remove < 60Hz) using simple difference
    const alpha = 2 * Math.PI * lowCut / sampleRate;
    const highPassed = new Float32Array(n);
    let prevIn = 0;
    let prevOut = 0;
    const rc = 1 / (2 * Math.PI * lowCut);
    const dt = 1 / sampleRate;
    const alphaHP = rc / (rc + dt);

    for (let i = 0; i < n; i++) {
        highPassed[i] = alphaHP * (prevOut + samples[i] - prevIn);
        prevIn = samples[i];
        prevOut = highPassed[i];
    }

    // Low-pass (remove > 4kHz) using exponential moving average
    const alphaLP = Math.exp(-2 * Math.PI * highCut / sampleRate);
    const result = new Float32Array(n);
    result[0] = highPassed[0];

    for (let i = 1; i < n; i++) {
        result[i] = alphaLP * result[i - 1] + (1 - alphaLP) * highPassed[i];
    }

    return result;
}

/**
 * Adaptive downsampling to ~1000 points per second
 */
function adaptiveDownsample(samples: Float32Array, sampleRate: number): Float32Array {
    const targetRate = 1000; // Points per second
    const step = Math.max(1, Math.floor(sampleRate / targetRate));

    const newLength = Math.ceil(samples.length / step);
    const result = new Float32Array(newLength);

    for (let i = 0; i < newLength; i++) {
        result[i] = samples[i * step];
    }

    return result;
}

// ============================================
// PHASE 2: Auto-τ via Autocorrelation
// ============================================

/**
 * Compute optimal tau using first zero-crossing of autocorrelation
 * This ensures the embedding captures ~1/4 of a cycle
 */
function computeOptimalTau(samples: Float32Array): number {
    const n = samples.length;
    const maxLag = Math.min(500, Math.floor(n / 4));

    // Compute autocorrelation
    let mean = 0;
    for (let i = 0; i < n; i++) mean += samples[i];
    mean /= n;

    const autocorr = new Float32Array(maxLag);
    let variance = 0;

    for (let i = 0; i < n; i++) {
        const diff = samples[i] - mean;
        variance += diff * diff;
    }
    variance /= n;

    if (variance < 1e-10) return 10; // Silence, use default

    for (let lag = 0; lag < maxLag; lag++) {
        let sum = 0;
        for (let i = 0; i < n - lag; i++) {
            sum += (samples[i] - mean) * (samples[i + lag] - mean);
        }
        autocorr[lag] = sum / ((n - lag) * variance);
    }

    // Find first zero crossing (where autocorr drops below 0)
    for (let lag = 1; lag < maxLag - 1; lag++) {
        if (autocorr[lag] <= 0) {
            return Math.max(5, lag); // At least 5 samples
        }
    }

    // If no zero crossing, find first minimum
    for (let lag = 1; lag < maxLag - 1; lag++) {
        if (autocorr[lag] < autocorr[lag - 1] && autocorr[lag] < autocorr[lag + 1]) {
            return Math.max(5, lag);
        }
    }

    return 15; // Default fallback
}

// ============================================
// PHASE 3: Takens Embedding
// ============================================

function takensEmbedding(signal: Float32Array, tau: number): Point3D[] {
    const n = signal.length;
    const points: Point3D[] = [];

    if (n < 2 * tau + 1) return points;

    for (let t = 0; t < n - 2 * tau; t++) {
        points.push({
            x: signal[t],
            y: signal[t + tau],
            z: signal[t + 2 * tau],
            t
        });
    }

    return points;
}

// ============================================
// PHASE 4: PCA Alignment
// ============================================

/**
 * Rotate point cloud so PC1=X, PC2=Y, PC3=Z
 * This gives a "standard view" regardless of recording orientation
 */
function pcaAlign(points: Point3D[]): Point3D[] {
    if (points.length < 10) return points;

    const n = points.length;

    // 1. Center the data
    let cx = 0, cy = 0, cz = 0;
    for (const p of points) {
        cx += p.x; cy += p.y; cz += p.z;
    }
    cx /= n; cy /= n; cz /= n;

    // 2. Compute covariance matrix (3x3)
    let cov00 = 0, cov01 = 0, cov02 = 0;
    let cov11 = 0, cov12 = 0, cov22 = 0;

    for (const p of points) {
        const dx = p.x - cx, dy = p.y - cy, dz = p.z - cz;
        cov00 += dx * dx;
        cov01 += dx * dy;
        cov02 += dx * dz;
        cov11 += dy * dy;
        cov12 += dy * dz;
        cov22 += dz * dz;
    }

    cov00 /= n; cov01 /= n; cov02 /= n;
    cov11 /= n; cov12 /= n; cov22 /= n;

    // 3. Power iteration to find principal eigenvector (PC1)
    // This is a simplified approach; for full PCA use SVD
    let v1 = { x: 1, y: 0, z: 0 };

    for (let iter = 0; iter < 20; iter++) {
        const newX = cov00 * v1.x + cov01 * v1.y + cov02 * v1.z;
        const newY = cov01 * v1.x + cov11 * v1.y + cov12 * v1.z;
        const newZ = cov02 * v1.x + cov12 * v1.y + cov22 * v1.z;

        const mag = Math.sqrt(newX * newX + newY * newY + newZ * newZ);
        if (mag < 1e-10) break;

        v1 = { x: newX / mag, y: newY / mag, z: newZ / mag };
    }

    // For now, just rotate so PC1 aligns with X axis
    // This is a simplified rotation (full implementation would use all 3 PCs)
    const result: Point3D[] = [];

    for (const p of points) {
        // Project onto PC1 direction
        const dx = p.x - cx, dy = p.y - cy, dz = p.z - cz;

        // Simple rotation to align PC1 with X
        // This is an approximation; proper implementation uses rotation matrix
        result.push({
            x: dx * v1.x + dy * v1.y + dz * v1.z,  // Component along PC1
            y: dy - (dy * v1.y) * v1.y,             // Orthogonal component
            z: dz - (dz * v1.z) * v1.z,             // Orthogonal component
            t: p.t
        });
    }

    return result;
}

// ============================================
// NORMALIZATION & SMOOTHING
// ============================================

function normalizeManifold(points: Point3D[]): Point3D[] {
    if (points.length === 0) return [];

    let cx = 0, cy = 0, cz = 0;
    for (const p of points) {
        cx += p.x; cy += p.y; cz += p.z;
    }
    cx /= points.length;
    cy /= points.length;
    cz /= points.length;

    let maxRadius = 0;
    const centered = points.map(p => {
        const dx = p.x - cx, dy = p.y - cy, dz = p.z - cz;
        const r = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (r > maxRadius) maxRadius = r;
        return { x: dx, y: dy, z: dz, t: p.t };
    });

    if (maxRadius === 0) return centered;
    return centered.map(p => ({
        x: p.x / maxRadius,
        y: p.y / maxRadius,
        z: p.z / maxRadius,
        t: p.t
    }));
}

function applySmoothing(points: Point3D[], iterations: number, alpha = 0.5): Point3D[] {
    if (points.length < 3) return points;

    let result = points.map(p => ({ ...p }));

    for (let iter = 0; iter < iterations; iter++) {
        const newPoints: Point3D[] = [];
        for (let i = 0; i < result.length; i++) {
            const prev = result[Math.max(0, i - 1)];
            const curr = result[i];
            const next = result[Math.min(result.length - 1, i + 1)];

            newPoints.push({
                x: (1 - alpha) * curr.x + alpha * (prev.x + next.x) / 2,
                y: (1 - alpha) * curr.y + alpha * (prev.y + next.y) / 2,
                z: (1 - alpha) * curr.z + alpha * (prev.z + next.z) / 2,
                t: curr.t
            });
        }
        result = newPoints;
    }

    return result;
}

function downsample(points: Point3D[], step: number): Point3D[] {
    if (step <= 1) return points;
    return points.filter((_, i) => i % step === 0);
}

// ============================================
// MAIN MESSAGE HANDLER
// ============================================

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
    const {
        samples,
        sampleRate,
        tau,
        autoTau,
        smoothing,
        normalize,
        preprocess,
        pcaAlign: doPCA,
        maxPoints
    } = e.data;

    let signal = samples;

    // Phase 1: Preprocessing
    if (preprocess) {
        signal = bandPassFilter(signal, sampleRate);
        signal = adaptiveDownsample(signal, sampleRate);
    }

    // Phase 2: Compute optimal tau
    const computedTau = autoTau ? computeOptimalTau(signal) : tau;

    // Phase 3: Takens embedding
    let points = takensEmbedding(signal, computedTau);

    // Phase 4: PCA alignment
    if (doPCA && points.length > 0) {
        points = pcaAlign(points);
    }

    // Normalize to unit sphere
    if (normalize) {
        points = normalizeManifold(points);
    }

    // Apply smoothing
    if (smoothing > 0) {
        points = applySmoothing(points, smoothing);
    }

    // Downsample for rendering
    if (points.length > maxPoints) {
        const step = Math.ceil(points.length / maxPoints);
        points = downsample(points, step);
    }

    // Send result back
    const result: WorkerResult = {
        type: 'result',
        points,
        computedTau
    };
    self.postMessage(result);
};
