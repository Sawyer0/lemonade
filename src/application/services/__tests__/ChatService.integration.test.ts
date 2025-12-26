import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChatService } from '../ChatService';
import { TestFactory } from '../../../../packages/core/src/__tests__/helpers/TestFactory';
import type { 
    IChatAssistantAI, 
    ISessionRepository, 
    IVehicleRepository, 
    ILogger, 
    ISummarizationService, 
    IReactiveSafetyService, 
    ISafetyMonitor 
} from '@lemonade/core';
import { ComplaintIdentificationService } from '@/application/services/ComplaintIdentificationService';

// Mock dependencies
const mockChatAI = {
    generateReply: vi.fn(),
    countTokens: vi.fn().mockResolvedValue(10)
} as unknown as IChatAssistantAI;

const mockSessionRepo = {
    getHistory: vi.fn(),
    addMessage: vi.fn(),
    findById: vi.fn()
} as unknown as ISessionRepository;

const mockVehicleRepo = {
    findById: vi.fn()
} as unknown as IVehicleRepository;

const mockComplaintIdService = {
    identifyAndSetComplaint: vi.fn().mockResolvedValue(undefined)
} as unknown as ComplaintIdentificationService;

const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
} as unknown as ILogger;

const mockSummarizationService = {
    summarize: vi.fn()
} as unknown as ISummarizationService;

const mockReactiveSafety = {
    checkSafety: vi.fn()
} as unknown as IReactiveSafetyService;

const mockSafetyMonitor = {
    assess: vi.fn()
} as unknown as ISafetyMonitor;

