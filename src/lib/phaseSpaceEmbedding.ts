/**
 * Phase Space Embedding - Takens' Embedding Theorem
 * 
 * Converts 1D audio signals into 3D phase space representations
 * to reveal attractor geometry (topological structure of sound).
 */

/**
 * A 3D point in phase space with time index
 */
export interface PhaseSpacePoint {
    x: number;  // s(t)
    y: number;  // s(t + τ)
    z: number;  // s(t + 2τ)
    t: number;  // Original time index
}

/**
 * Result of phase space embedding
 */
export interface EmbeddingResult {
    points: PhaseSpacePoint[];
    bounds: {
        min: { x: number; y: number; z: number };
        max: { x: number; y: number; z: number };
    };
    centroid: { x: number; y: number; z: number };
}

/**
 * Compute Takens' time-delay embedding of a 1D signal.
 * 
 * For each sample s(t), creates a 3D point (s(t), s(t+τ), s(t+2τ)).
 * This reconstructs the phase space attractor from a single dimension.
 * 
 * @param signal - Audio samples (Float32Array or number[])
 * @param tau - Time delay in samples (default: 10)
 * @returns Array of 3D points in phase space
 */
export function takensEmbedding(
    signal: Float32Array | number[],
    tau: number = 10
): PhaseSpacePoint[] {
    const n = signal.length;
    const points: PhaseSpacePoint[] = [];

    // Need at least 2*tau samples to create any points
    if (n < 2 * tau + 1) {
        return points;
    }

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

/**
 * Normalize the manifold to unit sphere centered at origin.
 * 
 * This removes differences in loudness (amplitude) and DC offset,
 * making the shape invariant to volume.
 * 
 * @param points - Phase space points to normalize
 * @returns Normalized points (centered at origin, max radius = 1)
 */
export function normalizeManifold(points: PhaseSpacePoint[]): PhaseSpacePoint[] {
    if (points.length === 0) return [];

    // 1. Compute centroid
    let cx = 0, cy = 0, cz = 0;
    for (const p of points) {
        cx += p.x;
        cy += p.y;
        cz += p.z;
    }
    cx /= points.length;
    cy /= points.length;
    cz /= points.length;

    // 2. Center and find max radius
    let maxRadius = 0;
    const centered = points.map(p => {
        const dx = p.x - cx;
        const dy = p.y - cy;
        const dz = p.z - cz;
        const r = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (r > maxRadius) maxRadius = r;
        return { x: dx, y: dy, z: dz, t: p.t };
    });

    // 3. Scale to unit sphere
    if (maxRadius === 0) return centered;

    return centered.map(p => ({
        x: p.x / maxRadius,
        y: p.y / maxRadius,
        z: p.z / maxRadius,
        t: p.t
    }));
}

/**
 * Apply Laplacian smoothing to reduce noise while preserving topology.
 * 
 * Each point moves toward the average of its neighbors, controlled by alpha.
 * This reveals the underlying "skeleton" of the attractor.
 * 
 * @param points - Phase space points
 * @param iterations - Number of smoothing passes (default: 3)
 * @param alpha - Smoothing factor 0-1 (default: 0.5)
 * @returns Smoothed points
 */
export function applySmoothing(
    points: PhaseSpacePoint[],
    iterations: number = 3,
    alpha: number = 0.5
): PhaseSpacePoint[] {
    if (points.length < 3) return points;

    let result = [...points.map(p => ({ ...p }))];

    for (let iter = 0; iter < iterations; iter++) {
        const newPoints: PhaseSpacePoint[] = [];

        for (let i = 0; i < result.length; i++) {
            // Get neighbors (prev and next in trajectory)
            const prev = result[Math.max(0, i - 1)];
            const curr = result[i];
            const next = result[Math.min(result.length - 1, i + 1)];

            // Laplacian: average of neighbors
            const avgX = (prev.x + next.x) / 2;
            const avgY = (prev.y + next.y) / 2;
            const avgZ = (prev.z + next.z) / 2;

            // Blend current with average
            newPoints.push({
                x: (1 - alpha) * curr.x + alpha * avgX,
                y: (1 - alpha) * curr.y + alpha * avgY,
                z: (1 - alpha) * curr.z + alpha * avgZ,
                t: curr.t
            });
        }

        result = newPoints;
    }

    return result;
}

/**
 * Compute optimal tau based on sample rate and estimated fundamental frequency.
 * 
 * Rule of thumb: τ = sampleRate / (4 * fundamentalHz)
 * This ensures one τ-step covers roughly 1/4 of a wave cycle.
 * 
 * @param sampleRate - Audio sample rate (e.g., 44100)
 * @param estimatedHz - Estimated fundamental frequency (default: 200 for speech)
 * @returns Recommended tau value
 */
export function getOptimalTau(sampleRate: number, estimatedHz: number = 200): number {
    const idealTau = Math.floor(sampleRate / (4 * estimatedHz));
    // Clamp to reasonable range
    return Math.max(5, Math.min(50, idealTau));
}

/**
 * Compute bounds and centroid of point cloud.
 */
export function computeBounds(points: PhaseSpacePoint[]): EmbeddingResult['bounds'] & { centroid: EmbeddingResult['centroid'] } {
    if (points.length === 0) {
        return {
            min: { x: 0, y: 0, z: 0 },
            max: { x: 0, y: 0, z: 0 },
            centroid: { x: 0, y: 0, z: 0 }
        };
    }

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    let cx = 0, cy = 0, cz = 0;

    for (const p of points) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        minZ = Math.min(minZ, p.z);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
        maxZ = Math.max(maxZ, p.z);
        cx += p.x;
        cy += p.y;
        cz += p.z;
    }

    return {
        min: { x: minX, y: minY, z: minZ },
        max: { x: maxX, y: maxY, z: maxZ },
        centroid: {
            x: cx / points.length,
            y: cy / points.length,
            z: cz / points.length
        }
    };
}

/**
 * Downsample points for performance (keeps every Nth point).
 */
export function downsample(points: PhaseSpacePoint[], step: number): PhaseSpacePoint[] {
    if (step <= 1) return points;
    return points.filter((_, i) => i % step === 0);
}
