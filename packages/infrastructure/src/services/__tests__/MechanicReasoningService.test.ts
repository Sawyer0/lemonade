import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MechanicReasoningService } from '../MechanicReasoningService';
import { CaseRunCoordinator } from '../CaseRunCoordinator';
import { AppError, ErrorCode } from '@lemonade/core';
import {
    ILogger,
    IMultimodalUploadAnalyzer,
    IChatAssistantAI,
    INHTSAService,
    IEmbeddingService,
    IVectorRepository,
    IGoogleSearchService,
    IMemoryService,
    IReactiveSafetyService,
    ISessionRepository,
    ISafetyMonitor,
    ITracingService,
    ICaseRepository,
    ReasoningInput,
} from '@lemonade/core';
import type { GeminiCoreAdapter } from '../../ai/GeminiCoreAdapter';

describe('MechanicReasoningService', () => {
    let service: MechanicReasoningService;
    let mockVideoAI: IMultimodalUploadAnalyzer;
    let mockChatAI: IChatAssistantAI;
    let mockNHTSA: INHTSAService;
    let mockEmbedding: IEmbeddingService;
    let mockVector: IVectorRepository;
    let mockSearch: IGoogleSearchService;
    let mockMemory: IMemoryService;
    let mockReactive: IReactiveSafetyService;
    let mockSessionRepo: ISessionRepository;
    let mockSafetyMonitor: ISafetyMonitor;
    let mockTracing: ITracingService;
    let mockLogger: ILogger;

    beforeEach(() => {
        mockVideoAI = {
            analyzeUploadedVideo: vi.fn().mockResolvedValue({
                diagnosis: 'Test Diagnosis',
                confidence: 0.9,
                visual_evidence: [],
                acoustic_evidence: [],
                severity: 'low',
                safety_alert: false,
                suggested_actions: [],
                engineDescription: 'Stock',
                isStock: true,
                visualConflictDetected: false,
                detectedCondition: 'clean',
            }),
        } as unknown as IMultimodalUploadAnalyzer;

        mockChatAI = {
            verifyHypothesis: vi.fn().mockResolvedValue({ isVerified: false, source: null, reasoning: '' }),
        } as unknown as IChatAssistantAI;

        mockNHTSA = {
            checkRecalls: vi.fn().mockResolvedValue([]),
        } as unknown as INHTSAService;

        mockEmbedding = { embed: vi.fn().mockResolvedValue(new Array(768).fill(0)) } as unknown as IEmbeddingService;

        mockVector = {
            search: vi.fn().mockResolvedValue([]),
            addCase: vi.fn().mockResolvedValue(undefined),
        } as unknown as IVectorRepository;

        mockSearch = {
            search: vi.fn().mockResolvedValue({ results: [], queryUsed: '', totalFound: 0 }),
        } as unknown as IGoogleSearchService;

        mockMemory = {
            search: vi.fn().mockResolvedValue([]),
            addDocument: vi.fn().mockResolvedValue(undefined),
        } as unknown as IMemoryService;

        mockReactive = { checkSafety: vi.fn().mockReturnValue(null) } as unknown as IReactiveSafetyService;

        mockSessionRepo = {
            saveXStateSnapshot: vi.fn().mockResolvedValue(undefined),
            clearXStateSnapshot: vi.fn().mockResolvedValue(undefined),
        } as unknown as ISessionRepository;

        mockSafetyMonitor = {
            assess: vi.fn().mockResolvedValue({ intervention_required: false, hazards_detected: [] }),
        } as unknown as ISafetyMonitor;

        mockTracing = { traceAiCall: vi.fn(({ exec }) => exec()) } as unknown as ITracingService;

        mockLogger = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as ILogger;

        service = new MechanicReasoningService(
            mockVideoAI,
            mockChatAI,
            mockNHTSA,
            mockEmbedding,
            mockVector,
            mockSearch,
            mockMemory,
            mockSessionRepo,
            mockReactive,
            mockSafetyMonitor,
            mockTracing,
            mockLogger,
        );
    });

    it('should coordinate multi-step research queries', async () => {
        const input: ReasoningInput = {
            sessionId: 'session-1',
            userId: 'user-1',
            vehicleContext: { year: 2022, make: 'Ford', model: 'F-150', vin: 'VIN123' },
            userQuery: 'brake squeak when cold',
            complaint: 'Brakes squeaking',
            videoUrl: 'http://example.com/video.mp4',
        };

        mockSearch.search = vi.fn().mockResolvedValue({
            results: [
                { title: 'F-150 Brake TSB 22-123', link: 'http://ford.com/tsb123', snippet: 'TSB for brake squeak' },
            ],
            queryUsed: 'brake squeak when cold 2022 Ford F-150',
            totalFound: 1,
        });

        mockChatAI.verifyHypothesis = vi.fn().mockResolvedValue({
            isVerified: true,
            source: 'http://ford.com/tsb123',
            reasoning: 'Matches TSB 22-123 for cold brake squeak.',
        });

        const result = await service.diagnose(input);

        expect(mockSearch.search).toHaveBeenCalled();
        expect(mockChatAI.verifyHypothesis).toHaveBeenCalled();
        expect(result.verification.isVerified).toBe(true);
    });

    it('should handle conflict between intuition and ground truth', async () => {
        const input: ReasoningInput = {
            sessionId: 'session-conflict',
            userId: 'user-1',
            vehicleContext: { year: 2018, make: 'Tesla', model: 'Model 3', vin: 'VIN_TESLA' },
            userQuery: 'what oil does this take?',
            complaint: 'Oil type query',
            videoUrl: 'http://example.com/video.mp4',
        };

        mockVideoAI.analyzeUploadedVideo = vi.fn().mockResolvedValue({
            diagnosis: 'Requires 5W-30 Oil',
            confidence: 0.9,
            visual_evidence: [],
            acoustic_evidence: [],
            severity: 'low',
            safety_alert: false,
            suggested_actions: [],
            engineDescription: 'Tesla Electric Motor',
            isStock: true,
            visualConflictDetected: false,
            detectedCondition: 'clean',
        });

        mockChatAI.verifyHypothesis = vi.fn().mockResolvedValue({
            isVerified: false,
            source: 'Tesla Manual',
            reasoning: 'Tesla Model 3 is an electric vehicle and does not use engine oil.',
        });

        const result = await service.diagnose(input);

        expect(result.finalDiagnosis.decision).not.toBe('PROCEED');
        expect(result.finalDiagnosis.userOutput).toContain('CONFLICT');
    });

    it('should calculate high meta-confidence when all layers align', async () => {
        const input: ReasoningInput = {
            sessionId: 'session-high-conf',
            userId: 'user-1',
            vehicleContext: { year: 2020, make: 'Toyota', model: 'Camry', vin: 'VIN_CAMRY' },
            userQuery: 'squealing noise when starting',
            complaint: 'Squealing noise',
            videoUrl: 'http://example.com/video.mp4',
        };

        mockVideoAI.analyzeUploadedVideo = vi.fn().mockResolvedValue({
            diagnosis: 'Loose Fan Belt',
            confidence: 0.9,
            visual_evidence: [],
            acoustic_evidence: [],
            severity: 'low',
            safety_alert: false,
            suggested_actions: [],
            engineDescription: 'Stock',
            isStock: true,
            visualConflictDetected: false,
            detectedCondition: 'clean',
        });

        mockSearch.search = vi.fn().mockResolvedValue({
            results: [{ title: 'Camry Belt Squeak', link: 'http://toyota.com', snippet: 'Common belt issue' }],
            queryUsed: 'squealing noise when starting 2020 Toyota Camry',
            totalFound: 1,
        });

        mockChatAI.verifyHypothesis = vi.fn().mockResolvedValue({
            isVerified: true,
            source: 'Toyota Tech',
            reasoning: 'Belt squeal is a known issue for this model.',
        });

        const result = await service.diagnose(input);

        expect(result.finalDiagnosis.metaConfidence).toBeGreaterThan(0.7);
        expect(result.finalDiagnosis.decision).toBe('PROCEED');
    });

    it('should recall vehicle history from Supermemory before diagnosing', async () => {
        const input: ReasoningInput = {
            sessionId: 'session-recall',
            userId: 'user-1',
            vehicleContext: { year: 2015, make: 'Honda', model: 'Civic', vin: 'VIN_HONDA' },
            userQuery: 'battery light is on',
            complaint: 'Battery light',
            videoUrl: 'http://example.com/video.mp4',
        };

        const mockHistory = [
            { content: '[DIAGNOSTIC LOG] Alternator was replaced 2 months ago.', metadata: { date: '2025-10-21' } },
        ];
        mockMemory.search = vi.fn().mockResolvedValue(mockHistory);

        await service.diagnose(input);

        expect(mockMemory.search).toHaveBeenCalledWith(
            expect.stringContaining('VIN_HONDA'),
            expect.objectContaining({
                tags: expect.arrayContaining(['user:user-1', 'vin:VIN_HONDA']),
            }),
        );

        expect(mockVideoAI.analyzeUploadedVideo).toHaveBeenCalledWith(
            expect.any(String),
            expect.stringContaining('Alternator was replaced 2 months ago'),
            expect.any(String),
            expect.any(String),
            expect.any(String),
            expect.any(String),
            undefined,
        );
    });

    describe('Error Propagation', () => {
        const baseInput: ReasoningInput = {
            sessionId: 'session-error',
            userId: 'user-1',
            vehicleContext: { year: 2020, make: 'Honda', model: 'Civic', vin: 'VIN_ERROR' },
            userQuery: 'check engine light',
            complaint: 'Check engine light',
            videoUrl: 'http://example.com/video.mp4',
        };

        it('should stop immediately when reactive safety detects hazard', async () => {
            mockReactive.checkSafety = vi.fn().mockReturnValue({
                intervention_required: true,
                hazards_detected: ['FUEL_LEAK'],
                suggested_output: 'DANGER: Fuel leak detected. Stop immediately.',
            });

            const result = await service.diagnose(baseInput);

            expect(result.finalDiagnosis.decision).toBe('STOP_DANGER');
            expect(result.finalDiagnosis.userOutput).toContain('DANGER');
            // Should NOT call any other services
            expect(mockNHTSA.checkRecalls).not.toHaveBeenCalled();
            expect(mockVideoAI.analyzeUploadedVideo).not.toHaveBeenCalled();
        });

        it('should stop when semantic safety detects hazard (after reactive passes)', async () => {
            mockReactive.checkSafety = vi.fn().mockReturnValue(null); // Passes reactive
            mockSafetyMonitor.assess = vi.fn().mockResolvedValue({
                intervention_required: true,
                hazards_detected: ['HIGH_VOLTAGE_SYSTEM'],
                suggested_output: 'WARNING: High voltage system detected.',
            });

            const result = await service.diagnose(baseInput);

            expect(result.finalDiagnosis.decision).toBe('STOP_DANGER');
            // Uses the suggested_output from SafetyMonitor
            expect(result.finalDiagnosis.userOutput).toContain('WARNING');
            expect(result.finalDiagnosis.reasoningTrace).toContain('SEMANTIC_LAYER');
            // Should NOT call downstream services
            expect(mockVideoAI.analyzeUploadedVideo).not.toHaveBeenCalled();
        });

        it('should continue diagnosis even if NHTSA service fails', async () => {
            mockNHTSA.checkRecalls = vi.fn().mockRejectedValue(new Error('NHTSA API unavailable'));

            const result = await service.diagnose(baseInput);

            // Should still complete diagnosis
            expect(result).toBeDefined();
            expect(result.finalDiagnosis).toBeDefined();
            expect(mockLogger.warn).not.toHaveBeenCalledWith(expect.stringContaining('NHTSA'), expect.anything());
        });

        it('should continue diagnosis even if vector search fails', async () => {
            mockVector.search = vi.fn().mockRejectedValue(new Error('Vector DB connection lost'));

            const result = await service.diagnose(baseInput);

            // Should still complete diagnosis
            expect(result).toBeDefined();
            expect(result.consensus.similarCasesFound).toBe(0);
        });

        it('should continue diagnosis even if Google search fails', async () => {
            mockSearch.search = vi.fn().mockRejectedValue(new Error('Search quota exceeded'));

            const result = await service.diagnose(baseInput);

            expect(result).toBeDefined();
            expect(result.finalDiagnosis).toBeDefined();
        });

        it('should continue diagnosis even if Supermemory fails', async () => {
            mockMemory.search = vi.fn().mockRejectedValue(new Error('Memory service down'));

            const result = await service.diagnose(baseInput);

            expect(result).toBeDefined();
            expect(result.finalDiagnosis).toBeDefined();
        });

        it('should handle video analysis failure gracefully', async () => {
            mockVideoAI.analyzeUploadedVideo = vi.fn().mockRejectedValue(new Error('Video processing failed'));

            const result = await service.diagnose(baseInput);

            // Should still complete with degraded response
            expect(result).toBeDefined();
            expect(result.finalDiagnosis).toBeDefined();
        });

        it('should handle verification failure gracefully', async () => {
            mockChatAI.verifyHypothesis = vi.fn().mockRejectedValue(new Error('Verification service unavailable'));

            const result = await service.diagnose(baseInput);

            expect(result).toBeDefined();
            expect(result.verification.isVerified).toBe(false);
        });

        it('should handle ALL external services failing simultaneously', async () => {
            mockNHTSA.checkRecalls = vi.fn().mockRejectedValue(new Error('NHTSA down'));
            mockVector.search = vi.fn().mockRejectedValue(new Error('Vector down'));
            mockSearch.search = vi.fn().mockRejectedValue(new Error('Search down'));
            mockMemory.search = vi.fn().mockRejectedValue(new Error('Memory down'));
            mockChatAI.verifyHypothesis = vi.fn().mockRejectedValue(new Error('Chat down'));

            const result = await service.diagnose(baseInput);

            // Should still complete with degraded diagnosis
            expect(result).toBeDefined();
            expect(result.finalDiagnosis).toBeDefined();
            expect(result.authorityData.nhtsaRecalls).toEqual([]);
            expect(result.consensus.similarCasesFound).toBe(0);
        });
    });

    describe('Safety Gate Interactions', () => {
        const baseInput: ReasoningInput = {
            sessionId: 'session-safety',
            userId: 'user-1',
            vehicleContext: { year: 2020, make: 'Honda', model: 'Civic', vin: 'VIN_SAFETY' },
            userQuery: 'test query',
            complaint: 'Test complaint',
            videoUrl: 'http://example.com/video.mp4',
        };

        it('should prioritize reactive safety over semantic safety', async () => {
            // Both would trigger
            mockReactive.checkSafety = vi.fn().mockReturnValue({
                intervention_required: true,
                hazards_detected: ['REACTIVE_HAZARD'],
                suggested_output: 'Reactive stop',
            });
            mockSafetyMonitor.assess = vi.fn().mockResolvedValue({
                intervention_required: true,
                hazards_detected: ['SEMANTIC_HAZARD'],
                suggested_output: 'Semantic stop',
            });

            const result = await service.diagnose(baseInput);

            // Reactive should win (comes first)
            expect(result.finalDiagnosis.reasoningTrace).toContain('REACTIVE_LAYER');
            // Semantic should NOT be called since reactive already stopped
            expect(mockSafetyMonitor.assess).not.toHaveBeenCalled();
        });

        it('should pass through when both safety gates allow', async () => {
            mockReactive.checkSafety = vi.fn().mockReturnValue(null);
            mockSafetyMonitor.assess = vi.fn().mockResolvedValue({
                intervention_required: false,
                hazards_detected: [],
            });

            const result = await service.diagnose(baseInput);

            expect(result.finalDiagnosis.decision).not.toBe('STOP_DANGER');
            expect(mockVideoAI.analyzeUploadedVideo).toHaveBeenCalled();
        });
    });

    describe('Edge Cases', () => {
        it('should handle missing videoUrl', async () => {
            const input: ReasoningInput = {
                sessionId: 'session-no-video',
                userId: 'user-1',
                vehicleContext: { year: 2020, make: 'Honda', model: 'Civic', vin: 'VIN_NOVIDEO' },
                userQuery: 'engine noise',
                complaint: 'Engine noise',
                // No videoUrl
            };

            const result = await service.diagnose(input);

            expect(result).toBeDefined();
            expect(result.finalDiagnosis).toBeDefined();
        });

        it('should handle empty vehicle context', async () => {
            const input: ReasoningInput = {
                sessionId: 'session-empty-ctx',
                userId: 'user-1',
                vehicleContext: { year: 0, make: '', model: '' },
                userQuery: 'general question',
                complaint: 'Unknown',
                videoUrl: 'http://example.com/video.mp4',
            };

            const result = await service.diagnose(input);

            expect(result).toBeDefined();
        });

        it('should handle very long user query', async () => {
            const longQuery = 'a'.repeat(10000);
            const input: ReasoningInput = {
                sessionId: 'session-long-query',
                userId: 'user-1',
                vehicleContext: { year: 2020, make: 'Honda', model: 'Civic' },
                userQuery: longQuery,
                complaint: 'Test',
                videoUrl: 'http://example.com/video.mp4',
            };

            const result = await service.diagnose(input);

            expect(result).toBeDefined();
        });
    });

    describe('case runs (LM-17)', () => {
        const CASE_ID = '11111111-1111-4111-8111-111111111111';
        let mockCaseRepo: ICaseRepository;
        let caseCoordinator: CaseRunCoordinator;

        function caseInput(overrides: Partial<ReasoningInput> = {}): ReasoningInput {
            return {
                sessionId: 'session-case-1',
                userId: 'user-1',
                vehicleContext: { year: 2022, make: 'Ford', model: 'F-150', vin: 'VIN123' },
                userQuery: 'brake squeak when cold',
                complaint: 'Brakes squeaking',
                ...overrides,
            };
        }

        function caseService(coordinator: CaseRunCoordinator): MechanicReasoningService {
            return new MechanicReasoningService(
                mockVideoAI,
                mockChatAI,
                mockNHTSA,
                mockEmbedding,
                mockVector,
                mockSearch,
                mockMemory,
                mockSessionRepo,
                mockReactive,
                mockSafetyMonitor,
                mockTracing,
                mockLogger,
                undefined as unknown as GeminiCoreAdapter,
                coordinator,
                mockCaseRepo,
            );
        }

        async function waitForMockCall(mockFn: { mock: { calls: unknown[][] } }): Promise<void> {
            const deadline = Date.now() + 5000;
            while (mockFn.mock.calls.length === 0) {
                if (Date.now() > deadline) {
                    throw new Error('timed out waiting for the mocked call');
                }
                await new Promise((resolve) => setTimeout(resolve, 10));
            }
        }

        beforeEach(() => {
            mockCaseRepo = {
                findCaseById: vi.fn().mockResolvedValue({
                    id: CASE_ID,
                    vehicleId: 'vehicle-1',
                    userId: 'user-1',
                    status: 'open',
                    version: 3,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                }),
                advanceCaseVersion: vi.fn().mockResolvedValue(4),
            } as unknown as ICaseRepository;
            (mockSessionRepo as unknown as Record<string, unknown>).getXStateSnapshot = vi.fn().mockResolvedValue(null);
            caseCoordinator = new CaseRunCoordinator();
        });

        it('commits a case run with the version it read', async () => {
            const result = await caseService(caseCoordinator).diagnose(caseInput({ caseId: CASE_ID }));

            expect(result).toBeDefined();
            expect(mockCaseRepo.findCaseById).toHaveBeenCalledWith(CASE_ID);
            expect(mockCaseRepo.advanceCaseVersion).toHaveBeenCalledTimes(1);
            expect(mockCaseRepo.advanceCaseVersion).toHaveBeenCalledWith(CASE_ID, 3);
        });

        it('joins a second caller onto the active run instead of starting a competing one', async () => {
            let releaseGather!: () => void;
            const gatherGate = new Promise<[]>((resolve) => {
                releaseGather = () => resolve([]);
            });
            mockMemory.search = vi.fn().mockImplementation(() => gatherGate);

            const runningService = caseService(caseCoordinator);
            const first = runningService.diagnose(caseInput({ caseId: CASE_ID }));
            await waitForMockCall(mockMemory.search as unknown as { mock: { calls: unknown[][] } });

            const second = runningService.diagnose(
                caseInput({ sessionId: 'session-case-2', userQuery: 'and a grinding noise', caseId: CASE_ID }),
            );
            releaseGather();

            const [firstResult, secondResult] = await Promise.all([first, second]);
            expect(secondResult).toBe(firstResult);
            expect(mockMemory.search).toHaveBeenCalledTimes(1);
            expect(mockCaseRepo.advanceCaseVersion).toHaveBeenCalledTimes(1);
            expect(mockCaseRepo.advanceCaseVersion).toHaveBeenCalledWith(CASE_ID, 3);
        });

        it('keeps the diagnosis when a stale run commit is refused', async () => {
            mockCaseRepo.advanceCaseVersion = vi
                .fn()
                .mockRejectedValue(new AppError(ErrorCode.VERSION_CONFLICT, 'stale write'));

            const result = await caseService(caseCoordinator).diagnose(caseInput({ caseId: CASE_ID }));

            expect(result).toBeDefined();
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Stale case run commit refused'),
                expect.objectContaining({ caseId: CASE_ID, readVersion: 3 }),
            );
        });

        it('re-queues evidence that arrives after the last checkpoint so the next run sees it', async () => {
            let releaseVideo!: (value: unknown) => void;
            const videoGate = new Promise((resolve) => {
                releaseVideo = resolve;
            });
            const videoResult = {
                diagnosis: 'Loose Fan Belt',
                confidence: 0.9,
                visual_evidence: [],
                acoustic_evidence: [],
                severity: 'low',
                safety_alert: false,
                suggested_actions: [],
                engineDescription: 'Stock',
                isStock: true,
                visualConflictDetected: false,
                detectedCondition: 'clean',
            };
            mockVideoAI.analyzeUploadedVideo = vi.fn().mockImplementation(() => videoGate);

            const runningService = caseService(caseCoordinator);
            const first = runningService.diagnose(
                caseInput({ caseId: CASE_ID, videoUrl: 'http://example.com/video.mp4' }),
            );
            await waitForMockCall(mockVideoAI.analyzeUploadedVideo as unknown as { mock: { calls: unknown[][] } });

            // The vision call started, so its input was already built: this
            // evidence arrives after the run's last checkpoint.
            const lateSummary = 'the noise stops when the belt is off';
            caseCoordinator.submitEvidence(CASE_ID, caseCoordinator.evidenceFromQuery(lateSummary));
            // Let the 250 ms forward loop deliver it to the actor.
            await new Promise((resolve) => setTimeout(resolve, 400));

            releaseVideo(videoResult);
            const firstResult = await first;
            expect(firstResult).toBeDefined();

            // The late evidence reached no model call in this run...
            const firstVideoContext = (mockVideoAI.analyzeUploadedVideo as unknown as { mock: { calls: unknown[][] } })
                .mock.calls[0][1] as string;
            expect(firstVideoContext).not.toContain(lateSummary);
            // ...but it was re-queued with a log line instead of dropped.
            expect(caseCoordinator.pendingCount(CASE_ID)).toBe(1);
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('Re-queued evidence that arrived after the last checkpoint'),
                expect.objectContaining({ caseId: CASE_ID, count: 1 }),
            );

            // The next run drains the re-queued evidence and folds it into its vision call.
            mockVideoAI.analyzeUploadedVideo = vi.fn().mockResolvedValue(videoResult);
            await runningService.diagnose(caseInput({ caseId: CASE_ID, videoUrl: 'http://example.com/video.mp4' }));
            const secondVideoContext = (mockVideoAI.analyzeUploadedVideo as unknown as { mock: { calls: unknown[][] } })
                .mock.calls[0][1] as string;
            expect(secondVideoContext).toContain(lateSummary);
            expect(caseCoordinator.pendingCount(CASE_ID)).toBe(0);
        });

        it('resumes from the stored snapshot after the worker is killed mid-case', async () => {
            let releaseGather!: () => void;
            const gatherGate = new Promise<[]>((resolve) => {
                releaseGather = () => resolve([]);
            });
            mockMemory.search = vi.fn().mockImplementation(() => gatherGate);

            const firstService = caseService(new CaseRunCoordinator());
            const firstRun = firstService.diagnose(caseInput({ sessionId: 'session-crash', caseId: CASE_ID }));
            await waitForMockCall(mockMemory.search as unknown as { mock: { calls: unknown[][] } });

            // The crash: the session repository holds the snapshot saved
            // while the gather call was still in flight. The worker dies
            // with the first run abandoned, its gather never released.
            const savedCalls = (mockSessionRepo.saveXStateSnapshot as unknown as { mock: { calls: unknown[][] } }).mock
                .calls;
            expect(savedCalls.length).toBeGreaterThan(0);
            const storedSnapshot = JSON.parse(JSON.stringify(savedCalls[savedCalls.length - 1]?.[1]));
            expect(storedSnapshot.value).toBe('gathering_context');

            // A new worker starts: fresh coordinator, the stored snapshot.
            mockMemory.search = vi.fn().mockResolvedValue([]);
            (mockSessionRepo as unknown as Record<string, unknown>).getXStateSnapshot = vi
                .fn()
                .mockResolvedValue(storedSnapshot);
            const restartedService = caseService(new CaseRunCoordinator());
            const result = await restartedService.diagnose(caseInput({ sessionId: 'session-crash', caseId: CASE_ID }));
            expect(result).toBeDefined();

            // Let the abandoned first run finish so its timers do not linger.
            releaseGather();
            await expect(firstRun).resolves.toBeDefined();
        });
    });
});
