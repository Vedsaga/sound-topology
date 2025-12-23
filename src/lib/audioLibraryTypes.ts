/**
 * Multi-file audio library types
 */

import type { PhaseSpacePoint } from './phaseSpaceEmbedding';

/**
 * Parsed metadata from filename
 * Pattern: {letter}_{gender}-{speakerNum}_{clipNum}.wav
 */
export interface FileMetadata {
    letter: string;           // अ, इ, क, etc.
    gender: 'male' | 'female' | 'golden' | 'unknown';
    speakerNum: number;       // 1-10+
    clipNum: number;          // 001-999
    rawName: string;          // Original filename
    speakerId: string;        // e.g., "female-1", "golden"
}

/**
 * Processing methodology for geometry rendering
 * - signal-dynamics: Takens' phase space embedding (signal dynamics)
 * - lissajous: Averaged formant-ratio 3D curves (spectral geometry)
 * - cymatics: Formant-weighted Chladni patterns (spectral geometry)
 * - lissajous-manifold: Time-stacked formant segments → thickened tube (resonance topology)
 */
export type ProcessingMode = 'signal-dynamics' | 'lissajous' | 'cymatics' | 'lissajous-manifold';

/**
 * Time-extended formant trajectory frame
 * Captures resonance structure over time for topological analysis
 */
export interface FormantFrame {
    time: number;              // Time in seconds
    formants: [number, number, number];  // F1, F2, F3 in Hz
}

/**
 * Per-file analysis configuration
 */
export interface AnalysisConfig {
    tau: number;
    smoothing: number;
    normalize: boolean;
    preprocess: boolean;
    autoTau: boolean;
    pcaAlign: boolean;
    // Canvas rendering - independent of processing mode
    xrayMode: boolean;
    opacity: number;
    // Processing methodology
    processingMode: ProcessingMode;
    windowMs: number;         // 20-40ms for resonance extraction
}

/**
 * Complete audio file entry with state
 */
export interface AudioFileEntry {
    id: string;
    file: File;
    buffer: AudioBuffer;
    metadata: FileMetadata;
    config: AnalysisConfig;
    // Cached computation results per processing mode
    signalDynamicsPoints: PhaseSpacePoint[];  // Takens embedding
    lissajousPoints: PhaseSpacePoint[];       // Averaged formant-ratio curves
    cymaticsPoints: PhaseSpacePoint[];        // Chladni patterns
    lissajousManifoldPoints: PhaseSpacePoint[];  // Time-stacked resonance regions
    formantTrajectory?: FormantFrame[];       // Time-extended formants
    computedTau: number;
    // Status
    isProcessing: boolean;
    error?: string;
}

/**
 * Filter state for grid view
 */
export interface FilterState {
    letters: string[];        // Empty = all
    genders: ('male' | 'female' | 'golden')[];  // Empty = all
    speakerIds: string[];     // Empty = all, e.g., ["female-1", "male-2"]
}

/**
 * Parse filename into metadata
 */
export function parseFilename(filename: string): FileMetadata {
    // Remove extension
    const name = filename.replace(/\.[^/.]+$/, '');

    // Pattern: {letter}_{gender}-{speakerNum}_{clipNum}
    // Example: अ_female-1_013 or अ_golden_013
    const regexWithSpeaker = /^(.+)_(male|female|golden)-(\d+)_(\d+)$/;
    const regexGolden = /^(.+)_(golden)_(\d+)$/;

    let match = name.match(regexWithSpeaker);
    if (match) {
        const gender = match[2] as 'male' | 'female' | 'golden';
        const speakerNum = parseInt(match[3], 10);
        return {
            letter: match[1],
            gender,
            speakerNum,
            clipNum: parseInt(match[4], 10),
            rawName: filename,
            speakerId: `${gender}-${speakerNum}`
        };
    }

    match = name.match(regexGolden);
    if (match) {
        return {
            letter: match[1],
            gender: 'golden',
            speakerNum: 0,
            clipNum: parseInt(match[3], 10),
            rawName: filename,
            speakerId: 'golden'
        };
    }

    // Fallback for non-standard names
    return {
        letter: name.charAt(0) || '?',
        gender: 'unknown',
        speakerNum: 0,
        clipNum: 0,
        rawName: filename,
        speakerId: 'unknown'
    };
}

/**
 * Generate unique ID for a file
 */
export function generateFileId(): string {
    return `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Default analysis config
 */
export function getDefaultConfig(): AnalysisConfig {
    return {
        tau: 12,
        smoothing: 5,
        normalize: true,
        preprocess: true,
        autoTau: true,
        pcaAlign: true,
        xrayMode: true,
        opacity: 0.12,
        processingMode: 'lissajous-manifold',
        windowMs: 25
    };
}

/**
 * Filter files based on filter state
 */
export function filterFiles(
    files: AudioFileEntry[],
    filter: FilterState
): AudioFileEntry[] {
    return files.filter(f => {
        // Letter filter (multi-select)
        if (filter.letters.length > 0 && !filter.letters.includes(f.metadata.letter)) {
            return false;
        }

        // Gender filter (multi-select)
        if (filter.genders.length > 0 && !filter.genders.includes(f.metadata.gender as 'male' | 'female' | 'golden')) {
            return false;
        }

        // Speaker filter (multi-select by speakerId)
        if (filter.speakerIds.length > 0 && !filter.speakerIds.includes(f.metadata.speakerId)) {
            return false;
        }

        return true;
    });
}

/**
 * Get unique values from files for filter options
 */
export function getFilterOptions(files: AudioFileEntry[]) {
    const letters = new Set<string>();
    const speakerIds = new Set<string>();
    let hasMale = false;
    let hasFemale = false;
    let hasGolden = false;

    for (const f of files) {
        letters.add(f.metadata.letter);
        speakerIds.add(f.metadata.speakerId);
        if (f.metadata.gender === 'male') hasMale = true;
        if (f.metadata.gender === 'female') hasFemale = true;
        if (f.metadata.gender === 'golden') hasGolden = true;
    }

    return {
        letters: Array.from(letters).sort(),
        speakerIds: Array.from(speakerIds).sort(),
        hasMale,
        hasFemale,
        hasGolden
    };
}
