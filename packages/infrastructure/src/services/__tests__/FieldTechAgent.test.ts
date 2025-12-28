
import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FieldTechAgent } from '../FieldTechAgent';
import {
    IMechanicReasoningService,
    ISessionRepository,
    ILogger,
    ReasoningInput,
    NeurosymbolicState,
    AgentEvent
} from '@lemonade/core';

describe('FieldTechAgent', () => {
    let agent: FieldTechAgent;
    let mockReasoning: IMechanicReasoningService;
    let mockSessionRepo: ISessionRepository;
    let mockLogger: ILogger;

    const mockState: NeurosymbolicState = {
        complaint: 'test problem',
        intuition: { hypothesis: 'test', confidence: 0.9, reasoning: 'reason' },
        authorityData: { vin: '123', nhtsaRecalls: [], manualSpecs: null, safetyAlerts: [] },
        visualGrounding: { engineDescription: '', isStock: true, visualConflictDetected: false, detectedCondition: 'unknown' },
        consensus: { similarCasesFound: 0, consensusFix: null, isKnownIssue: false },
        verification: { isVerified: true, verifiedSource: 'manual', searchQueryUsed: null, conflictingEvidence: null },
        finalDiagnosis: {
            decision: 'PROCEED',
            reasoningTrace: 'trace',
            userOutput: 'output',
            requiredActions: [],
            metaConfidence: 0.9
        }
    };

    beforeEach(() => {
        mockReasoning = {
            diagnose: vi.fn().mockResolvedValue(mockState)
        } as unknown as IMechanicReasoningService;

        mockSessionRepo = {
            // Mock if needed
        } as unknown as ISessionRepository;

        mockLogger = {
            info: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
            warn: vi.fn()
        } as unknown as ILogger;

        agent = new FieldTechAgent(mockReasoning, mockSessionRepo, mockLogger);
    });

    it('should delegate diagnosis and return result', async () => {
        const input: ReasoningInput = {
            userQuery: 'test query',
            sessionId: 'session-123',
            userId: 'user-1',
            vehicleContext: { year: 2020, make: 'Ford', model: 'F-150' }
        };

        const result = await agent.diagnose(input);

        expect(mockReasoning.diagnose).toHaveBeenCalledWith(input);
        expect(result).toEqual(mockState);
    });

    it('should emit events during diagnosis', async () => {
        const events: AgentEvent[] = [];
        agent.subscribeToEvents((e) => events.push(e));

        const input: ReasoningInput = {
            userQuery: 'test query',
            sessionId: 'session-123',
            userId: 'user-1',
            vehicleContext: { year: 2020, make: 'Ford', model: 'F-150' }
        };

        await agent.diagnose(input);

        // Should have STATE_CHANGE (diagnosing), THOUGHT, STATE_CHANGE (complete)
        expect(events.length).toBeGreaterThanOrEqual(3);
        expect(events[0].type).toBe('STATE_CHANGE');
        expect((events[0].payload as { phase: string }).phase).toBe('diagnosing');
        expect(events[events.length - 1].type).toBe('STATE_CHANGE');
        expect((events[events.length - 1].payload as { phase: string }).phase).toBe('complete');
    });

    it('should return human-readable explanation of state', () => {
        expect(agent.explainCurrentState()).toContain('current');
    });
});
