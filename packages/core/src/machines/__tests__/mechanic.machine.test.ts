import { describe, it, expect, vi } from 'vitest';
import { createActor, fromPromise, waitFor } from 'xstate';
import { mechanicMachine } from '../mechanic.machine';
import type { GatherAllContextOutput, MechanicInput, MechanicServices } from '../mechanic.machine';
import type { AIAnalysis } from '../../types/models';
import { misfireDefinitions, misfirePriors } from '../../diagnosis/loop/__tests__/fixtures';

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

    describe('diagnosis context', () => {
        it('carries parsed DTCs from the DIAGNOSE event into context', async () => {
            const actor = createActor(mechanicMachine, { input: createDefaultInput() });
            actor.start();

            actor.send({
                type: 'DIAGNOSE',
                userId: 'user-1',
                sessionId: 'session-1',
                vehicleContext: { year: 2020, make: 'Honda', model: 'Civic' },
                userQuery: 'check engine light',
                dtcCodes: [
                    {
                        code: 'P0300',
                        system: 'P',
                        systemName: 'Powertrain',
                        generic: true,
                        subsystemDigit: '3',
                        subsystem: 'Ignition system or misfire',
                        description: 'Random/multiple cylinder misfire detected',
                    },
                ],
            });

            await waitFor(actor, (s) => s.matches('intuition') || s.matches('investigating'), { timeout: 2000 });
            expect(actor.getSnapshot().context.dtcCodes.map((code) => code.code)).toEqual(['P0300']);

            actor.stop();
        });

        it('defaults dtcCodes to an empty list when none are given', () => {
            const actor = createActor(mechanicMachine, { input: createDefaultInput() });
            actor.start();

            expect(actor.getSnapshot().context.dtcCodes).toEqual([]);
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

    describe('investigating reasoner region (LM-16)', () => {
        const scanData = {
            freezeFrame: { dtc: 'P0171', rpm: 850 },
            pidLog: [
                { pid: 6, value: 12.0 },
                { pid: 7, value: 8.0 },
            ],
        };

        const driveToSynthesizing = async (overrides: Partial<MechanicInput>, diagnoseOverrides: object = {}) => {
            let reasonerInput: unknown;
            const actor = createActor(
                mechanicMachine.provide({
                    actors: {
                        generateIntuition: fromPromise(
                            async () => ({ diagnosis: 'Lean bank 1', confidence: 0.8 }) as unknown as AIAnalysis,
                        ),
                        runReasoner: fromPromise(async ({ input }: { input: unknown }) => {
                            reasonerInput = input;
                            return {
                                endState: 'finished',
                                endReason: 'model finished with a conclusion',
                                steps: [],
                                finishSummary: 'Bank 1 is lean.',
                                citations: ['total_mean=20.0'],
                            };
                        }),
                    },
                }),
                { input: createDefaultInput(overrides) },
            );
            actor.start();
            actor.send({
                type: 'DIAGNOSE',
                userId: 'u1',
                sessionId: 's1',
                vehicleContext: {},
                userQuery: 'q',
                ...diagnoseOverrides,
            });
            await waitFor(actor, (s) => s.matches('synthesizing'), { timeout: 5000 });
            const snapshot = actor.getSnapshot();
            actor.stop();
            return { snapshot, reasonerInput };
        };

        it('runs the loop when scan data is present and stores its outcome', async () => {
            const { snapshot, reasonerInput } = await driveToSynthesizing({}, { scanData, caseId: 'case-1' });
            expect(reasonerInput).toMatchObject({ caseId: 'case-1', sessionId: 's1', scanData });
            expect(snapshot.context.reasonerResult).toEqual({
                endState: 'finished',
                endReason: 'model finished with a conclusion',
                steps: [],
                finishSummary: 'Bank 1 is lean.',
                citations: ['total_mean=20.0'],
            });
        });

        it('skips the loop when no scan data is present', async () => {
            const { snapshot } = await driveToSynthesizing({});
            expect(snapshot.context.reasonerResult).toBeUndefined();
        });
    });

    describe('workup diagnostic loop (LM-04)', () => {
        const loopInput = (overrides: Record<string, unknown> = {}) => ({
            priorHypotheses: misfirePriors(),
            testDefinitions: misfireDefinitions(),
            disassemblyState: 'component-exposed' as const,
            satisfiedPreconditionIds: ['engine-off', 'engine-cool', 'engine-off-cranks-only'],
            ...overrides,
        });

        const driveToSynthesizingWithLoop = async (diagnoseOverrides: Record<string, unknown> = {}) => {
            const actor = createActor(
                mechanicMachine.provide({
                    actors: {
                        generateIntuition: fromPromise(
                            async () => ({ diagnosis: 'Misfire', confidence: 0.7 }) as unknown as AIAnalysis,
                        ),
                    },
                }),
                { input: createDefaultInput() },
            );
            actor.start();
            actor.send({
                type: 'DIAGNOSE',
                userId: 'u1',
                sessionId: 's1',
                vehicleContext: {},
                userQuery: 'q',
                ...diagnoseOverrides,
            });
            await waitFor(actor, (s) => s.matches('synthesizing'), { timeout: 5000 });
            const snapshot = actor.getSnapshot();
            actor.stop();
            return snapshot;
        };

        it('skips the workup when no loop input is prepared', async () => {
            const snapshot = await driveToSynthesizingWithLoop();
            expect(snapshot.context.diagnosticLoop).toBeNull();
        });

        it('runs the recorded results through the loop and exposes the re-ranked differential', async () => {
            const snapshot = await driveToSynthesizingWithLoop({
                diagnosticLoopInput: loopInput({
                    recordedResults: [{ testId: 'ask-misfire-conditions', outcome: 'positive', source: 'tech' }],
                }),
            });
            const loop = snapshot.context.diagnosticLoop;
            expect(loop?.differential.round).toBe(1);
            // The ask test targets coil and cylinder-3, not the plugs: the
            // plugs take the mean false-alarm rate and fall behind the coil.
            expect(loop?.differential.hypotheses[0]?.id).toBe('ignition-coil-failure');
            expect(loop?.completedTestIds).toEqual(['ask-misfire-conditions']);
            expect(loop?.decision?.kind).toBe('next-test');
            if (loop?.decision?.kind === 'next-test') {
                expect(loop.decision.nextTest.testId).toBe('measure-spark-strength');
                // The swap can still disprove the coil leader, distinct
                // from the planned measure test.
                expect(loop.decision.challenger?.testId).toBe('swap-coil-cylinder');
            }
        });

        it('escalates through the workup when the budget is already spent', async () => {
            const snapshot = await driveToSynthesizingWithLoop({
                diagnosticLoopInput: loopInput({ budgetUsd: 0 }),
            });
            expect(snapshot.context.diagnosticLoop?.decision).toMatchObject({
                kind: 'escalate',
                reason: 'budget-exhausted',
            });
        });

        it('builds the loop from the prepare actor when no input is given', async () => {
            const actor = createActor(
                mechanicMachine.provide({
                    actors: {
                        generateIntuition: fromPromise(
                            async () => ({ diagnosis: 'Misfire', confidence: 0.7 }) as unknown as AIAnalysis,
                        ),
                        prepareDiagnosticLoop: fromPromise(async () => loopInput()),
                    },
                }),
                { input: createDefaultInput() },
            );
            actor.start();
            actor.send({ type: 'DIAGNOSE', userId: 'u1', sessionId: 's1', vehicleContext: {}, userQuery: 'q' });
            await waitFor(actor, (s) => s.matches('synthesizing'), { timeout: 5000 });
            const loop = actor.getSnapshot().context.diagnosticLoop;
            expect(loop?.differential.hypotheses[0]?.id).toBe('ignition-coil-failure');
            expect(loop?.decision?.kind).toBe('next-test');
            actor.stop();
        });

        it('waits for recorded results in interactive mode, re-ranks, and leaves on END_WORKUP', async () => {
            const actor = createActor(
                mechanicMachine.provide({
                    actors: {
                        generateIntuition: fromPromise(
                            async () => ({ diagnosis: 'Misfire', confidence: 0.7 }) as unknown as AIAnalysis,
                        ),
                    },
                }),
                { input: createDefaultInput() },
            );
            actor.start();
            actor.send({
                type: 'DIAGNOSE',
                userId: 'u1',
                sessionId: 's1',
                vehicleContext: {},
                userQuery: 'q',
                diagnosticLoopInput: loopInput({
                    interactive: true,
                    recordedResults: [{ testId: 'ask-misfire-conditions', outcome: 'positive', source: 'tech' }],
                }),
            });
            await waitFor(actor, (s) => s.matches('workup'), { timeout: 5000 });
            expect(actor.getSnapshot().context.diagnosticLoop?.differential.round).toBe(1);

            actor.send({
                type: 'RECORD_TEST_RESULT',
                testId: 'measure-spark-strength',
                outcome: 'positive',
                source: 'tech',
            });
            await waitFor(actor, (s) => s.matches('workup') && s.context.diagnosticLoop?.differential.round === 2, {
                timeout: 2000,
            });
            const loop = actor.getSnapshot().context.diagnosticLoop;
            expect(loop?.differential.hypotheses[0]?.id).toBe('ignition-coil-failure');
            expect(loop?.decision?.kind).toBe('next-test');

            actor.send({ type: 'END_WORKUP' });
            await waitFor(actor, (s) => s.matches('synthesizing'), { timeout: 5000 });
            expect(actor.getSnapshot().matches('synthesizing')).toBe(true);
            actor.stop();
        });

        it('records an unknown test result as an error and stays in the workup', async () => {
            const actor = createActor(
                mechanicMachine.provide({
                    actors: {
                        generateIntuition: fromPromise(
                            async () => ({ diagnosis: 'Misfire', confidence: 0.7 }) as unknown as AIAnalysis,
                        ),
                    },
                }),
                { input: createDefaultInput() },
            );
            actor.start();
            actor.send({
                type: 'DIAGNOSE',
                userId: 'u1',
                sessionId: 's1',
                vehicleContext: {},
                userQuery: 'q',
                diagnosticLoopInput: loopInput({ interactive: true }),
            });
            await waitFor(actor, (s) => s.matches('workup'), { timeout: 5000 });
            actor.send({ type: 'RECORD_TEST_RESULT', testId: 'no-such-test', outcome: 'positive', source: 'tech' });
            await new Promise((resolve) => setTimeout(resolve, 200));
            expect(actor.getSnapshot().matches('workup')).toBe(true);
            expect(actor.getSnapshot().context.error).toContain('Unknown test in loop result');
            actor.stop();
        });
    });

    describe('snapshot restore (LM-17)', () => {
        it('resumes a crashed mid-run actor from its stored snapshot', async () => {
            let releaseGather!: () => void;
            const gatherGate = new Promise<void>((resolve) => {
                releaseGather = resolve;
            });
            let gatherCalls = 0;
            const provided = mechanicMachine.provide({
                actors: {
                    gatherAllContext: fromPromise(async () => {
                        gatherCalls += 1;
                        await gatherGate;
                        return { recalls: [], history: [], vectors: [] };
                    }),
                    generateIntuition: fromPromise(
                        async () => ({ diagnosis: 'Worn pads', confidence: 0.9 }) as unknown as AIAnalysis,
                    ),
                },
            });
            const input = createDefaultInput({
                queuedEvidence: [{ id: 'e1', kind: 'reading', summary: 'OBD: P0300 misfire', receivedAt: new Date() }],
            });
            const actor = createActor(provided, { input });
            actor.start();
            actor.send({
                type: 'DIAGNOSE',
                userId: 'user-1',
                sessionId: 'session-1',
                vehicleContext: { year: 2020, make: 'Toyota', model: 'Camry' },
                userQuery: 'engine noise',
            });
            await waitFor(actor, (s) => s.matches('gathering_context'), { timeout: 2000 });

            // The crash: the stored snapshot is the JSON round trip the
            // session repository persists, taken while the gather call was
            // still in flight. The worker dies without stopping the actor.
            const storedSnapshot = JSON.parse(JSON.stringify(actor.getSnapshot()));

            const restored = createActor(provided, { input, snapshot: storedSnapshot });
            restored.start();
            expect(restored.getSnapshot().matches('gathering_context')).toBe(true);
            expect(restored.getSnapshot().context.queuedEvidence.map((item) => item.id)).toEqual(['e1']);

            // Live services back in, then re-enter the restored state: a
            // restored promise actor never re-executes on its own, so the
            // RESUME round trip is what restarts the dead gather call.
            restored.send({ type: 'UPDATE_SERVICES', services: createMockServices() });
            restored.send({ type: 'RESUME' });
            expect(gatherCalls).toBe(2);
            releaseGather();
            await waitFor(restored, (s) => s.matches('synthesizing'), { timeout: 5000 });
            expect(restored.getSnapshot().matches('synthesizing')).toBe(true);

            restored.stop();
            actor.stop();
        });

        it('restarts the invoked actor when RESUME is sent mid-step', async () => {
            let releaseGather!: () => void;
            const gatherGate = new Promise<void>((resolve) => {
                releaseGather = resolve;
            });
            let gatherCalls = 0;
            const actor = createActor(
                mechanicMachine.provide({
                    actors: {
                        gatherAllContext: fromPromise(async () => {
                            gatherCalls += 1;
                            await gatherGate;
                            return { recalls: [], history: [], vectors: [] };
                        }),
                        generateIntuition: fromPromise(
                            async () => ({ diagnosis: 'Worn pads', confidence: 0.9 }) as unknown as AIAnalysis,
                        ),
                    },
                }),
                { input: createDefaultInput() },
            );
            actor.start();
            actor.send({
                type: 'DIAGNOSE',
                userId: 'user-1',
                sessionId: 'session-1',
                vehicleContext: { year: 2020, make: 'Toyota', model: 'Camry' },
                userQuery: 'engine noise',
            });
            await waitFor(actor, (s) => s.matches('gathering_context'), { timeout: 2000 });
            expect(gatherCalls).toBe(1);

            actor.send({ type: 'RESUME' });
            await new Promise((resolve) => setTimeout(resolve, 100));
            expect(gatherCalls).toBe(2);

            releaseGather();
            await waitFor(actor, (s) => s.matches('synthesizing'), { timeout: 5000 });
            actor.stop();
        });
    });
});
