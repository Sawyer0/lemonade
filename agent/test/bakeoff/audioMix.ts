/**
 * Audio helpers for the LM-40 bake-off runner: reading recorded shop-noise
 * beds, mixing them under synthesised speech, and scoring the agent's audio
 * for crackles and dropouts. Pure functions plus one small tracker, so the
 * mixing and the quality heuristics are unit-testable without a live room.
 */

/** 16-bit PCM mono WAV. Beds are recorded 16 kHz mono (see noise-beds.json). */
export interface WavPcm {
    sampleRate: number;
    samples: Int16Array;
}

/** Reads a 16-bit PCM mono WAV file. Throws naming the file on bad data. */
export function readWavPcm(path: string, readFile: (path: string) => Buffer): WavPcm {
    let bytes: Buffer;
    try {
        bytes = readFile(path);
    } catch (error) {
        throw new Error(`Cannot read bake-off audio ${path}: ${(error as Error).message}`);
    }
    if (bytes.length < 44 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE') {
        throw new Error(`Not a WAV file: ${path}`);
    }
    const audioFormat = bytes.readUInt16LE(20);
    const channels = bytes.readUInt16LE(22);
    const sampleRate = bytes.readUInt32LE(24);
    const bitsPerSample = bytes.readUInt16LE(34);
    if (audioFormat !== 1 || channels !== 1 || bitsPerSample !== 16) {
        throw new Error(
            `Unsupported WAV in ${path}: expected 16-bit PCM mono, got format ${audioFormat}, ${channels} channels, ${bitsPerSample} bits`,
        );
    }
    const dataSize = bytes.readUInt32LE(40);
    const sampleCount = Math.floor(dataSize / 2);
    const samples = new Int16Array(sampleCount);
    for (let i = 0; i < sampleCount; i += 1) {
        samples[i] = bytes.readInt16LE(44 + i * 2);
    }
    return { sampleRate, samples };
}

/** Linear-interpolation resample. Noise beds are 16 kHz; the room speaks 24 kHz. */
export function resampleLinear(samples: Int16Array, fromRate: number, toRate: number): Int16Array {
    if (fromRate === toRate) return Int16Array.from(samples);
    const outLength = Math.floor((samples.length * toRate) / fromRate);
    const out = new Int16Array(outLength);
    for (let i = 0; i < outLength; i += 1) {
        const position = (i * fromRate) / toRate;
        const lower = Math.floor(position);
        const fraction = position - lower;
        const upper = Math.min(lower + 1, samples.length - 1);
        out[i] = Math.round(samples[lower] * (1 - fraction) + samples[upper] * fraction);
    }
    return out;
}

/** Mixes a looping noise bed under speech at the bed's gain (dB, negative = quieter than the voice). */
export function mixNoise(speech: Int16Array, bed: Int16Array, bedGainDb: number): Int16Array {
    const gain = Math.pow(10, bedGainDb / 20);
    const mixed = new Int16Array(speech.length);
    for (let i = 0; i < speech.length; i += 1) {
        const value = speech[i] + bed[i % bed.length] * gain;
        mixed[i] = Math.max(-32768, Math.min(32767, Math.round(value)));
    }
    return mixed;
}

/** A 10 ms agent audio frame, as the runner sees it from the room. */
export interface AgentAudioFrame {
    /** Milliseconds since the turn's prompt finished playing. */
    atMs: number;
    rms: number;
    /** Fraction of samples at full scale (clipping). */
    clippedFraction: number;
}

export interface AudioQuality {
    crackles: number;
    dropouts: number;
    /** Milliseconds the agent was audibly speaking. */
    audibleMs: number;
}

const AUDIBLE_RMS = 500;
const DROPOUT_GAP_MS = 150;

/**
 * Counts crackles and dropouts in the agent's audio. A crackle is a clipped
 * frame or a frame whose loudness spikes to more than four times the recent
 * median; a dropout is a silent gap over 150 ms between the first and last
 * audible frames of one utterance. Both are heuristics for a human to confirm
 * from the recording, not a calibrated audio measurement.
 */
export class AudioQualityTracker {
    private readonly frames: AgentAudioFrame[] = [];

    feed(frame: AgentAudioFrame): void {
        this.frames.push(frame);
    }

    finish(): AudioQuality {
        let crackles = 0;
        let dropouts = 0;
        let audibleMs = 0;
        let lastAudibleAt: number | null = null;
        const recentRms: number[] = [];
        for (const frame of this.frames) {
            const audible = frame.rms > AUDIBLE_RMS;
            if (audible) {
                audibleMs += 10;
                if (lastAudibleAt !== null && frame.atMs - lastAudibleAt > DROPOUT_GAP_MS) {
                    dropouts += 1;
                }
                lastAudibleAt = frame.atMs;
            }
            const sorted = [...recentRms].sort((a, b) => a - b);
            const median = sorted.length === 0 ? 0 : sorted[Math.floor(sorted.length / 2)];
            if (frame.clippedFraction > 0.05 || (median > 0 && frame.rms > median * 4)) {
                crackles += 1;
            }
            recentRms.push(frame.rms);
            if (recentRms.length > 10) recentRms.shift();
        }
        return { crackles, dropouts, audibleMs };
    }
}
