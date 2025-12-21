/**
 * Phase Space Embedding Web Worker
 * 
 * Performs heavy Takens embedding computation off the main thread
 * to keep the UI responsive.
 */

interface WorkerMessage {
    type: 'compute';
    samples: Float32Array;
    tau: number;
    smoothing: number;
    normalize: boolean;
    maxPoints: number;
}

interface WorkerResult {
    type: 'result';
    points: Array<{ x: number; y: number; z: number; t: number }>;
}

// Takens embedding (same as main thread version)
function takensEmbedding(signal: Float32Array, tau: number) {
    const n = signal.length;
    const points: Array<{ x: number; y: number; z: number; t: number }> = [];

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

// Normalize manifold
function normalizeManifold(points: Array<{ x: number; y: number; z: number; t: number }>) {
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

// Laplacian smoothing
function applySmoothing(
    points: Array<{ x: number; y: number; z: number; t: number }>,
    iterations: number,
    alpha: number = 0.5
) {
    if (points.length < 3) return points;

    let result = points.map(p => ({ ...p }));

    for (let iter = 0; iter < iterations; iter++) {
        const newPoints: Array<{ x: number; y: number; z: number; t: number }> = [];
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

// Downsample
function downsample(points: Array<{ x: number; y: number; z: number; t: number }>, step: number) {
    if (step <= 1) return points;
    return points.filter((_, i) => i % step === 0);
}

// Message handler
self.onmessage = (e: MessageEvent<WorkerMessage>) => {
    const { samples, tau, smoothing, normalize, maxPoints } = e.data;

    // Compute embedding
    let points = takensEmbedding(samples, tau);

    // Normalize if needed
    if (normalize) {
        points = normalizeManifold(points);
    }

    // Apply smoothing
    if (smoothing > 0) {
        points = applySmoothing(points, smoothing);
    }

    // Downsample for performance
    if (points.length > maxPoints) {
        const step = Math.ceil(points.length / maxPoints);
        points = downsample(points, step);
    }

    // Send result back
    const result: WorkerResult = { type: 'result', points };
    self.postMessage(result);
};
