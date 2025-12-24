/**
 * Test Signal Generator for Formant Extraction Validation
 * 
 * Synthesizes audio signals with KNOWN formant frequencies.
 * Uses direct additive synthesis for guaranteed spectral peaks.
 */

export interface SynthesizedVowel {
    name: string;
    samples: Float32Array;
    sampleRate: number;
    expectedFormants: {
        f1: number;
        f2: number;
        f3: number;
    };
    description: string;
}

export interface FormantSpec {
    f1: number;  // First formant (Hz)
    f2: number;  // Second formant (Hz)
    f3: number;  // Third formant (Hz)
    b1?: number; // Bandwidth F1 (Hz, default 60)
    b2?: number; // Bandwidth F2 (Hz, default 80)
    b3?: number; // Bandwidth F3 (Hz, default 100)
}

// ============================================
// STANDARD VOWEL FORMANTS (Peterson & Barney, 1952)
// ============================================

export const REFERENCE_VOWELS: Record<string, FormantSpec> = {
    'i': { f1: 270, f2: 2290, f3: 3010 },   // "ee" as in "beet"
    'ɪ': { f1: 390, f2: 1990, f3: 2550 },   // "ih" as in "bit"
    'e': { f1: 530, f2: 1840, f3: 2480 },   // "eh" as in "bet"
    'æ': { f1: 660, f2: 1720, f3: 2410 },   // "ae" as in "bat"
    'ɑ': { f1: 730, f2: 1090, f3: 2440 },   // "ah" as in "father"
    'ɔ': { f1: 570, f2: 840, f3: 2410 },    // "aw" as in "bought"
    'o': { f1: 440, f2: 1020, f3: 2240 },   // "oh" as in "boat"
    'ʊ': { f1: 440, f2: 1020, f3: 2240 },   // "uh" as in "book"
    'u': { f1: 300, f2: 870, f3: 2240 },    // "oo" as in "boot"
    'ʌ': { f1: 640, f2: 1190, f3: 2390 },   // "uh" as in "but"
    'ə': { f1: 500, f2: 1500, f3: 2500 },   // schwa (neutral)
};

export const SANSKRIT_VOWELS: Record<string, FormantSpec> = {
    'अ': { f1: 700, f2: 1200, f3: 2500 },
    'आ': { f1: 750, f2: 1150, f3: 2450 },
    'इ': { f1: 280, f2: 2250, f3: 2900 },
    'ई': { f1: 270, f2: 2300, f3: 3000 },
    'उ': { f1: 310, f2: 900, f3: 2300 },
    'ऊ': { f1: 300, f2: 870, f3: 2250 },
    'ए': { f1: 400, f2: 2100, f3: 2700 },
    'ओ': { f1: 400, f2: 900, f3: 2400 },
};

// ============================================
// CORE SYNTHESIS: Additive with Formant Envelope
// ============================================

/**
 * Lorentzian (Cauchy) resonance curve - the correct shape for formants
 */
function lorentzian(freq: number, center: number, halfWidth: number): number {
    const x = (freq - center) / halfWidth;
    return 1 / (1 + x * x);
}

/**
 * Calculate the amplitude of a harmonic based on formant structure
 */
function getHarmonicAmplitude(
    harmonicFreq: number,
    formants: FormantSpec,
    f0: number
): number {
    const b1 = (formants.b1 ?? 50) / 2;  // Narrower for sharper peaks
    const b2 = (formants.b2 ?? 60) / 2;
    const b3 = (formants.b3 ?? 80) / 2;
    
    // Each formant contributes a resonance peak
    // For back vowels where F1 and F2 are close, we need F2 to be strong enough
    // to create a distinct peak
    const r1 = lorentzian(harmonicFreq, formants.f1, b1) * 1.0;
    const r2 = lorentzian(harmonicFreq, formants.f2, b2) * 0.8;  // Stronger F2
    const r3 = lorentzian(harmonicFreq, formants.f3, b3) * 0.3;
    
    // Combine resonances (they add, not multiply)
    const formantEnvelope = r1 + r2 + r3;
    
    // Apply glottal source spectrum: -6dB/octave rolloff (less aggressive)
    // This preserves F2 energy better for back vowels
    const harmonicNumber = harmonicFreq / f0;
    const sourceSpectrum = 1 / harmonicNumber;
    
    return formantEnvelope * sourceSpectrum;
}

/**
 * Synthesize vowel using additive synthesis with explicit formant peaks
 * This is the most reliable method for creating test signals
 */
export function synthesizeVowelSourceFilter(
    formants: FormantSpec,
    options: {
        sampleRate?: number;
        duration?: number;
        f0?: number;
    } = {}
): Float32Array {
    const sampleRate = options.sampleRate ?? 44100;
    const duration = options.duration ?? 0.5;
    const f0 = options.f0 ?? 120;
    
    const numSamples = Math.floor(sampleRate * duration);
    const samples = new Float32Array(numSamples);
    
    // Generate harmonics up to Nyquist
    const nyquist = sampleRate / 2;
    const maxHarmonic = Math.floor(nyquist / f0);
    
    // Pre-calculate harmonic amplitudes
    const amplitudes: number[] = [];
    for (let h = 1; h <= maxHarmonic; h++) {
        amplitudes.push(getHarmonicAmplitude(h * f0, formants, f0));
    }
    
    // Normalize amplitudes so max is 1
    const maxAmp = Math.max(...amplitudes);
    for (let i = 0; i < amplitudes.length; i++) {
        amplitudes[i] /= maxAmp;
    }
    
    // Generate signal
    for (let i = 0; i < numSamples; i++) {
        const t = i / sampleRate;
        let sample = 0;
        
        for (let h = 1; h <= maxHarmonic; h++) {
            const freq = h * f0;
            sample += amplitudes[h - 1] * Math.sin(2 * Math.PI * freq * t);
        }
        
        samples[i] = sample;
    }
    
    // Final normalization
    const peak = Math.max(...samples.map(Math.abs));
    if (peak > 0) {
        for (let i = 0; i < numSamples; i++) {
            samples[i] *= 0.9 / peak;
        }
    }
    
    // Apply gentle fade in/out to avoid clicks
    const fadeLen = Math.floor(sampleRate * 0.01);
    for (let i = 0; i < fadeLen; i++) {
        const fade = i / fadeLen;
        samples[i] *= fade;
        samples[numSamples - 1 - i] *= fade;
    }
    
    return samples;
}

