import type { SemanticTriageResult } from '@lemonade/core';

/**
 * The phone gates frames before any reach the talker: sharp, steady, changed
 * from the last sent frame, and relevant (on-device triage). The talker gets
 * at most one frame a second and usually one every ~5 s, so a 10-minute
 * session sends fewer than 150 frames. High-resolution stills never pass
 * through this gate; they go straight to the reasoner and the ledger.
 *
 * The gate is pure: callers compute the signals from the frame bytes (see
 * frameSharpness / frameDifference) and the gate decides. That keeps the
 * policy unit-testable with fixture buffers and independent of the camera
 * or glasses frame source.
 */

export type FrameSource = 'glasses' | 'phone';

/** One frame offered to the gate, with its on-device signals already computed. */
export interface FrameCandidate {
    id: string;
    source: FrameSource;
    capturedAt: number;
    /** JPEG byte length, for logging; the gate never sends the bytes itself. */
    byteLength: number;
    /** Variance of the Laplacian over the frame's grayscale pixels. Sharp frames score in the hundreds or more; blur is near zero. */
    sharpness: number;
    /** Mean absolute difference from the previous frame (0-255). Low means the camera is steady. */
    motion: number;
    /** Mean absolute difference from the last frame sent to the talker (0-255). */
    changeFromLastSent: number;
    /** On-device triage detections for this frame. */
    detections: SemanticTriageResult[];
    /**
     * An explicit reason the frame is wanted (agent burst request, user
     * speaking, proactive escalation). Makes the frame relevant without a
     * detection and lets it jump the 5 s pacing, never the 1 fps cap.
     */
    reason?: string;
}

export interface FrameGateDecision {
    send: boolean;
    /** Talker frames are always low resolution; the gate never sends a still. */
    destination: 'talker' | 'none';
    resolution: 'low';
    /** Why the frame was sent or held. */
    reason: string;
}

export interface FrameGateConfig {
    /** Target spacing between talker frames; the usual one-per-~5 s cadence. */
    minTalkerIntervalMs: number;
    /** Hard cap: the talker never gets more than one frame a second. */
    minFrameIntervalMs: number;
    /** Done-when budget: fewer than this many talker frames per 10 minutes. */
    maxTalkerFramesPer10Minutes: number;
    /** Minimum Laplacian variance to count as sharp. */
    minSharpness: number;
    /** Maximum mean frame-to-frame difference to count as steady. */
    maxMotion: number;
    /** Minimum mean difference from the last sent frame to count as changed. */
    minChange: number;
    /** Minimum triage confidence for a detection to make a frame relevant. */
    minDetectionConfidence: number;
}

export const DEFAULT_FRAME_GATE_CONFIG: FrameGateConfig = {
    minTalkerIntervalMs: 5000,
    minFrameIntervalMs: 1000,
    maxTalkerFramesPer10Minutes: 150,
    minSharpness: 100,
    maxMotion: 12,
    minChange: 8,
    minDetectionConfidence: 0.5,
};

const TEN_MINUTES_MS = 10 * 60 * 1000;

/** Luminance (ITU-R BT.601) of RGB888 bytes, one byte per pixel. */
export function toGrayscale(rgb: Uint8Array): Uint8Array {
    const gray = new Uint8Array(Math.floor(rgb.byteLength / 3));
    for (let pixel = 0; pixel < gray.byteLength; pixel++) {
        const offset = pixel * 3;
        gray[pixel] = Math.round(0.299 * rgb[offset] + 0.587 * rgb[offset + 1] + 0.114 * rgb[offset + 2]);
    }
    return gray;
}

/**
 * Sharpness as the variance of the Laplacian over the interior pixels.
 * A flat frame scores 0; a sharp frame with edges scores in the hundreds or
 * more. Throws when the buffer is smaller than the claimed dimensions.
 */
export function frameSharpness(grayscale: Uint8Array, width: number, height: number): number {
    if (width < 3 || height < 3) throw new Error('frameSharpness needs at least a 3x3 frame');
    if (grayscale.byteLength < width * height) {
        throw new Error(`frameSharpness needs ${width * height} grayscale bytes, got ${grayscale.byteLength}`);
    }
    let sum = 0;
    let sumSquares = 0;
    let count = 0;
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const offset = y * width + x;
            const laplacian =
                grayscale[offset - width] +
                grayscale[offset - 1] +
                grayscale[offset + 1] +
                grayscale[offset + width] -
                4 * grayscale[offset];
            sum += laplacian;
            sumSquares += laplacian * laplacian;
            count++;
        }
    }
    const mean = sum / count;
    return sumSquares / count - mean * mean;
}

/** Mean absolute per-pixel difference between two grayscale buffers (0-255). Throws on mismatched lengths. */
export function frameDifference(first: Uint8Array, second: Uint8Array): number {
    if (first.byteLength !== second.byteLength) {
        throw new Error(`frameDifference needs equal-length buffers, got ${first.byteLength} and ${second.byteLength}`);
    }
    if (first.byteLength === 0) return 0;
    let total = 0;
    for (let index = 0; index < first.byteLength; index++) {
        total += Math.abs(first[index] - second[index]);
    }
    return total / first.byteLength;
}

/** The frame gate: sharp, steady, changed, relevant, paced, and budgeted. */
export class FrameGate {
    private readonly config: FrameGateConfig;
    private sentAt: number[] = [];
    private lastSentAt: number | undefined;

    constructor(config: Partial<FrameGateConfig> = {}) {
        this.config = { ...DEFAULT_FRAME_GATE_CONFIG, ...config };
    }

    /** Talker frames sent in the last 10 minutes, the done-when budget window. */
    framesSentInLast10Minutes(now: number = Date.now()): number {
        this.sentAt = this.sentAt.filter((sent) => now - sent < TEN_MINUTES_MS);
        return this.sentAt.length;
    }

    reset(): void {
        this.sentAt = [];
        this.lastSentAt = undefined;
    }

    evaluate(candidate: FrameCandidate, now: number = Date.now()): FrameGateDecision {
        const held = (reason: string): FrameGateDecision => ({ send: false, destination: 'none', resolution: 'low', reason });
        const urgent = candidate.reason !== undefined || candidate.detections.some((detection) => detection.eval.risk);

        if (this.framesSentInLast10Minutes(now) >= this.config.maxTalkerFramesPer10Minutes) {
            return held('budget');
        }
        if (this.lastSentAt !== undefined) {
            const sinceLastSent = now - this.lastSentAt;
            if (sinceLastSent < this.config.minFrameIntervalMs) return held('too soon');
            if (sinceLastSent < this.config.minTalkerIntervalMs && !urgent) return held('pacing');
        }
        if (candidate.sharpness < this.config.minSharpness) return held('blurry');
        if (candidate.motion > this.config.maxMotion) return held('unsteady');
        if (this.lastSentAt !== undefined && candidate.changeFromLastSent < this.config.minChange) {
            return held('unchanged');
        }
        const relevant =
            candidate.reason !== undefined ||
            candidate.detections.some((detection) => (detection.confidence ?? 1) >= this.config.minDetectionConfidence);
        if (!relevant) return held('not relevant');

        this.sentAt.push(now);
        this.lastSentAt = now;
        return { send: true, destination: 'talker', resolution: 'low', reason: 'send' };
    }
}
