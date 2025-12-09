/// <reference types="vitest/globals" />
import 'reflect-metadata';
import { Container } from 'inversify';
import { TYPES } from '@/infrastructure/di/types';
import { MechanicReasoningService } from '@/application/services/MechanicReasoningService';
import { IMechanicReasoningService } from '@/core/interfaces/IMechanicReasoningService';
import { createMockLogger, createMockNHTSA, createMockEmbedding, createMockVectorRepo, createMockVideoAI } from '../test-helpers';

describe('MechanicReasoningService - Safety Layer (Node 3)', () => {
    let service: IMechanicReasoningService;
    let mockNHTSA: any;
    let mockVideoAI: any;

    beforeEach(() => {
        const container = new Container();
        mockNHTSA = createMockNHTSA();
        mockVideoAI = createMockVideoAI();

        container.bind(TYPES.Logger).toConstantValue(createMockLogger());
        container.bind(TYPES.NHTSAService).toConstantValue(mockNHTSA);
        container.bind(TYPES.EmbeddingService).toConstantValue(createMockEmbedding());
        container.bind(TYPES.VectorRepository).toConstantValue(createMockVectorRepo());
        container.bind(TYPES.VideoAI).toConstantValue(mockVideoAI);
        container.bind(TYPES.MechanicReasoningService).to(MechanicReasoningService);

        service = container.get(TYPES.MechanicReasoningService);
        vi.clearAllMocks();
    });

    it('should FORCE STOP_DANGER when an active recall is found', async () => {
        // Arrange: NHTSA returns a confirmed recall
        mockNHTSA.checkRecalls.mockResolvedValue([{
            Summary: "Engine Fire Risk",
            Component: "Engine",
            LearnMoreUrl: "http://nhtsa.gov/recall/123"
        }]);

        // Arrange: Video AI thinks everything is fine (Simulating Hallucination)
        mockVideoAI.analyzeMechanicalVideo.mockResolvedValue({
            diagnosis: "Replace Spark Plugs",
            confidence: 0.9,
            severity: "low",
            safety_alert: false,
            suggested_actions: ["Buy Spark Plugs"]
        });

        // Act
        const result = await service.diagnose({
            sessionId: 'test-session',
            userId: 'user-123',
            userQuery: 'engine check',
            vehicleContext: { year: 2022, make: 'Ford', model: 'F-150', vin: '123' },
            videoUrl: 'http://video'
        });

        // Assert: The Code Logic MUST override the AI Hallucination
        expect(result.finalDiagnosis.decision).toBe('STOP_DANGER');
        expect(result.finalDiagnosis.userOutput).toContain('CRITICAL SAFETY ALERT');
        expect(result.finalDiagnosis.reasoningTrace).toContain('Node 3 (Authority) found Active Recall');
    });

    it('should Allow PROCEED if no recalls exist', async () => {
        mockNHTSA.checkRecalls.mockResolvedValue([]);
        mockVideoAI.analyzeMechanicalVideo.mockResolvedValue({
            diagnosis: "Everything Good",
            confidence: 0.9
        });

        const result = await service.diagnose({
            sessionId: 'test', userId: 'user', userQuery: 'check',
            vehicleContext: { year: 2020, make: 'Ford', model: 'F-150' },
            videoUrl: 'http://video'
        });

        expect(result.finalDiagnosis.decision).not.toBe('STOP_DANGER');
    });
});
