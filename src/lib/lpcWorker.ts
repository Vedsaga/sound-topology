/**
 * LPC Formant Extraction Web Worker
 * 
 * Implements proper Source-Filter Decomposition:
 * 1. Downsample to 10kHz
 * 2. Pre-emphasis (α=0.97)
 * 3. Windowed analysis (25ms Hanning)
 * 4. Autocorrelation
 * 5. Levinson-Durbin → LPC coefficients
 * 6. Laguerre's method → polynomial roots
 * 7. Roots → Formants (F1, F2, F3) + Bandwidths (B1, B2, B3)
 * 8. Bark scale conversion
 * 9. Formant dispersion → opacity
 */

// ============================================
// TYPES
// ============================================

interface Complex {
    re: number;
    im: number;
}

interface LPCFormantFrame {
    time: number;
    f1: number; f2: number; f3: number;  // Hz
    b1: number; b2: number; b3: number;  // Bandwidth Hz
    dispersion: number;                   // (F3 - F1) / 2
}

interface LPCPoint3D {
    x: number;  // Bark(F2) - frontness
    y: number;  // -Bark(F1) - opening (inverted)
    z: number;  // (B1+B2)/200 - thickness
    t: number;  // time [0,1]
    opacity: number;  // from dispersion
}

interface LPCWorkerMessage {
    type: 'compute';
    samples: Float32Array;
    sampleRate: number;
    windowMs: number;
    maxPoints: number;
}

interface LPCWorkerResult {
    type: 'result';
    points: LPCPoint3D[];
    formantTrajectory: LPCFormantFrame[];
}

// ============================================
// CONSTANTS
// ============================================

const TARGET_SAMPLE_RATE = 10000;  // Downsample target
const LPC_ORDER = 14;              // p = 10 + 4
const PRE_EMPHASIS_ALPHA = 0.97;
const LAGUERRE_MAX_ITER = 50;
const LAGUERRE_EPSILON = 1e-10;

// ============================================
// COMPLEX NUMBER UTILITIES
// ============================================

function complexAdd(a: Complex, b: Complex): Complex {
    return { re: a.re + b.re, im: a.im + b.im };
}

function complexSub(a: Complex, b: Complex): Complex {
    return { re: a.re - b.re, im: a.im - b.im };
}

function complexMul(a: Complex, b: Complex): Complex {
    return {
        re: a.re * b.re - a.im * b.im,
        im: a.re * b.im + a.im * b.re
    };
}

function complexDiv(a: Complex, b: Complex): Complex {
    const denom = b.re * b.re + b.im * b.im;
    if (denom < 1e-20) return { re: 0, im: 0 };
    return {
        re: (a.re * b.re + a.im * b.im) / denom,
        im: (a.im * b.re - a.re * b.im) / denom
    };
}

function complexAbs(c: Complex): number {
    return Math.sqrt(c.re * c.re + c.im * c.im);
}

function complexSqrt(c: Complex): Complex {
    const r = complexAbs(c);
    const angle = Math.atan2(c.im, c.re);
    return {
        re: Math.sqrt(r) * Math.cos(angle / 2),
        im: Math.sqrt(r) * Math.sin(angle / 2)
    };
}

function complexScale(c: Complex, s: number): Complex {
    return { re: c.re * s, im: c.im * s };
}

// ============================================
// SIGNAL PREPROCESSING
// ============================================

/**
 * Downsample audio to target rate using simple decimation with anti-alias filter
 */
function downsample(samples: Float32Array, fromRate: number, toRate: number): Float32Array {
    if (fromRate <= toRate) return samples;

    const ratio = Math.round(fromRate / toRate);
    const cutoff = toRate / 2;

    // Simple low-pass filter before decimation (moving average approximation)
    const filterSize = Math.max(3, ratio * 2);
    const filtered = new Float32Array(samples.length);

    for (let i = 0; i < samples.length; i++) {
        let sum = 0;
        let count = 0;
        for (let j = -filterSize; j <= filterSize; j++) {
            const idx = i + j;
            if (idx >= 0 && idx < samples.length) {
                // Simple triangular window
                const weight = 1 - Math.abs(j) / (filterSize + 1);
                sum += samples[idx] * weight;
                count += weight;
            }
        }
        filtered[i] = sum / count;
    }

    // Decimate
    const newLength = Math.ceil(samples.length / ratio);
    const result = new Float32Array(newLength);
    for (let i = 0; i < newLength; i++) {
        result[i] = filtered[i * ratio];
    }

    return result;
}

/**
 * Pre-emphasis filter: y[n] = x[n] - α*x[n-1]
 * Boosts high frequencies for better formant resolution
 */
