import { describe, expect, it } from 'vitest';
import { AudioQualityTracker, mixNoise, readWavPcm, resampleLinear } from './audioMix';

function wavBytes(samples: number[], sampleRate = 16_000): Buffer {
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + samples.length * 2, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(sampleRate * 2, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write('data', 36);
    header.writeUInt32LE(samples.length * 2, 40);
    const body = Buffer.alloc(samples.length * 2);
    samples.forEach((sample, i) => body.writeInt16LE(sample, i * 2));
    return Buffer.concat([header, body]);
}

describe('readWavPcm', () => {
    it('reads 16-bit PCM mono samples', () => {
        const wav = readWavPcm('noise/impact-gun.wav', () => wavBytes([0, 1000, -1000, 32767]));
        expect(wav.sampleRate).toBe(16_000);
        expect([...wav.samples]).toEqual([0, 1000, -1000, 32767]);
    });

    it('rejects non-WAV input and stereo audio', () => {
        expect(() => readWavPcm('bad.wav', () => Buffer.from('not a wav file at all, really not'))).toThrow(
            /Not a WAV file/,
        );
        const stereo = wavBytes([0, 0]);
        stereo.writeUInt16LE(2, 22);
        expect(() => readWavPcm('stereo.wav', () => stereo)).toThrow(/16-bit PCM mono/);
    });
});

describe('resampleLinear', () => {
    it('upsamples 16 kHz to 24 kHz by interpolation', () => {
        const out = resampleLinear(new Int16Array([0, 3000]), 16_000, 24_000);
        expect(out.length).toBe(3);
        expect(out[0]).toBe(0);
        expect(out[2]).toBe(3000);
        expect(out[1]).toBeGreaterThan(0);
        expect(out[1]).toBeLessThan(3000);
    });

    it('returns a copy when the rate already matches', () => {
        const samples = new Int16Array([1, 2, 3]);
        const out = resampleLinear(samples, 24_000, 24_000);
        expect([...out]).toEqual([1, 2, 3]);
        expect(out).not.toBe(samples);
    });
});

describe('mixNoise', () => {
    it('loops a short bed under longer speech and clamps to int16', () => {
        const mixed = mixNoise(new Int16Array([1000, 1000, 1000]), new Int16Array([1000]), 0);
        expect([...mixed]).toEqual([2000, 2000, 2000]);
        const loud = mixNoise(new Int16Array([30000]), new Int16Array([30000]), 0);
        expect(loud[0]).toBe(32767);
    });

    it('applies the bed gain in dB', () => {
        // -20 dB is a 0.1x gain: a 10000 bed sample adds 1000.
        const mixed = mixNoise(new Int16Array([0]), new Int16Array([10000]), -20);
        expect(mixed[0]).toBe(1000);
    });
});

describe('AudioQualityTracker', () => {
    it('counts a silent gap mid-utterance as a dropout', () => {
        const tracker = new AudioQualityTracker();
        tracker.feed({ atMs: 0, rms: 1000, clippedFraction: 0 });
        tracker.feed({ atMs: 10, rms: 100, clippedFraction: 0 });
        tracker.feed({ atMs: 200, rms: 1000, clippedFraction: 0 });
        const quality = tracker.finish();
        expect(quality.dropouts).toBe(1);
        expect(quality.audibleMs).toBe(20);
    });

    it('counts clipped frames as crackles', () => {
        const tracker = new AudioQualityTracker();
        tracker.feed({ atMs: 0, rms: 1000, clippedFraction: 0 });
        tracker.feed({ atMs: 10, rms: 2000, clippedFraction: 0.5 });
        expect(tracker.finish().crackles).toBe(1);
    });
});
