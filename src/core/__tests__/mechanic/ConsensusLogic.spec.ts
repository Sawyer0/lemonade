/// <reference types="vitest/globals" />
import 'reflect-metadata';
import { Container } from 'inversify';
import { TYPES } from '@/infrastructure/di/types';
import { MechanicReasoningService } from '@/application/services/MechanicReasoningService';
import { IMechanicReasoningService } from '@/core/interfaces/IMechanicReasoningService';
import { createMockLogger, createMockNHTSA, createMockEmbedding, createMockVectorRepo, createMockVideoAI } from '../test-helpers';

describe('MechanicReasoningService - Consensus Layer (Node 2)', () => {
    let service: IMechanicReasoningService;
    let mockVectorRepo: any;
    let mockVideoAI: any;

    beforeEach(() => {
        const container = new Container();
        mockVectorRepo = createMockVectorRepo();
        mockVideoAI = createMockVideoAI();
        const mockNHTSA = createMockNHTSA();

        // Setup: No recalls (Safe)
        mockNHTSA.checkRecalls.mockResolvedValue([]);

        container.bind(TYPES.Logger).toConstantValue(createMockLogger());
        container.bind(TYPES.NHTSAService).toConstantValue(mockNHTSA);
        container.bind(TYPES.EmbeddingService).toConstantValue(createMockEmbedding());
        container.bind(TYPES.VectorRepository).toConstantValue(mockVectorRepo);
        container.bind(TYPES.VideoAI).toConstantValue(mockVideoAI);
        container.bind(TYPES.MechanicReasoningService).to(MechanicReasoningService);

        service = container.get(TYPES.MechanicReasoningService);
        vi.clearAllMocks();
    });

    it('should FLAG CONSENSUS when Collective Memory contradicts Intuition', async () => {
        // Arrange: "Collective Memory" strongly suggests a specific fix
        mockVectorRepo.findSimilar.mockResolvedValue([
            { text: "Replace Fuse 27", score: 0.95 },
            { text: "Replace Fuse 27", score: 0.94 },
            { text: "Replace Fuse 27", score: 0.92 }
        ]);

        // Arrange: Intuition (AI) guesses something generic
        mockVideoAI.analyzeMechanicalVideo.mockResolvedValue({
            diagnosis: "Check Battery",
            confidence: 0.7
        });

        // Act
        const result = await service.diagnose({
            sessionId: 's', userId: 'u', userQuery: 'no start',
            vehicleContext: { year: 2015, make: 'Ford', model: 'F-150' },
            videoUrl: 'http://video'
        });

        // Assert: The "System 2" Logic must intervene
        expect(result.finalDiagnosis.userOutput).toContain('Community Consensus Alert');
        expect(result.finalDiagnosis.userOutput).toContain('Replace Fuse 27');
        // It should specifically reference the consensus fix despite the AI saying "Check Battery"
    });

    it('should not flag consensus if only 1 similar case is found', async () => {
        mockVectorRepo.findSimilar.mockResolvedValue([
            { text: "One random fix", score: 0.8 }
        ]);

        mockVideoAI.analyzeMechanicalVideo.mockResolvedValue({ diagnosis: "Original Diagnosis" });

        const result = await service.diagnose({
            sessionId: 's', userId: 'u', userQuery: 'q',
            vehicleContext: { year: 2015, make: 'Ford', model: 'F-150' }
        });

        expect(result.finalDiagnosis.userOutput).not.toContain('Community Consensus Alert');
        expect(result.consensus.isKnownIssue).toBe(false);
    });
});