function preEmphasis(samples: Float32Array, alpha: number = PRE_EMPHASIS_ALPHA): Float32Array {
    const result = new Float32Array(samples.length);
    result[0] = samples[0];

    for (let i = 1; i < samples.length; i++) {
        result[i] = samples[i] - alpha * samples[i - 1];
    }

    return result;
}

// ============================================
// LPC CORE ALGORITHMS
// ============================================

/**
 * Compute autocorrelation R[0..order]
 */
function autocorrelation(samples: Float32Array, order: number): Float32Array {
    const n = samples.length;
    const R = new Float32Array(order + 1);

    for (let lag = 0; lag <= order; lag++) {
        let sum = 0;
        for (let i = 0; i < n - lag; i++) {
            sum += samples[i] * samples[i + lag];
        }
        R[lag] = sum;
    }

    return R;
}

/**
 * Levinson-Durbin recursion
 * Solves for LPC coefficients from autocorrelation
 * Returns coefficients a[1..order] (a[0] is always 1)
 */
function levinsonDurbin(R: Float32Array, order: number): Float32Array {
    const a = new Float32Array(order + 1);
    const aPrev = new Float32Array(order + 1);

    a[0] = 1;

    if (R[0] < 1e-10) {
        // Silence or very low energy
        return a;
    }

    let E = R[0];

    for (let i = 1; i <= order; i++) {
        // Calculate lambda (reflection coefficient)
        let lambda = R[i];
        for (let j = 1; j < i; j++) {
            lambda -= aPrev[j] * R[i - j];
        }
        lambda /= E;

        // Update coefficients
        a[i] = lambda;
        for (let j = 1; j < i; j++) {
            a[j] = aPrev[j] - lambda * aPrev[i - j];
        }

        // Update error
        E = E * (1 - lambda * lambda);
        if (E < 1e-10) break;

        // Copy for next iteration
        for (let j = 0; j <= i; j++) {
            aPrev[j] = a[j];
        }
    }

    return a;
}

// ============================================
// LAGUERRE'S METHOD FOR ROOT FINDING
// ============================================

/**
 * Evaluate polynomial and its derivatives at point x
 * Polynomial: 1 + a[1]*z^-1 + a[2]*z^-2 + ... = z^n + a[1]*z^(n-1) + ...
 */
function evaluatePolynomial(coeffs: ArrayLike<number>, x: Complex): { p: Complex; dp: Complex; d2p: Complex } {
    const n = coeffs.length - 1;

    // Evaluate using Horner's method
    let p: Complex = { re: 1, im: 0 };  // Leading coefficient
    let dp: Complex = { re: 0, im: 0 };
    let d2p: Complex = { re: 0, im: 0 };

    for (let i = 1; i <= n; i++) {
        // d2p = d2p * x + 2 * dp
        d2p = complexAdd(complexMul(d2p, x), complexScale(dp, 2));
        // dp = dp * x + p
        dp = complexAdd(complexMul(dp, x), p);
        // p = p * x + a[i]
        p = complexAdd(complexMul(p, x), { re: coeffs[i], im: 0 });
    }

    return { p, dp, d2p };
}

/**
 * Find one root using Laguerre's method
 */
function laguerreRoot(coeffs: ArrayLike<number>, x0: Complex): Complex {
    const n = coeffs.length - 1;
    let x = { ...x0 };

    for (let iter = 0; iter < LAGUERRE_MAX_ITER; iter++) {
        const { p, dp, d2p } = evaluatePolynomial(coeffs, x);

        if (complexAbs(p) < LAGUERRE_EPSILON) {
            return x;
        }

        // G = p' / p
        const G = complexDiv(dp, p);
        // H = G^2 - p'' / p
        const H = complexSub(complexMul(G, G), complexDiv(d2p, p));

        // sqrt((n-1) * (n*H - G^2))
        const discriminant = complexScale(
            complexSub(complexScale(H, n), complexMul(G, G)),
            n - 1
        );
        const sqrtDisc = complexSqrt(discriminant);

        // Choose denominator with larger absolute value
        const d1 = complexAdd(G, sqrtDisc);
        const d2 = complexSub(G, sqrtDisc);
        const denom = complexAbs(d1) > complexAbs(d2) ? d1 : d2;

        if (complexAbs(denom) < LAGUERRE_EPSILON) {
            // Nudge x and try again
            x.re += 0.01;
            x.im += 0.01;
            continue;
        }

        // a = n / denom
        const a = complexDiv({ re: n, im: 0 }, denom);
        x = complexSub(x, a);

        if (complexAbs(a) < LAGUERRE_EPSILON) {
            return x;
        }
    }

    return x;
}

