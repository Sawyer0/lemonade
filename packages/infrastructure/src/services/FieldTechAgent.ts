import { injectable, inject } from 'inversify';
import type {
    IFieldTechAgent,
    AgentEvent,
    AgentEventHandler,
    ILogger,
    NeurosymbolicState,
    ReasoningInput,
    IMechanicReasoningService,
    ISessionRepository,
} from '@lemonade/core';
import { TYPES } from '../di/types';

@injectable()
export class FieldTechAgent implements IFieldTechAgent {
    private eventListeners: Set<AgentEventHandler> = new Set();
    private currentPhase: string = 'idle';

    constructor(
        @inject(TYPES.MechanicReasoningService) private mechanicReasoning: IMechanicReasoningService,
        @inject(TYPES.SessionRepository) private sessionRepo: ISessionRepository,
        @inject(TYPES.Logger) private logger: ILogger,
    ) {}

    async diagnose(input: ReasoningInput): Promise<NeurosymbolicState> {
        this.emit({ type: 'STATE_CHANGE', payload: { phase: 'diagnosing' }, timestamp: Date.now() });
        this.currentPhase = 'diagnosing';

        try {
            this.emit({
                type: 'THOUGHT',
                payload: `Starting diagnosis for session ${input.sessionId}`,
                timestamp: Date.now(),
            });

            // Delegate to System 2 Logic
            const result = await this.mechanicReasoning.diagnose(input);

            this.currentPhase = 'complete';
            this.emit({ type: 'STATE_CHANGE', payload: { phase: 'complete', result }, timestamp: Date.now() });

            return result;
        } catch (error) {
            this.currentPhase = 'error';
            this.emit({ type: 'ERROR', payload: error, timestamp: Date.now() });
            throw error;
        }
    }

    explainCurrentState(): string {
        switch (this.currentPhase) {
            case 'idle':
                return 'I am currently idle, waiting for vehicle data.';
            case 'diagnosing':
                return 'I am currently analyzing the vehicle state, checking recalls, and consulting the service manual.';
            case 'complete':
                return 'I have finished the diagnosis and verified the results.';
            case 'error':
                return 'I encountered an error during the last operation.';
            default:
                return 'I am processing data.';
        }
    }

    subscribeToEvents(handler: AgentEventHandler): () => void {
        this.eventListeners.add(handler);
        return () => {
            this.eventListeners.delete(handler);
        };
    }

    private emit(event: AgentEvent) {
        this.eventListeners.forEach((handler) => {
            try {
                handler(event);
            } catch (err) {
                // Prevent listener errors from breaking the loop
                this.logger.error('Error in agent event listener', err as Error);
            }
        });
    }
}
