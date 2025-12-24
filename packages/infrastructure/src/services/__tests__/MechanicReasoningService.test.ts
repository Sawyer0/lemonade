import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MechanicReasoningService } from '../MechanicReasoningService';
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
    ITracingService,
    ReasoningInput
} from '@lemonade/core';

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
    let mockSafetyMonitor: ISafetyMonitor;
    let mockTracing: ITracingService;
    let mockLogger: ILogger;

    beforeEach(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
                detectedCondition: 'clean'
            }) 
        } as any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockChatAI = { 
            verifyHypothesis: vi.fn().mockResolvedValue({ isVerified: false, source: null, reasoning: '' }) 
        } as any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockNHTSA = { 
            checkRecalls: vi.fn().mockResolvedValue([]) 
        } as any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockEmbedding = { embed: vi.fn().mockResolvedValue(new Array(768).fill(0)) } as any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockVector = { 
            search: vi.fn().mockResolvedValue([]), 
            addCase: vi.fn().mockResolvedValue(undefined) 
        } as any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockSearch = { 
            search: vi.fn().mockResolvedValue({ results: [], queryUsed: '', totalFound: 0 }) 
        } as any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockMemory = { 
            search: vi.fn().mockResolvedValue([]), 
            addDocument: vi.fn().mockResolvedValue(undefined) 
        } as any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockReactive = { checkSafety: vi.fn().mockReturnValue(null) } as any;
        
        mockSafetyMonitor = {
            assess: vi.fn().mockResolvedValue({ intervention_required: false, hazards_detected: [] })
        } as any;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockTracing = { traceAiCall: vi.fn(({ exec }) => exec()) } as any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockLogger = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() } as any;

        service = new MechanicReasoningService(
            mockVideoAI,
            mockChatAI,
            mockNHTSA,
            mockEmbedding,
            mockVector,
            mockSearch,
            mockMemory,
            mockReactive,
            mockSafetyMonitor,
            mockTracing,
            mockLogger
        );
    });

    it('should coordinate multi-step research queries', async () => {
        const input: ReasoningInput = {
            sessionId: 'session-1',
            userId: 'user-1',
            vehicleContext: { year: 2022, make: 'Ford', model: 'F-150', vin: 'VIN123' },
            userQuery: 'brake squeak when cold',
            complaint: 'Brakes squeaking',
            videoUrl: 'http://example.com/video.mp4'
        };

        mockSearch.search = vi.fn().mockResolvedValue({
            results: [{ title: 'F-150 Brake TSB 22-123', link: 'http://ford.com/tsb123', snippet: 'TSB for brake squeak' }],
            queryUsed: 'brake squeak when cold 2022 Ford F-150',
            totalFound: 1
        });

        mockChatAI.verifyHypothesis = vi.fn().mockResolvedValue({
            isVerified: true,
            source: 'http://ford.com/tsb123',
            reasoning: 'Matches TSB 22-123 for cold brake squeak.'
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
            videoUrl: 'http://example.com/video.mp4'
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
            detectedCondition: 'clean'
        });

        mockChatAI.verifyHypothesis = vi.fn().mockResolvedValue({
            isVerified: false,
            source: 'Tesla Manual',
            reasoning: 'Tesla Model 3 is an electric vehicle and does not use engine oil.'
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
            videoUrl: 'http://example.com/video.mp4'
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
            detectedCondition: 'clean'
        });

        mockSearch.search = vi.fn().mockResolvedValue({
            results: [{ title: 'Camry Belt Squeak', link: 'http://toyota.com', snippet: 'Common belt issue' }],
            queryUsed: 'squealing noise when starting 2020 Toyota Camry',
            totalFound: 1
        });

        mockChatAI.verifyHypothesis = vi.fn().mockResolvedValue({
            isVerified: true,
            source: 'Toyota Tech',
            reasoning: 'Belt squeal is a known issue for this model.'
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
            videoUrl: 'http://example.com/video.mp4'
        };

        const mockHistory = [
            { content: '[DIAGNOSTIC LOG] Alternator was replaced 2 months ago.', metadata: { date: '2025-10-21' } }
        ];
        mockMemory.search = vi.fn().mockResolvedValue(mockHistory);

        await service.diagnose(input);

        expect(mockMemory.search).toHaveBeenCalledWith(expect.stringContaining('VIN_HONDA'));
        
        expect(mockVideoAI.analyzeUploadedVideo).toHaveBeenCalledWith(
            expect.any(String),
            expect.stringContaining('Alternator was replaced 2 months ago'),
            expect.any(String),
            expect.any(String),
            expect.any(String),
            expect.any(String),
            undefined
        );
    });
});