/**
 * Deflate polynomial by removing a root
 */
function deflatePolynomial(coeffs: Float32Array, root: Complex): Float32Array {
    const n = coeffs.length - 1;
    const newCoeffs = new Float32Array(n);

    newCoeffs[0] = coeffs[0];
    for (let i = 1; i < n; i++) {
        newCoeffs[i] = coeffs[i] + root.re * newCoeffs[i - 1];
        // Note: For complex roots, this is simplified (works for real deflation)
    }

    return newCoeffs;
}

/**
 * Find all roots of LPC polynomial using Laguerre's method
 */
function findAllRoots(coeffs: Float32Array): Complex[] {
    const roots: Complex[] = [];
    // Use Array to avoid Float32Array type compatibility issues
    let currentCoeffs = Array.from(coeffs);

    const n = coeffs.length - 1;

    for (let i = 0; i < n; i++) {
        // Start from different initial guesses
        const angle = (2 * Math.PI * i) / n;
        const x0: Complex = { re: 0.9 * Math.cos(angle), im: 0.9 * Math.sin(angle) };

        const root = laguerreRoot(currentCoeffs, x0);
        roots.push(root);

        // Deflate (simplified - works better for well-separated roots)
        if (Math.abs(root.im) < 0.01) {
            // Real root - simple deflation using number array
            currentCoeffs = deflatePolynomialArray(currentCoeffs, root.re);
        }
    }

    return roots;
}

/**
 * Deflate polynomial using number array (avoids Float32Array type issues)
 */
function deflatePolynomialArray(coeffs: number[], realRoot: number): number[] {
    const n = coeffs.length - 1;
    const newCoeffs: number[] = new Array(n);

    newCoeffs[0] = coeffs[0];
    for (let i = 1; i < n; i++) {
        newCoeffs[i] = coeffs[i] + realRoot * newCoeffs[i - 1];
    }

    return newCoeffs;
}

// ============================================
// FORMANT EXTRACTION
// ============================================

/**
 * Convert polynomial roots to formant frequencies and bandwidths
 */
function rootsToFormants(roots: Complex[], sampleRate: number): {
    frequencies: number[];
    bandwidths: number[]
} {
    const formants: { freq: number; bw: number }[] = [];

    for (const root of roots) {
        const magnitude = complexAbs(root);

        // Only consider roots inside unit circle with positive imaginary part
        if (magnitude < 0.99 && magnitude > 0.5 && root.im > 0.01) {
            const angle = Math.atan2(root.im, root.re);
            const freq = Math.abs(angle) * sampleRate / (2 * Math.PI);
            const bandwidth = -Math.log(magnitude) * sampleRate / Math.PI;

            // Filter to speech formant range (200-4000 Hz)
            if (freq >= 200 && freq <= 4000 && bandwidth > 20 && bandwidth < 500) {
                formants.push({ freq, bw: bandwidth });
            }
        }
    }

    // Sort by frequency
    formants.sort((a, b) => a.freq - b.freq);

    // Take first 3 as F1, F2, F3
    const frequencies = [
        formants[0]?.freq ?? 500,
        formants[1]?.freq ?? 1500,
        formants[2]?.freq ?? 2500
    ];

    const bandwidths = [
        formants[0]?.bw ?? 80,
        formants[1]?.bw ?? 100,
        formants[2]?.bw ?? 120
    ];

    return { frequencies, bandwidths };
}

// ============================================
// PERCEPTUAL SCALING
// ============================================

/**
 * Convert Hz to Bark scale (Traunmüller, 1990)
 */
function hzToBark(hz: number): number {
    return 26.81 * hz / (1960 + hz) - 0.53;
}

/**
 * Formant dispersion - "geometric purity"
 */
function formantDispersion(f1: number, f2: number, f3: number): number {
    return (f3 - f1) / 2;
}

// ============================================
// GLOBAL CONSTANTS FOR VOWEL SPACE
// ============================================

// Universal Vowel Space: Fixed Bark scale limits for human speech formants
// This ensures 'a' and 'u' appear at different positions, not normalized to same box
const GLOBAL_MIN_BARK = 1;   // ~50 Hz (Low frequency limit)
const GLOBAL_MAX_BARK = 18;  // ~4500 Hz (High frequency limit)

// Thickness (bandwidth) normalization constants
const GLOBAL_MIN_THICKNESS = 0.3;  // Clear vowel
const GLOBAL_MAX_THICKNESS = 1.5;  // Breathy/nasal vowel

/**
 * Map Bark value to global vowel space [-1, 1]
 * Unlike local normalization, this preserves absolute vowel positions
 */
