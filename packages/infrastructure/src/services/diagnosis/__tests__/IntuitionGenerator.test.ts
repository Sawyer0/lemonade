import { describe, it, expect, vi } from 'vitest';
import { IntuitionGenerator } from '../IntuitionGenerator';
import type { CaseEvidence, ILogger } from '@lemonade/core';
import type { GeminiCoreAdapter } from '../../../ai/GeminiCoreAdapter';

const silentLogger: ILogger = {
    info: () => undefined,
    error: () => undefined,
    warn: () => undefined,
    debug: () => undefined,
};

function evidence(id: string, kind: CaseEvidence['kind'], summary: string): CaseEvidence {
    return { id, kind, summary, receivedAt: new Date('2026-11-11T10:00:00.000Z') };
}

describe('IntuitionGenerator queued evidence (LM-17)', () => {
    it('folds every piece of queued evidence into the one model call', async () => {
        let capturedPrompt = '';
        const fakeModel = {
            generateContent: vi.fn(async (request: { contents: Array<{ parts: Array<{ text: string }> }> }) => {
                capturedPrompt = request.contents[0]?.parts[0]?.text ?? '';
                return {
                    response: {
                        candidates: [
                            {
                                content: {
                                    parts: [
                                        {
                                            text: JSON.stringify({
                                                diagnosis: 'Misfire on cylinder 3',
                                                confidence: 0.85,
                                                reasoning: 'Codes and smoke point to cylinder 3.',
                                                investigationPlan: ['Compression test'],
                                            }),
                                        },
                                    ],
                                },
                            },
                        ],
                    },
                };
            }),
        };
        const coreAdapter = {
            getGenerativeModel: vi.fn().mockReturnValue(fakeModel),
            commonTools: [],
            commonSafetySettings: [],
        } as unknown as GeminiCoreAdapter;
        const generator = new IntuitionGenerator(coreAdapter, silentLogger);

        const result = await generator.generate(
            'engine misfire',
            { year: 2020, make: 'Toyota', model: 'Camry', vin: 'VIN1' },
            [],
            [],
            'session-1',
            [
                evidence('e1', 'reading', 'OBD: P0300 misfire'),
                evidence('e2', 'frame', 'Frame: smoke from cylinder 3'),
            ],
        );

        expect(result.diagnosis).toBe('Misfire on cylinder 3');
        expect(capturedPrompt).toContain('[reading] OBD: P0300 misfire');
        expect(capturedPrompt).toContain('[frame] Frame: smoke from cylinder 3');
    });

    it('says so in the prompt when no evidence arrived', async () => {
        let capturedPrompt = '';
        const fakeModel = {
            generateContent: vi.fn(async (request: { contents: Array<{ parts: Array<{ text: string }> }> }) => {
                capturedPrompt = request.contents[0]?.parts[0]?.text ?? '';
                return {
                    response: {
                        candidates: [
                            {
                                content: {
                                    parts: [{ text: JSON.stringify({ diagnosis: 'Unknown Issue', confidence: 0.5 }) }],
                                },
                            },
                        ],
                    },
                };
            }),
        };
        const coreAdapter = {
            getGenerativeModel: vi.fn().mockReturnValue(fakeModel),
            commonTools: [],
            commonSafetySettings: [],
        } as unknown as GeminiCoreAdapter;
        const generator = new IntuitionGenerator(coreAdapter, silentLogger);

        await generator.generate('engine noise', { year: 2020, make: 'Toyota', model: 'Camry' }, [], [], 'session-1');

        expect(capturedPrompt).toContain('No new evidence since the run started.');
    });
});