// Alias for compatibility
export const synthesizeVowelAdditive = synthesizeVowelSourceFilter;

/**
 * Generate test vowels for validation
 */
export function generateTestVowels(
    sampleRate: number = 44100,
    duration: number = 0.5
): SynthesizedVowel[] {
    const testVowels: SynthesizedVowel[] = [];
    
    const vowelsToTest = [
        { key: 'i', name: '/i/ (ee)', desc: 'Close front - highest F2' },
        { key: 'ɑ', name: '/ɑ/ (ah)', desc: 'Open back - highest F1' },
        { key: 'u', name: '/u/ (oo)', desc: 'Close back - lowest F1 & F2' },
        { key: 'ə', name: '/ə/ (schwa)', desc: 'Central neutral' },
        { key: 'æ', name: '/æ/ (ae)', desc: 'Open front' },
    ];
    
    for (const v of vowelsToTest) {
        const formants = REFERENCE_VOWELS[v.key];
        testVowels.push({
            name: `${v.name}`,
            samples: synthesizeVowelSourceFilter(formants, { sampleRate, duration }),
            sampleRate,
            expectedFormants: { f1: formants.f1, f2: formants.f2, f3: formants.f3 },
            description: `${v.desc} - F1:${formants.f1} F2:${formants.f2} F3:${formants.f3}`
        });
    }
    
    return testVowels;
}

/**
 * Generate a pure tone (for sanity check)
 */
export function generatePureTone(
    frequency: number,
    sampleRate: number = 44100,
    duration: number = 0.5
): Float32Array {
    const numSamples = Math.floor(sampleRate * duration);
    const samples = new Float32Array(numSamples);
    
    for (let i = 0; i < numSamples; i++) {
        samples[i] = Math.sin(2 * Math.PI * frequency * i / sampleRate);
    }
    
    return samples;
}

/**
 * Generate chirp (frequency sweep)
 */
export function generateChirp(
    startFreq: number,
    endFreq: number,
    sampleRate: number = 44100,
    duration: number = 1.0
): Float32Array {
    const numSamples = Math.floor(sampleRate * duration);
    const samples = new Float32Array(numSamples);
    
    for (let i = 0; i < numSamples; i++) {
        const t = i / sampleRate;
        const phase = 2 * Math.PI * (startFreq * t + (endFreq - startFreq) * t * t / (2 * duration));
        samples[i] = Math.sin(phase);
    }
    
    return samples;
}

/**
 * Generate white noise
 */
export function generateWhiteNoise(
    sampleRate: number = 44100,
    duration: number = 0.5
): Float32Array {
    const numSamples = Math.floor(sampleRate * duration);
    const samples = new Float32Array(numSamples);
    
    for (let i = 0; i < numSamples; i++) {
        samples[i] = Math.random() * 2 - 1;
    }
    
    return samples;
}

// ============================================
// WAV FILE EXPORT
// ============================================

export function downloadSynthesizedVowel(
    vowelKey: string,
    vowelSet: 'reference' | 'sanskrit' = 'reference'
): void {
    const formants = vowelSet === 'reference' 
        ? REFERENCE_VOWELS[vowelKey] 
        : SANSKRIT_VOWELS[vowelKey];
    
    if (!formants) {
        console.error(`Unknown vowel: ${vowelKey}`);
        return;
    }
    
    const sampleRate = 44100;
    const samples = synthesizeVowelSourceFilter(formants, {
        sampleRate,
        duration: 1.0,
        f0: 120
    });
    
    const wavBuffer = createWavFile(samples, sampleRate);
    const blob = new Blob([wavBuffer], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `synth_${vowelKey}_F1-${formants.f1}_F2-${formants.f2}_F3-${formants.f3}.wav`;
    a.click();
    
    URL.revokeObjectURL(url);
}

function createWavFile(samples: Float32Array, sampleRate: number): ArrayBuffer {
    const numChannels = 1;
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = samples.length * bytesPerSample;
    const bufferSize = 44 + dataSize;
    
    const buffer = new ArrayBuffer(bufferSize);
    const view = new DataView(buffer);
    
    // RIFF header
    writeString(view, 0, 'RIFF');
    view.setUint32(4, bufferSize - 8, true);
    writeString(view, 8, 'WAVE');
    
    // fmt chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    
    // data chunk
    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);
    
    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
        const sample = Math.max(-1, Math.min(1, samples[i]));
        const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        view.setInt16(offset, intSample, true);
        offset += 2;
    }
    
    return buffer;
}

function writeString(view: DataView, offset: number, str: string): void {
    for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
    }
}