function mapToGlobalVowelSpace(barkValue: number): number {
    return ((barkValue - GLOBAL_MIN_BARK) / (GLOBAL_MAX_BARK - GLOBAL_MIN_BARK)) * 2 - 1;
}

// ============================================
// GEOMETRY GENERATION
// ============================================

function generateLPCVowelSpace(
    trajectory: LPCFormantFrame[],
    maxPoints: number
): LPCPoint3D[] {
    if (trajectory.length === 0) return [];

    const points: LPCPoint3D[] = [];

    // Calculate dispersion range for opacity (this can still be local)
    const dispersions = trajectory.map(f => f.dispersion);
    const minD = Math.min(...dispersions);
    const maxD = Math.max(...dispersions);
    const dispersionRange = maxD - minD + 1e-6;

    for (let i = 0; i < trajectory.length; i++) {
        const frame = trajectory[i];

        // Convert to Bark scale
        const barkF1 = hzToBark(frame.f1);
        const barkF2 = hzToBark(frame.f2);
        const thickness = (frame.b1 + frame.b2) / 200;

        // Map to GLOBAL vowel space (NOT local!)
        // This preserves the absolute position: 'a' and 'u' will be in different locations
        const x = mapToGlobalVowelSpace(barkF2);    // Frontness (F2)
        const y = -mapToGlobalVowelSpace(barkF1);   // Opening (F1 inverted - low F1 = closed)

        // Thickness normalized to global range, scaled smaller for Z
        const zRaw = (thickness - GLOBAL_MIN_THICKNESS) / (GLOBAL_MAX_THICKNESS - GLOBAL_MIN_THICKNESS);
        const z = (Math.max(0, Math.min(1, zRaw)) * 2 - 1) * 0.4;  // Clamp and scale to ±0.4

        // Dispersion → opacity (stable vowels = solid)
        const opacity = 0.2 + 0.8 * (frame.dispersion - minD) / dispersionRange;

        points.push({
            x, y, z,
            t: i / trajectory.length,
            opacity
        });
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
    windowMs: number,
    maxPoints: number
): LPCWorkerResult {
    // Step 1: Downsample to 10kHz
    const downsampled = downsample(samples, sampleRate, TARGET_SAMPLE_RATE);
    const effectiveSampleRate = TARGET_SAMPLE_RATE;

    // Step 2: Pre-emphasis
    const emphasized = preEmphasis(downsampled, PRE_EMPHASIS_ALPHA);

    // Window parameters
    const windowSamples = Math.floor((windowMs / 1000) * effectiveSampleRate);
    const hopSamples = Math.floor(windowSamples / 2); // 50% overlap

    const formantTrajectory: LPCFormantFrame[] = [];

    // Process in overlapping windows
    for (let start = 0; start + windowSamples <= emphasized.length; start += hopSamples) {
        // Extract window with Hanning taper
        const window = new Float32Array(windowSamples);
        for (let i = 0; i < windowSamples; i++) {
            const hanning = 0.5 * (1 - Math.cos(2 * Math.PI * i / windowSamples));
            window[i] = emphasized[start + i] * hanning;
        }

        // Autocorrelation
        const R = autocorrelation(window, LPC_ORDER);

        // Levinson-Durbin → LPC coefficients
        const lpcCoeffs = levinsonDurbin(R, LPC_ORDER);

        // Find polynomial roots
        const roots = findAllRoots(lpcCoeffs);

        // Convert to formants
        const { frequencies, bandwidths } = rootsToFormants(roots, effectiveSampleRate);

        const time = (start + windowSamples / 2) / emphasized.length;

        formantTrajectory.push({
            time,
            f1: frequencies[0],
            f2: frequencies[1],
            f3: frequencies[2],
            b1: bandwidths[0],
            b2: bandwidths[1],
            b3: bandwidths[2],
            dispersion: formantDispersion(frequencies[0], frequencies[1], frequencies[2])
        });
    }

    // Generate geometry
    const points = generateLPCVowelSpace(formantTrajectory, maxPoints);

    return {
        type: 'result',
        points,
        formantTrajectory
    };
}

// ============================================
// WORKER MESSAGE HANDLER
// ============================================

self.onmessage = (event: MessageEvent<LPCWorkerMessage>) => {
    const { samples, sampleRate, windowMs, maxPoints } = event.data;

    try {
        const result = processAudio(samples, sampleRate, windowMs, maxPoints);
        self.postMessage(result);
    } catch (error) {
        console.error('LPC Worker error:', error);
        // Return empty result on error
        self.postMessage({
            type: 'result',
            points: [],
            formantTrajectory: []
        });
    }
};

// Make this file a proper ES module to avoid "duplicate function" errors in TypeScript
export { };
