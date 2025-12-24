import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChatService } from '../ChatService';
import { TestFactory } from '../../../../packages/core/src/__tests__/helpers/TestFactory';
import { AppError, ErrorCode } from '@lemonade/core';

// Mock dependencies
const mockChatAI = {
    generateReply: vi.fn(),
    countTokens: vi.fn().mockResolvedValue(10)
};
const mockSessionRepo = {
    getHistory: vi.fn(),
    addMessage: vi.fn(),
    findById: vi.fn()
};
const mockVehicleRepo = {
    findById: vi.fn()
};
const mockComplaintIdService = {
    identifyAndSetComplaint: vi.fn().mockResolvedValue(undefined)
};
const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
};
const mockSummarizationService = {
    summarize: vi.fn()
};
const mockReactiveSafety = {
    checkSafety: vi.fn()
};
const mockSafetyMonitor = {
    assess: vi.fn()
};

describe('ChatService Integration (Text-Based)', () => {
    let service: ChatService;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new ChatService(
            mockChatAI as any,
            mockSessionRepo as any,
            mockVehicleRepo as any,
            mockComplaintIdService as any,
            mockLogger as any,
            mockSummarizationService as any,
            mockReactiveSafety as any,
            mockSafetyMonitor as any
        );
    });

    it('should handle a safe chat interaction (End-to-End)', async () => {
        // 1. Setup Data
        const user = TestFactory.createUser();
        const vehicle = TestFactory.createVehicle(user.id);
        const session = TestFactory.createSession(user.id, vehicle.id);

        // 2. Setup Mocks
        mockSessionRepo.getHistory.mockResolvedValue(session);
        mockVehicleRepo.findById.mockResolvedValue(vehicle);
        
        // Safety Checks Pass
        mockReactiveSafety.checkSafety.mockReturnValue({ intervention_required: false });
        mockSafetyMonitor.assess.mockResolvedValue({ intervention_required: false });

        // AI Response
        const aiResponse = "It sounds like a worn brake pad. Please inspect the rotor.";
        mockChatAI.generateReply.mockResolvedValue(aiResponse);

        // 3. Execution
        const response = await service.handleChatInteraction(session.id, "I hear a grinding noise when braking");

        // 4. Verification
        expect(response).toBe(aiResponse);
        
        // Verify Safety Checks were called
        expect(mockReactiveSafety.checkSafety).toHaveBeenCalled();
        expect(mockSafetyMonitor.assess).toHaveBeenCalled();

        // Verify Context Loading
        expect(mockSessionRepo.getHistory).toHaveBeenCalledWith(session.id);
        expect(mockVehicleRepo.findById).toHaveBeenCalledWith(vehicle.id);

        // Verify Persistence
        expect(mockSessionRepo.addMessage).toHaveBeenCalledTimes(2);
        expect(mockSessionRepo.addMessage).toHaveBeenCalledWith(session.id, 'user', expect.any(String));
        expect(mockSessionRepo.addMessage).toHaveBeenCalledWith(session.id, 'assistant', aiResponse);
    });

    it('should block unsafe interaction (Reactive Safety)', async () => {
        const user = TestFactory.createUser();
        const vehicle = TestFactory.createVehicle(user.id);
        const session = TestFactory.createSession(user.id, vehicle.id);

        mockSessionRepo.getHistory.mockResolvedValue(session);
        mockVehicleRepo.findById.mockResolvedValue(vehicle);

        // Reactive Safety Trigger
        mockReactiveSafety.checkSafety.mockReturnValue({ 
            intervention_required: true, 
            suggested_output: "STOP! Do not touch that wire.",
            hazards_detected: ["High Voltage"]
        });

        const response = await service.handleChatInteraction(session.id, "I'm cutting the orange wire");

        expect(response).toContain("STOP");
        expect(mockChatAI.generateReply).not.toHaveBeenCalled(); // AI shouldn't be called
        expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('System 0 Safety'), expect.any(Object));
    });
});
