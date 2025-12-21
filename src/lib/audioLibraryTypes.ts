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
    gender: 'male' | 'female' | 'unknown';
    speakerNum: number;       // 1-10+
    clipNum: number;          // 001-999
    rawName: string;          // Original filename
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
    xrayMode: boolean;
    opacity: number;
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
    // Cached computation results
    points: PhaseSpacePoint[];
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
    gender: 'all' | 'male' | 'female';
    speakerNums: number[];    // Empty = all
}

/**
 * Parse filename into metadata
 */
export function parseFilename(filename: string): FileMetadata {
    // Remove extension
    const name = filename.replace(/\.[^/.]+$/, '');

    // Pattern: {letter}_{gender}-{speakerNum}_{clipNum}
    // Example: अ_female-1_013
    const regex = /^(.+)_(male|female)-(\d+)_(\d+)$/;
    const match = name.match(regex);

    if (match) {
        return {
            letter: match[1],
            gender: match[2] as 'male' | 'female',
            speakerNum: parseInt(match[3], 10),
            clipNum: parseInt(match[4], 10),
            rawName: filename
        };
    }

    // Fallback for non-standard names
    return {
        letter: name.charAt(0) || '?',
        gender: 'unknown',
        speakerNum: 0,
        clipNum: 0,
        rawName: filename
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
        opacity: 0.12
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
        // Letter filter
        if (filter.letters.length > 0 && !filter.letters.includes(f.metadata.letter)) {
            return false;
        }

        // Gender filter
        if (filter.gender !== 'all' && f.metadata.gender !== filter.gender) {
            return false;
        }

        // Speaker filter
        if (filter.speakerNums.length > 0 && !filter.speakerNums.includes(f.metadata.speakerNum)) {
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
    const speakerNums = new Set<number>();
    let hasMale = false;
    let hasFemale = false;

    for (const f of files) {
        letters.add(f.metadata.letter);
        speakerNums.add(f.metadata.speakerNum);
        if (f.metadata.gender === 'male') hasMale = true;
        if (f.metadata.gender === 'female') hasFemale = true;
    }

    return {
        letters: Array.from(letters).sort(),
        speakerNums: Array.from(speakerNums).sort((a, b) => a - b),
        hasMale,
        hasFemale
    };
}
