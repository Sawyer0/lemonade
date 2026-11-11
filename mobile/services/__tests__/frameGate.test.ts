import { FrameGate, frameDifference, frameSharpness, toGrayscale, type FrameCandidate } from '../frameGate';

/** An 8x8 flat gray frame: sharpness 0, identical to itself. */
const FLAT = new Uint8Array(64).fill(128);

/** An 8x8 checkerboard: every pixel differs from its neighbours, very sharp. */
const CHECKERBOARD = new Uint8Array(64).map((_, index) => ((Math.floor(index / 8) + index) % 2 === 0 ? 0 : 255));

function detection(confidence = 0.9, risk = false) {
    return {
        id: { obj: 'Brake Rotor', cat: 'Braking' },
        eval: { stat: risk ? ('CRITICAL' as const) : ('NORMAL' as const), risk, note: 'seen' },
        confidence,
    };
}

function candidate(overrides: Partial<FrameCandidate> = {}): FrameCandidate {
    return {
        id: 'frame-1',
        source: 'glasses',
        capturedAt: 1000,
        byteLength: 2048,
        sharpness: 500,
        motion: 2,
        changeFromLastSent: 50,
        detections: [detection()],
        ...overrides,
    };
}

describe('frame signals', () => {
    it('scores a flat frame as not sharp and a checkerboard as sharp', () => {
        expect(frameSharpness(FLAT, 8, 8)).toBe(0);
        expect(frameSharpness(CHECKERBOARD, 8, 8)).toBeGreaterThan(100);
    });

    it('rejects buffers that do not match the claimed dimensions', () => {
        expect(() => frameSharpness(new Uint8Array(4), 8, 8)).toThrow();
        expect(() => frameSharpness(new Uint8Array(4), 2, 2)).toThrow();
    });

    it('measures no difference between identical frames and full difference between black and white', () => {
        expect(frameDifference(FLAT, FLAT)).toBe(0);
        expect(frameDifference(new Uint8Array(4).fill(0), new Uint8Array(4).fill(255))).toBe(255);
    });

    it('rejects difference checks on mismatched buffers', () => {
        expect(() => frameDifference(new Uint8Array(4), new Uint8Array(8))).toThrow();
    });

    it('converts RGB to grayscale luminance', () => {
        expect(toGrayscale(new Uint8Array([255, 255, 255]))[0]).toBe(255);
        expect(toGrayscale(new Uint8Array([255, 0, 0]))[0]).toBe(76);
        expect(toGrayscale(new Uint8Array([255, 0, 0, 0, 255, 0]))).toEqual(new Uint8Array([76, 150]));
    });
});

describe('FrameGate', () => {
    it('sends a sharp, steady, changed, relevant frame to the talker at low resolution', () => {
        const gate = new FrameGate();
        const decision = gate.evaluate(candidate());
        expect(decision).toEqual({ send: true, destination: 'talker', resolution: 'low', reason: 'send' });
    });

    it('holds blurry frames', () => {
        expect(new FrameGate().evaluate(candidate({ sharpness: 0 })).reason).toBe('blurry');
    });

    it('holds unsteady frames', () => {
        expect(new FrameGate().evaluate(candidate({ motion: 100 })).reason).toBe('unsteady');
    });

    it('holds frames that did not change from the last sent frame', () => {
        const gate = new FrameGate();
        expect(gate.evaluate(candidate({ capturedAt: 1000 }), 1000).send).toBe(true);
        expect(gate.evaluate(candidate({ id: 'frame-2', capturedAt: 7000, changeFromLastSent: 0 }), 7000).reason).toBe(
            'unchanged',
        );
    });

    it('holds frames with no relevant detection and no explicit reason', () => {
        expect(new FrameGate().evaluate(candidate({ detections: [] })).reason).toBe('not relevant');
    });

    it('holds a low-confidence detection as not relevant', () => {
        expect(new FrameGate().evaluate(candidate({ detections: [detection(0.2)] })).reason).toBe('not relevant');
    });

    it('paces talker frames to one every ~5 s, with a hard 1 fps cap', () => {
        const gate = new FrameGate();
        expect(gate.evaluate(candidate({ capturedAt: 1000 }), 1000).send).toBe(true);
        expect(gate.evaluate(candidate({ id: 'f2', capturedAt: 1500 }), 1500).reason).toBe('too soon');
        expect(gate.evaluate(candidate({ id: 'f3', capturedAt: 3000 }), 3000).reason).toBe('pacing');
        expect(gate.evaluate(candidate({ id: 'f4', capturedAt: 6000 }), 6000).send).toBe(true);
    });

    it('lets an explicit reason jump the pacing, but never the 1 fps cap', () => {
        const gate = new FrameGate();
        expect(gate.evaluate(candidate({ capturedAt: 1000 }), 1000).send).toBe(true);
        expect(gate.evaluate(candidate({ id: 'f2', capturedAt: 1500, reason: 'Agent Request' }), 1500).reason).toBe(
            'too soon',
        );
        expect(gate.evaluate(candidate({ id: 'f3', capturedAt: 3000, reason: 'Agent Request' }), 3000).send).toBe(true);
    });

    it('enforces the 10-minute budget even when urgent frames bypass pacing', () => {
        const gate = new FrameGate({ maxTalkerFramesPer10Minutes: 3 });
        for (let index = 0; index < 3; index++) {
            expect(
                gate.evaluate(
                    candidate({ id: `f${index}`, capturedAt: 1000 + index * 1000, reason: 'urgent' }),
                    1000 + index * 1000,
                ).send,
            ).toBe(true);
        }
        expect(gate.evaluate(candidate({ id: 'f3', capturedAt: 4000, reason: 'urgent' }), 4000).reason).toBe('budget');
        expect(gate.framesSentInLast10Minutes(4000)).toBe(3);
        // The budget window slides: 10 minutes after the last send, none count.
        expect(gate.framesSentInLast10Minutes(3000 + 10 * 60 * 1000)).toBe(0);
    });

    it('sends fewer than 150 frames to the talker in a 10-minute glasses session', () => {
        const gate = new FrameGate();
        let sent = 0;
        let lastSentAt: number | undefined;
        // Glasses stream at ~7 fps for 10 minutes.
        for (let index = 0; index < 7 * 60 * 10; index++) {
            const now = Math.floor((index * 1000) / 7);
            const decision = gate.evaluate(candidate({ id: `f${index}`, capturedAt: now }), now);
            if (decision.send) {
                if (lastSentAt !== undefined) expect(now - lastSentAt).toBeGreaterThanOrEqual(1000);
                lastSentAt = now;
                sent++;
            }
        }
        expect(sent).toBeLessThan(150);
        expect(sent).toBeGreaterThan(0);
    });
});
