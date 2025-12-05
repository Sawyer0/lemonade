import { describe, it, expect, beforeEach } from 'vitest';
import { DiagnosticService } from '../DiagnosticService';
import { MemorySessionRepository } from '@/infrastructure/repositories/__mocks__/MemorySessionRepository';
import { IVideoDiagnosticAI, IChatAssistantAI } from '@/core/interfaces/IAIService';
import { IVehicleRepository } from '@/core/interfaces/IVehicleRepository';
import { ILogger } from '@/core/interfaces/ILogger';

// Mock AI Adapters
const mockVideoAI: IVideoDiagnosticAI = {
    analyzeMechanicalVideo: async () => ({
        diagnosis: 'Test Diagnosis',
        visual_evidence: ['Smoke'],
        acoustic_evidence: ['Rattle'],
        severity: 'medium',
        suggested_actions: ['Check oil'],
        safety_alert: false
    })
};

const mockChatAI: IChatAssistantAI = {
    generateReply: async () => 'Test Reply',
    processAudioCommand: async () => 'Test Audio Reply'
};

// Mock Vehicle Repo
const mockVehicleRepo: IVehicleRepository = {
    findById: async (id) => ({
        id,
        vin: 'TESTVIN1234567890',
        userId: 'user1',
        specs: { year: 2020, make: 'Toyota', model: 'Camry', engine: 'V6' },
        createdAt: new Date(),
        activeIssuesCount: 0
    }),
    create: async () => { },
    findByUser: async () => []
};

// Mock Logger
const mockLogger: ILogger = {
    info: () => { },
    error: () => { },
    warn: () => { },
    debug: () => { }
};

describe('DiagnosticService Integration', () => {
    let service: DiagnosticService;
    let sessionRepo: MemorySessionRepository;

    beforeEach(() => {
        sessionRepo = new MemorySessionRepository();
        service = new DiagnosticService(
            mockVideoAI,
            mockChatAI,
            sessionRepo,
            mockVehicleRepo,
            mockLogger
        );
    });

    it('should start a session and persist it to repository', async () => {
        const sessionId = await service.startSession('vehicle1');

        const session = await sessionRepo.findById(sessionId);
        expect(session).toBeDefined();
        expect(session?.id).toBe(sessionId);
        expect(session?.status).toBe('active');
        expect(session?.vehicleId).toBe('vehicle1');
    });

    it('should process video upload and update analysis', async () => {
        const sessionId = await service.startSession('vehicle1');

        await service.processVideoUpload(sessionId, 'http://test.com/video.mp4');

        const session = await sessionRepo.findById(sessionId);
        expect(session?.videoUrl).toBe('http://test.com/video.mp4');
        expect(session?.aiAnalysis).toBeDefined();
        expect(session?.aiAnalysis?.diagnosis).toBe('Test Diagnosis');
        // Note: status might be 'waiting_user' or 'active' depending on implementation details of updateAnalysis
        // The mock repo sets it to 'waiting_user' in updateAnalysis
        expect(session?.status).toBe('waiting_user');
    });

    it('should handle chat interaction and persist messages', async () => {
        const sessionId = await service.startSession('vehicle1');

        // Seed initial analysis so chat has context
        await service.processVideoUpload(sessionId, 'http://test.com/video.mp4');

        const reply = await service.handleChatInteraction(sessionId, 'What is wrong?');

        expect(reply).toBe('Test Reply');

        const session = await sessionRepo.findById(sessionId);
        expect(session?.messages).toHaveLength(2); // User + Assistant
        expect(session?.messages[0].content).toBe('What is wrong?');
        expect(session?.messages[1].content).toBe('Test Reply');
    });
});
