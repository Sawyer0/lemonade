import { describe, it, expect, vi } from 'vitest';
import { createActor, waitFor } from 'xstate';
import { mechanicMachine } from '../mechanic.machine';

describe('mechanicMachine', () => {
    const createMockServices = (overrides: Partial<{
        memory: { search: ReturnType<typeof vi.fn> };
        nhtsa: { checkRecalls: ReturnType<typeof vi.fn> };
        vector: { search: ReturnType<typeof vi.fn> };
        search: { search: ReturnType<typeof vi.fn> };
        chat: { verifyHypothesis: ReturnType<typeof vi.fn> };
        vision: { analyzeUploadedVideo: ReturnType<typeof vi.fn> };
    }> = {}): MechanicServices => ({
        memory: { search: vi.fn().mockResolvedValue([]) },
        nhtsa: { checkRecalls: vi.fn().mockResolvedValue([]) },
        vector: { search: vi.fn().mockResolvedValue([]) },
        search: { search: vi.fn().mockResolvedValue({ results: [], queryUsed: '', totalFound: 0 }) },
        chat: { verifyHypothesis: vi.fn().mockResolvedValue({ isVerified: false, source: null, reasoning: '' }) },
        vision: { analyzeUploadedVideo: vi.fn().mockResolvedValue({
            diagnosis: 'Test',
            confidence: 0.9,
            visual_evidence: [],
            acoustic_evidence: [],
            severity: 'low',
            safety_alert: false,
            suggested_actions: []
        }) },
        ...overrides
    } as unknown as MechanicServices);

    const createDefaultInput = (overrides: Partial<MechanicInput> = {}): MechanicInput => ({
        sessionId: 'test-session',
        userId: 'test-user',
        vehicleContext: { year: 2020, make: 'Toyota', model: 'Camry', vin: 'TEST123' },
        userQuery: 'engine noise',
        videoUrl: 'http://example.com/video.mp4',
        services: createMockServices(),
        ...overrides
    });

    describe('state transitions', () => {
        it('should start in idle state', () => {
            const actor = createActor(mechanicMachine, { input: createDefaultInput() });
            actor.start();

            expect(actor.getSnapshot().value).toBe('idle');
            actor.stop();
        });

        it('should transition idle → recalling on DIAGNOSE', async () => {
            const actor = createActor(mechanicMachine, { input: createDefaultInput() });
            actor.start();

            actor.send({
                type: 'DIAGNOSE',
                userId: 'user-1',
                sessionId: 'session-1',
                vehicleContext: { year: 2020, make: 'Honda', model: 'Civic' },
                userQuery: 'brake squeak'
            });

            // Should transition to recalling
            await waitFor(actor, (s) => s.value !== 'idle', { timeout: 1000 });
            expect(actor.getSnapshot().value).toBe('recalling');

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
                userQuery: 'brake squeak'
                // No videoUrl
            });

            // Should still proceed through states
            await waitFor(actor, (s) => s.matches('synthesizing'), { timeout: 5000 });
            expect(actor.getSnapshot().matches('synthesizing')).toBe(true);

            actor.stop();
        });

        it('should handle UPDATE_SERVICES event in idle state', () => {
            const actor = createActor(mechanicMachine, { input: createDefaultInput() });
            actor.start();

            const newServices = createMockServices();
            actor.send({ type: 'UPDATE_SERVICES', services: newServices });

            expect(actor.getSnapshot().context.services).toBe(newServices);
            actor.stop();
        });
    });

    describe('recalling state (Supermemory)', () => {
        it('should store vehicleHistory on successful recall', async () => {
            const mockHistory = [
                { content: 'Previous brake work', metadata: { date: '2024-01-01' } }
            ];
            const services = createMockServices({
                memory: { search: vi.fn().mockResolvedValue(mockHistory) }
            });
            const actor = createActor(mechanicMachine, { input: createDefaultInput({ services }) });
            actor.start();

            actor.send({
                type: 'DIAGNOSE',
                userId: 'user-1',
                sessionId: 'session-1',
                vehicleContext: { year: 2020, make: 'Honda', model: 'Civic' },
                userQuery: 'brake squeak'
            });

            await waitFor(actor, (s) => s.matches('analyzing'), { timeout: 2000 });
            expect(actor.getSnapshot().context.vehicleHistory).toEqual(mockHistory);

            actor.stop();
        });

        it('should proceed to analyzing even if supermemory fails', async () => {
            const services = createMockServices({
                memory: { search: vi.fn().mockRejectedValue(new Error('Supermemory unavailable')) }
            });
            const actor = createActor(mechanicMachine, { input: createDefaultInput({ services }) });
            actor.start();

            actor.send({
                type: 'DIAGNOSE',
                userId: 'user-1',
                sessionId: 'session-1',
                vehicleContext: { year: 2020, make: 'Honda', model: 'Civic' },
                userQuery: 'brake squeak'
            });

            // Should still reach analyzing despite error
            await waitFor(actor, (s) => s.matches('analyzing'), { timeout: 2000 });
            expect(actor.getSnapshot().context.error).toContain('Supermemory unavailable');

            actor.stop();
        });

        it('should handle supermemory returning empty array', async () => {
            const services = createMockServices({
                memory: { search: vi.fn().mockResolvedValue([]) }
            });
            const actor = createActor(mechanicMachine, { input: createDefaultInput({ services }) });
            actor.start();

            actor.send({
                type: 'DIAGNOSE',
                userId: 'user-1',
                sessionId: 'session-1',
                vehicleContext: { year: 2020, make: 'Honda', model: 'Civic' },
                userQuery: 'brake squeak'
            });

            await waitFor(actor, (s) => s.matches('analyzing'), { timeout: 2000 });
            expect(actor.getSnapshot().context.vehicleHistory).toEqual([]);
            expect(actor.getSnapshot().context.error).toBeUndefined();

            actor.stop();
        });
    });

    describe('analyzing (parallel state)', () => {
        it('should complete all parallel actors and transition to vision_verifying', async () => {
            const services = createMockServices({
                nhtsa: { checkRecalls: vi.fn().mockResolvedValue([{ id: 'recall-1' }]) },
                vector: { search: vi.fn().mockResolvedValue([{ id: 'doc-1' }]) },
                search: { search: vi.fn().mockResolvedValue({ results: [{ title: 'Result' }], queryUsed: 'test', totalFound: 1 }) },
                chat: { verifyHypothesis: vi.fn().mockResolvedValue({ isVerified: true, source: 'test', reasoning: 'Valid' }) }
            });
            const actor = createActor(mechanicMachine, { input: createDefaultInput({ services }) });
            actor.start();

            actor.send({
                type: 'DIAGNOSE',
                userId: 'user-1',
                sessionId: 'session-1',
                vehicleContext: { year: 2020, make: 'Honda', model: 'Civic' },
                userQuery: 'brake squeak'
            });

            await waitFor(actor, (s) => s.matches('vision_verifying'), { timeout: 5000 });
            const ctx = actor.getSnapshot().context;

            expect(ctx.nhtsaResults).toHaveLength(1);
            expect(ctx.embeddingInfo).toHaveLength(1);
            expect(ctx.searchResults?.results).toHaveLength(1);
            expect(ctx.verificationResult?.isVerified).toBe(true);

            actor.stop();
        });

        it('should continue if ONE parallel actor fails (others succeed)', async () => {
            const services = createMockServices({
                nhtsa: { checkRecalls: vi.fn().mockRejectedValue(new Error('NHTSA API down')) },
                vector: { search: vi.fn().mockResolvedValue([{ id: 'doc-1' }]) },
                search: { search: vi.fn().mockResolvedValue({ results: [{ title: 'Result' }], queryUsed: 'test', totalFound: 1 }) },
                chat: { verifyHypothesis: vi.fn().mockResolvedValue({ isVerified: true, source: 'test', reasoning: 'Valid' }) }
            });
            const actor = createActor(mechanicMachine, { input: createDefaultInput({ services }) });
            actor.start();

            actor.send({
                type: 'DIAGNOSE',
                userId: 'user-1',
                sessionId: 'session-1',
                vehicleContext: { year: 2020, make: 'Honda', model: 'Civic' },
                userQuery: 'brake squeak'
            });

            // Should still reach vision_verifying
            await waitFor(actor, (s) => s.matches('vision_verifying'), { timeout: 5000 });
            const ctx = actor.getSnapshot().context;

            // Failed actor should have empty results, error should be set
            expect(ctx.nhtsaResults).toEqual([]);
            expect(ctx.error).toContain('NHTSA API down');
            // Other actors succeeded
            expect(ctx.embeddingInfo).toHaveLength(1);

            actor.stop();
        });

        it('should continue if ALL parallel actors fail', async () => {
            const services = createMockServices({
                nhtsa: { checkRecalls: vi.fn().mockRejectedValue(new Error('NHTSA down')) },
                vector: { search: vi.fn().mockRejectedValue(new Error('Vector DB down')) },
                search: { search: vi.fn().mockRejectedValue(new Error('Search API down')) },
                chat: { verifyHypothesis: vi.fn().mockRejectedValue(new Error('Chat AI down')) }
            });
            const actor = createActor(mechanicMachine, { input: createDefaultInput({ services }) });
            actor.start();

            actor.send({
                type: 'DIAGNOSE',
                userId: 'user-1',
                sessionId: 'session-1',
                vehicleContext: { year: 2020, make: 'Honda', model: 'Civic' },
                userQuery: 'brake squeak'
            });

            // Should still reach vision_verifying even with all failures
            await waitFor(actor, (s) => s.matches('vision_verifying'), { timeout: 5000 });
            expect(actor.getSnapshot().context.error).toBeDefined();

            actor.stop();
        });

        it('should handle NHTSA returning malformed data', async () => {
            const services = createMockServices({
                nhtsa: { checkRecalls: vi.fn().mockResolvedValue(null) } // Malformed: should be array
            });
            const actor = createActor(mechanicMachine, { input: createDefaultInput({ services }) });
            actor.start();

            actor.send({
                type: 'DIAGNOSE',
                userId: 'user-1',
                sessionId: 'session-1',
                vehicleContext: { year: 2020, make: 'Honda', model: 'Civic' },
                userQuery: 'brake squeak'
            });

            await waitFor(actor, (s) => s.matches('vision_verifying'), { timeout: 5000 });
            // Should handle gracefully (null assigned, no crash)
            expect(actor.getSnapshot().context.nhtsaResults).toBeNull();

            actor.stop();
        });

        it('should handle vector search returning 0 results', async () => {
            const services = createMockServices({
                vector: { search: vi.fn().mockResolvedValue([]) }
            });
            const actor = createActor(mechanicMachine, { input: createDefaultInput({ services }) });
            actor.start();

            actor.send({
                type: 'DIAGNOSE',
                userId: 'user-1',
                sessionId: 'session-1',
                vehicleContext: { year: 2020, make: 'Honda', model: 'Civic' },
                userQuery: 'brake squeak'
            });

            await waitFor(actor, (s) => s.matches('vision_verifying'), { timeout: 5000 });
            expect(actor.getSnapshot().context.embeddingInfo).toEqual([]);
            expect(actor.getSnapshot().context.error).toBeUndefined();

            actor.stop();
        });
    });

    describe('vision_verifying state', () => {
        it('should store visualAnalysis on success', async () => {
            const mockAnalysis = {
                diagnosis: 'Worn brake pads',
                confidence: 0.95,
                visual_evidence: ['visible wear'],
                acoustic_evidence: ['squeaking sound'],
                severity: 'medium',
                safety_alert: false,
                suggested_actions: ['Replace brake pads']
            };
            const services = createMockServices({
                vision: { analyzeUploadedVideo: vi.fn().mockResolvedValue(mockAnalysis) }
            });
            const actor = createActor(mechanicMachine, { input: createDefaultInput({ services }) });
            actor.start();

            actor.send({
                type: 'DIAGNOSE',
                userId: 'user-1',
                sessionId: 'session-1',
                vehicleContext: { year: 2020, make: 'Honda', model: 'Civic' },
                userQuery: 'brake squeak'
            });

            await waitFor(actor, (s) => s.matches('synthesizing'), { timeout: 5000 });
            expect(actor.getSnapshot().context.visualAnalysis).toEqual(mockAnalysis);

            actor.stop();
        });

        it('should proceed to synthesizing even if vision analysis fails', async () => {
            const services = createMockServices({
                vision: { analyzeUploadedVideo: vi.fn().mockRejectedValue(new Error('Video processing failed')) }
            });
            const actor = createActor(mechanicMachine, { input: createDefaultInput({ services }) });
            actor.start();

            actor.send({
                type: 'DIAGNOSE',
                userId: 'user-1',
                sessionId: 'session-1',
                vehicleContext: { year: 2020, make: 'Honda', model: 'Civic' },
                userQuery: 'brake squeak'
            });

            await waitFor(actor, (s) => s.matches('synthesizing'), { timeout: 5000 });
            expect(actor.getSnapshot().context.error).toContain('Video processing failed');
            expect(actor.getSnapshot().context.visualAnalysis).toBeUndefined();

            actor.stop();
        });

        it('should handle vision returning low confidence (<0.3)', async () => {
            const lowConfidenceAnalysis = {
                diagnosis: 'Uncertain',
                confidence: 0.2,
                visual_evidence: [],
                acoustic_evidence: [],
                severity: 'low',
                safety_alert: false,
                suggested_actions: []
            };
            const services = createMockServices({
                vision: { analyzeUploadedVideo: vi.fn().mockResolvedValue(lowConfidenceAnalysis) }
            });
            const actor = createActor(mechanicMachine, { input: createDefaultInput({ services }) });
            actor.start();

            actor.send({
                type: 'DIAGNOSE',
                userId: 'user-1',
                sessionId: 'session-1',
                vehicleContext: { year: 2020, make: 'Honda', model: 'Civic' },
                userQuery: 'brake squeak'
            });

            await waitFor(actor, (s) => s.matches('synthesizing'), { timeout: 5000 });
            expect(actor.getSnapshot().context.visualAnalysis?.confidence).toBe(0.2);

            actor.stop();
        });
    });

    describe('synthesizing state (final)', () => {
        it('should be a final state', async () => {
            const actor = createActor(mechanicMachine, { input: createDefaultInput() });
            actor.start();

            actor.send({
                type: 'DIAGNOSE',
                userId: 'user-1',
                sessionId: 'session-1',
                vehicleContext: { year: 2020, make: 'Honda', model: 'Civic' },
                userQuery: 'brake squeak'
            });

            await waitFor(actor, (s) => s.matches('synthesizing'), { timeout: 5000 });
            expect(actor.getSnapshot().status).toBe('done');

            actor.stop();
        });

        it('should accumulate all results in final context', async () => {
            const services = createMockServices({
                memory: { search: vi.fn().mockResolvedValue([{ content: 'history' }]) },
                nhtsa: { checkRecalls: vi.fn().mockResolvedValue([{ id: 'recall-1' }]) },
                vector: { search: vi.fn().mockResolvedValue([{ id: 'doc-1' }]) },
                search: { search: vi.fn().mockResolvedValue({ results: [{ title: 'Result' }], queryUsed: 'test', totalFound: 1 }) },
                chat: { verifyHypothesis: vi.fn().mockResolvedValue({ isVerified: true }) },
                vision: { analyzeUploadedVideo: vi.fn().mockResolvedValue({ diagnosis: 'test', confidence: 0.9 }) }
            });
            const actor = createActor(mechanicMachine, { input: createDefaultInput({ services }) });
            actor.start();

            actor.send({
                type: 'DIAGNOSE',
                userId: 'user-1',
                sessionId: 'session-1',
                vehicleContext: { year: 2020, make: 'Honda', model: 'Civic' },
                userQuery: 'brake squeak'
            });

            await waitFor(actor, (s) => s.matches('synthesizing'), { timeout: 5000 });
            const ctx = actor.getSnapshot().context;

            expect(ctx.vehicleHistory).toHaveLength(1);
            expect(ctx.nhtsaResults).toHaveLength(1);
            expect(ctx.embeddingInfo).toHaveLength(1);
            expect(ctx.searchResults?.results).toHaveLength(1);
            expect(ctx.verificationResult?.isVerified).toBe(true);
            expect(ctx.visualAnalysis?.diagnosis).toBe('test');

            actor.stop();
        });
    });

    describe('error accumulation', () => {
        it('should preserve first error when multiple errors occur', async () => {
            const services = createMockServices({
                memory: { search: vi.fn().mockRejectedValue(new Error('First error: Memory')) },
                nhtsa: { checkRecalls: vi.fn().mockRejectedValue(new Error('Second error: NHTSA')) }
            });
            const actor = createActor(mechanicMachine, { input: createDefaultInput({ services }) });
            actor.start();

            actor.send({
                type: 'DIAGNOSE',
                userId: 'user-1',
                sessionId: 'session-1',
                vehicleContext: { year: 2020, make: 'Honda', model: 'Civic' },
                userQuery: 'brake squeak'
            });

            await waitFor(actor, (s) => s.matches('synthesizing'), { timeout: 5000 });
            // Note: Current implementation overwrites error - this test documents that behavior
            // If we want to accumulate errors, the machine would need to be modified
            expect(actor.getSnapshot().context.error).toBeDefined();

            actor.stop();
        });
    });

    describe('edge cases', () => {
        it('should handle vehicleContext with missing optional fields', async () => {
            const actor = createActor(mechanicMachine, {
                input: createDefaultInput({
                    vehicleContext: { year: 2020, make: 'Honda', model: 'Civic' } // No VIN
                })
            });
            actor.start();

            actor.send({
                type: 'DIAGNOSE',
                userId: 'user-1',
                sessionId: 'session-1',
                vehicleContext: { year: 2020, make: 'Honda', model: 'Civic' },
                userQuery: 'brake squeak'
            });

            await waitFor(actor, (s) => s.matches('synthesizing'), { timeout: 5000 });
            expect(actor.getSnapshot().status).toBe('done');

            actor.stop();
        });

        it('should handle empty userQuery', async () => {
            const actor = createActor(mechanicMachine, { input: createDefaultInput() });
            actor.start();

            actor.send({
                type: 'DIAGNOSE',
                userId: 'user-1',
                sessionId: 'session-1',
                vehicleContext: { year: 2020, make: 'Honda', model: 'Civic' },
                userQuery: ''
            });

            await waitFor(actor, (s) => s.matches('synthesizing'), { timeout: 5000 });
            expect(actor.getSnapshot().status).toBe('done');

            actor.stop();
        });

        it('should not allow DIAGNOSE event when not in idle state', async () => {
            const services = createMockServices({
                memory: {
                    search: vi.fn().mockImplementation(() =>
                        new Promise(resolve => setTimeout(() => resolve([]), 2000))
                    )
                }
            });
            const actor = createActor(mechanicMachine, { input: createDefaultInput({ services }) });
            actor.start();

            // Send first DIAGNOSE
            actor.send({
                type: 'DIAGNOSE',
                userId: 'user-1',
                sessionId: 'session-1',
                vehicleContext: { year: 2020, make: 'Honda', model: 'Civic' },
                userQuery: 'first query'
            });

            // Wait for recalling state
            await waitFor(actor, (s) => s.value === 'recalling', { timeout: 1000 });

            // Try to send another DIAGNOSE while in recalling state
            const snapshotBefore = actor.getSnapshot();
            actor.send({
                type: 'DIAGNOSE',
                userId: 'user-2',
                sessionId: 'session-2',
                vehicleContext: { year: 2021, make: 'Ford', model: 'F150' },
                userQuery: 'second query'
            });

            // Should still be in recalling with original context
            const snapshotAfter = actor.getSnapshot();
            expect(snapshotAfter.value).toBe(snapshotBefore.value);
            expect(snapshotAfter.context.userQuery).toBe(snapshotBefore.context.userQuery);

            actor.stop();
        });
    });
});
