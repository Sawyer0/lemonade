/// <reference types="vitest/globals" />
import 'reflect-metadata';
import { Container } from 'inversify';
import { TYPES } from '@/infrastructure/di/types';
import { MechanicReasoningService } from '@/application/services/MechanicReasoningService';
import { IMechanicReasoningService } from '@/core/interfaces/IMechanicReasoningService';
import { createMockLogger, createMockNHTSA, createMockEmbedding, createMockVectorRepo, createMockVideoAI } from '../test-helpers';

describe('MechanicReasoningService - Learning Layer (Collective Memory)', () => {
    let service: IMechanicReasoningService;
    let mockVectorRepo: any;
    let mockVideoAI: any;
    let mockNHTSA: any;

    beforeEach(() => {
        const container = new Container();
        mockVectorRepo = createMockVectorRepo();
        mockVideoAI = createMockVideoAI();
        mockNHTSA = createMockNHTSA();

        container.bind(TYPES.Logger).toConstantValue(createMockLogger());
        container.bind(TYPES.NHTSAService).toConstantValue(mockNHTSA);
        container.bind(TYPES.EmbeddingService).toConstantValue(createMockEmbedding());
        container.bind(TYPES.VectorRepository).toConstantValue(mockVectorRepo);
        container.bind(TYPES.VideoAI).toConstantValue(mockVideoAI);
        container.bind(TYPES.MechanicReasoningService).to(MechanicReasoningService);

        service = container.get(TYPES.MechanicReasoningService);
        vi.clearAllMocks();
    });

    it('should SAVE confident diagnoses to Collective Memory', async () => {
        // Arrange: Safe, No Recalls
        mockNHTSA.checkRecalls.mockResolvedValue([]);
        // Arrange: Highly Confident Diagnosis
        mockVideoAI.analyzeMechanicalVideo.mockResolvedValue({
            diagnosis: "Perfectly Identified Alternator",
            confidence: 0.95 // High confidence
        });

        // Act
        await service.diagnose({
            sessionId: 's', userId: 'u', userQuery: 'charging issue',
            vehicleContext: { year: 2010, make: 'Toyota', model: 'Camry', vin: 'VIN123' },
            videoUrl: 'http://video'
        });

        // Assert: Vector Repo should have received an 'addCase' call
        // This verifies the "Learning" loop is active
        expect(mockVectorRepo.addCase).toHaveBeenCalledWith(
            expect.stringContaining('charging issue'), // Text
            expect.any(Array), // Vector
            expect.objectContaining({ // Metadata
                vehicle: 'VIN123',
                diagnosis: "Perfectly Identified Alternator"
            })
        );
    });

    it('should NOT SAVE if Recall was found (Dangerous to learn from blocked cases)', async () => {
        // Arrange: Recall Found
        mockNHTSA.checkRecalls.mockResolvedValue([{ Summary: "Bad Airbag" }]);
        // Arrange: AI was confident (but wrong because of recall)
        mockVideoAI.analyzeMechanicalVideo.mockResolvedValue({
            diagnosis: "Adjust Seat",
            confidence: 0.9
        });

        // Act
        await service.diagnose({
            sessionId: 's', userId: 'u', userQuery: 'airbag warning',
            vehicleContext: { year: 2010, make: 'Toyota', model: 'Camry' }
        });

        // Assert: Do NOT pollute memory with recall cases
        expect(mockVectorRepo.addCase).not.toHaveBeenCalled();
    });
});