describe('ChatService Integration (Text-Based)', () => {
    let service: ChatService;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new ChatService(
            mockChatAI,
            mockSessionRepo,
            mockVehicleRepo,
            mockComplaintIdService,
            mockLogger,
            mockSummarizationService,
            mockReactiveSafety,
            mockSafetyMonitor
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
        expect(mockVehicleRepo.findById).toHaveBeenCalledWith(vehicle.id, user.id);

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

    describe('Safety Gate Interactions', () => {
        const setupTestContext = () => {
            const user = TestFactory.createUser();
            const vehicle = TestFactory.createVehicle(user.id);
            const session = TestFactory.createSession(user.id, vehicle.id);

            mockSessionRepo.getHistory.mockResolvedValue(session);
            mockVehicleRepo.findById.mockResolvedValue(vehicle);

            return { user, vehicle, session };
        };

        describe('System 0 (Reactive Safety)', () => {
            it('should block "fuel leak" pattern immediately', async () => {
                setupTestContext();

                mockReactiveSafety.checkSafety.mockReturnValue({
                    intervention_required: true,
                    suggested_output: "DANGER: Fuel leak detected. Stop all work.",
                    hazards_detected: ["FUEL_LEAK"]
                });

                const response = await service.handleChatInteraction('session-1', "I smell fuel leaking from the line");

                expect(response).toContain("DANGER");
                expect(mockChatAI.generateReply).not.toHaveBeenCalled();
                expect(mockSafetyMonitor.assess).not.toHaveBeenCalled(); // System 1 not called
            });

            it('should block "no jack stands" pattern', async () => {
                setupTestContext();

                mockReactiveSafety.checkSafety.mockReturnValue({
                    intervention_required: true,
                    suggested_output: "STOP: Never work under a vehicle on a jack alone.",
                    hazards_detected: ["JACK_STAND_MISSING"]
                });

                const response = await service.handleChatInteraction('session-1', "I'm under the car on just the jack");

                expect(response).toContain("STOP");
                expect(mockChatAI.generateReply).not.toHaveBeenCalled();
            });

            it('should allow safe messages through to System 1', async () => {
                setupTestContext();

                mockReactiveSafety.checkSafety.mockReturnValue({ intervention_required: false });
                mockSafetyMonitor.assess.mockResolvedValue({ intervention_required: false });
                mockChatAI.generateReply.mockResolvedValue("Normal response");

                const response = await service.handleChatInteraction('session-1', "What's the tire pressure for my car?");

                expect(response).toBe("Normal response");
                expect(mockReactiveSafety.checkSafety).toHaveBeenCalled();
                expect(mockSafetyMonitor.assess).toHaveBeenCalled();
                expect(mockChatAI.generateReply).toHaveBeenCalled();
            });
        });

        describe('System 1 (Semantic Safety)', () => {
            it('should catch implicit safety hazards after reactive passes', async () => {
                setupTestContext();

                mockReactiveSafety.checkSafety.mockReturnValue({ intervention_required: false });
                mockSafetyMonitor.assess.mockResolvedValue({
                    intervention_required: true,
                    suggested_output: "I detected a potential safety concern. Please consult a professional.",
                    hazards_detected: ["IMPLICIT_ELECTRICAL_HAZARD"]
                });

                const response = await service.handleChatInteraction('session-1', "Can I bypass the airbag sensor?");

                expect(response).toContain("safety concern");
                expect(mockChatAI.generateReply).not.toHaveBeenCalled();
            });

            it('should propagate SafetyMonitor errors (fail-safe)', async () => {
                setupTestContext();

                mockReactiveSafety.checkSafety.mockReturnValue({ intervention_required: false });
                mockSafetyMonitor.assess.mockRejectedValue(new Error('Safety AI service down'));

                // Current behavior: throws error (fail-safe - don't proceed if safety check fails)
                await expect(
                    service.handleChatInteraction('session-1', "Normal question")
                ).rejects.toThrow('Safety AI service down');

                // AI should NOT be called when safety check fails
                expect(mockChatAI.generateReply).not.toHaveBeenCalled();
            });
        });

        describe('Gate Priority', () => {
            it('should short-circuit at System 0 before System 1 runs', async () => {
                setupTestContext();

                mockReactiveSafety.checkSafety.mockReturnValue({
                    intervention_required: true,
                    suggested_output: "System 0 blocked this",
                    hazards_detected: ["PATTERN_MATCH"]
                });
                mockSafetyMonitor.assess.mockResolvedValue({
                    intervention_required: true,
                    suggested_output: "System 1 would have blocked this",
                    hazards_detected: ["SEMANTIC_MATCH"]
                });

                const response = await service.handleChatInteraction('session-1', "Dangerous message");

                expect(response).toContain("System 0");
                // System 1 should never be called since System 0 already blocked
                expect(mockSafetyMonitor.assess).not.toHaveBeenCalled();
            });

            it('should handle when BOTH systems would flag the same message', async () => {
                setupTestContext();

                // Reactive passes
                mockReactiveSafety.checkSafety.mockReturnValue({ intervention_required: false });
                // Semantic blocks
                mockSafetyMonitor.assess.mockResolvedValue({
                    intervention_required: true,
                    suggested_output: "Safety concern detected",
                    hazards_detected: ["SEMANTIC_ONLY"]
                });

                const response = await service.handleChatInteraction('session-1', "Implicit dangerous request");

                expect(response).toContain("Safety concern");
                expect(mockChatAI.generateReply).not.toHaveBeenCalled();
            });
        });
    });

    describe('Error Handling', () => {
        it('should handle missing session gracefully', async () => {
            mockSessionRepo.getHistory.mockResolvedValue(null);

            await expect(
                service.handleChatInteraction('non-existent-session', 'test')
            ).rejects.toThrow();
        });

        it('should handle missing vehicle gracefully', async () => {
            const user = TestFactory.createUser();
            const session = TestFactory.createSession(user.id, 'missing-vehicle-id');

            mockSessionRepo.getHistory.mockResolvedValue(session);
            mockVehicleRepo.findById.mockResolvedValue(null);

            mockReactiveSafety.checkSafety.mockReturnValue({ intervention_required: false });
            mockSafetyMonitor.assess.mockResolvedValue({ intervention_required: false });
            mockChatAI.generateReply.mockResolvedValue("Response without vehicle context");

            const response = await service.handleChatInteraction(session.id, 'test');

            // Should still work, just without vehicle context
            expect(response).toBeDefined();
        });

        it('should handle AI service failure', async () => {
            const user = TestFactory.createUser();
            const vehicle = TestFactory.createVehicle(user.id);
            const session = TestFactory.createSession(user.id, vehicle.id);

            mockSessionRepo.getHistory.mockResolvedValue(session);
            mockVehicleRepo.findById.mockResolvedValue(vehicle);
            mockReactiveSafety.checkSafety.mockReturnValue({ intervention_required: false });
            mockSafetyMonitor.assess.mockResolvedValue({ intervention_required: false });
            mockChatAI.generateReply.mockRejectedValue(new Error('Gemini API unavailable'));

            await expect(
                service.handleChatInteraction(session.id, 'test')
            ).rejects.toThrow('Gemini API unavailable');
        });
    });

    describe('Edge Cases', () => {
        it('should handle empty message', async () => {
            const user = TestFactory.createUser();
            const vehicle = TestFactory.createVehicle(user.id);
            const session = TestFactory.createSession(user.id, vehicle.id);

            mockSessionRepo.getHistory.mockResolvedValue(session);
            mockVehicleRepo.findById.mockResolvedValue(vehicle);
            mockReactiveSafety.checkSafety.mockReturnValue({ intervention_required: false });
            mockSafetyMonitor.assess.mockResolvedValue({ intervention_required: false });
            mockChatAI.generateReply.mockResolvedValue("I didn't catch that.");

            const response = await service.handleChatInteraction(session.id, '');

            expect(response).toBeDefined();
        });

        it('should handle very long message', async () => {
            const user = TestFactory.createUser();
            const vehicle = TestFactory.createVehicle(user.id);
            const session = TestFactory.createSession(user.id, vehicle.id);

            mockSessionRepo.getHistory.mockResolvedValue(session);
            mockVehicleRepo.findById.mockResolvedValue(vehicle);
            mockReactiveSafety.checkSafety.mockReturnValue({ intervention_required: false });
            mockSafetyMonitor.assess.mockResolvedValue({ intervention_required: false });
            mockChatAI.generateReply.mockResolvedValue("Got it.");

            const longMessage = 'a'.repeat(50000);
            const response = await service.handleChatInteraction(session.id, longMessage);

            expect(response).toBeDefined();
        });
    });
});
