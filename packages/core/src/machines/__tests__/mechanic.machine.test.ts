import { describe, it, expect, vi } from 'vitest';
import { createActor, fromPromise, waitFor } from 'xstate';
import { mechanicMachine } from '../mechanic.machine';
import type { GatherAllContextOutput, MechanicInput, MechanicServices } from '../mechanic.machine';
import type { AIAnalysis } from '../../types/models';

describe('mechanicMachine', () => {
    const createMockServices = (
        overrides: Partial<{
            memory: { search: ReturnType<typeof vi.fn> };
            nhtsa: { checkRecalls: ReturnType<typeof vi.fn> };
            vector: { search: ReturnType<typeof vi.fn> };
            search: { search: ReturnType<typeof vi.fn> };
            chat: { verifyHypothesis: ReturnType<typeof vi.fn> };
            vision: { analyzeUploadedVideo: ReturnType<typeof vi.fn> };
        }> = {},
    ): MechanicServices =>
        ({
            memory: { search: vi.fn().mockResolvedValue([]) },
            nhtsa: { checkRecalls: vi.fn().mockResolvedValue([]) },
            vector: { search: vi.fn().mockResolvedValue([]) },
            search: { search: vi.fn().mockResolvedValue({ results: [], queryUsed: '', totalFound: 0 }) },
            chat: { verifyHypothesis: vi.fn().mockResolvedValue({ isVerified: false, source: null, reasoning: '' }) },
            vision: {
                analyzeUploadedVideo: vi.fn().mockResolvedValue({
                    diagnosis: 'Test',
                    reasoning: 'Test reasoning',
                    investigationPlan: [],
                    confidence: 0.9,
                    visual_evidence: [],
                    acoustic_evidence: [],
                    severity: 'low',
                    safety_alert: false,
                    suggested_actions: [],
                    engineDescription: 'Test engine',
                    isStock: true,
                    visualConflictDetected: false,
                    detectedCondition: 'unknown',
                }),
            },
            ...overrides,
        }) as unknown as MechanicServices;

    const createDefaultInput = (overrides: Partial<MechanicInput> = {}): MechanicInput => ({
        sessionId: 'test-session',
        userId: 'test-user',
        vehicleContext: { year: 2020, make: 'Toyota', model: 'Camry', vin: 'TEST123' },
        userQuery: 'engine noise',
        videoUrl: 'http://example.com/video.mp4',
        services: createMockServices(),
        ...overrides,
    });

    describe('state transitions', () => {
        it('should start in idle state', () => {
            const actor = createActor(mechanicMachine, { input: createDefaultInput() });
            actor.start();

            expect(actor.getSnapshot().value).toBe('idle');
            actor.stop();
        });

        it('should transition to intuition eventually on DIAGNOSE', async () => {
            const actor = createActor(mechanicMachine, { input: createDefaultInput() });
            actor.start();

            actor.send({
                type: 'DIAGNOSE',
                userId: 'user-1',
                sessionId: 'session-1',
                vehicleContext: { year: 2020, make: 'Honda', model: 'Civic' },
                userQuery: 'brake squeak',
            });

            // Fast transition through gathering_context to intuition
            await waitFor(actor, (s) => s.matches('intuition') || s.matches('investigating'), { timeout: 2000 });
            expect(actor.getSnapshot().matches('idle')).toBe(false);

            actor.stop();
        });

        it('should handle DIAGNOSE with missing videoUrl', async () => {
            const input = createDefaultInput({ videoUrl: undefined });
            const actor = createActor(mechanicMachine, { input });
            actor.start();

            actor.send({
                type: 'DIAGNOSE',
                userId: 'user-1',
                sessionId: 'session-1',
                vehicleContext: { year: 2020, make: 'Honda', model: 'Civic' },
                userQuery: 'brake squeak',
            });

            await waitFor(actor, (s) => s.matches('synthesizing'), { timeout: 5000 });
            expect(actor.getSnapshot().matches('synthesizing')).toBe(true);

            actor.stop();
        });
    });

    describe('gathering_context state', () => {
        it('should store context data', async () => {
            const mockHistory = [{ content: 'history' }];
            const mockRecalls = [{ id: 'recall-1' }];
            const mockVectors = [{ id: 'doc-1' }];

            const actor = createActor(
                mechanicMachine.provide({
                    actors: {
                        gatherAllContext: fromPromise(
                            async () =>
                                ({
                                    history: mockHistory,
                                    recalls: mockRecalls,
                                    vectors: mockVectors,
                                }) as unknown as GatherAllContextOutput,
                        ),
                    },
                }),
                { input: createDefaultInput() },
            );

            actor.start();
            actor.send({ type: 'DIAGNOSE', userId: 'u1', sessionId: 's1', vehicleContext: {}, userQuery: 'q' });

            await waitFor(actor, (s) => s.matches('investigating') || s.matches('synthesizing'), { timeout: 5000 });
            const ctx = actor.getSnapshot().context;
            expect(ctx.vehicleHistory).toEqual(mockHistory);
            expect(ctx.nhtsaResults).toEqual(mockRecalls);
            expect(ctx.embeddingInfo).toEqual(mockVectors);

            actor.stop();
        });
    });

    describe('vision_verifying state', () => {
        it('should store visualAnalysis on success', async () => {
            const mockAnalysis = {
                diagnosis: 'Worn brake pads',
                reasoning: 'test',
                investigationPlan: [],
                confidence: 0.95,
                visual_evidence: ['visible wear'],
                acoustic_evidence: ['squeaking sound'],
                severity: 'medium',
                safety_alert: false,
                suggested_actions: ['Replace brake pads'],
                engineDescription: 'test',
                isStock: true,
                visualConflictDetected: false,
                detectedCondition: 'unknown',
            };

            const actor = createActor(
                mechanicMachine.provide({
                    actors: {
                        // Intuition must succeed for the machine to reach the vision step.
                        generateIntuition: fromPromise(
                            async () => ({ ...mockAnalysis, diagnosis: 'Initial hypothesis' }) as AIAnalysis,
                        ),
                        visionAnalysis: fromPromise(async () => mockAnalysis as AIAnalysis),
                    },
                }),
                { input: createDefaultInput({ videoUrl: 'v' }) },
            );

            actor.start();
            actor.send({
                type: 'DIAGNOSE',
                userId: 'u1',
                sessionId: 's1',
                vehicleContext: {},
                userQuery: 'q',
                videoUrl: 'v',
            });

            await waitFor(actor, (s) => s.matches('synthesizing'), { timeout: 5000 });
            expect(actor.getSnapshot().context.visualAnalysis).toEqual(mockAnalysis);

            actor.stop();
        });
    });
});
