import { NeurosymbolicState } from '../types/neurosymbolic';
import { ReasoningInput } from '../types/reasoning';

export interface AgentEvent {
    type: 'THOUGHT' | 'ACTION' | 'STATE_CHANGE' | 'ERROR';
    payload: unknown;
    timestamp: number;
}

export type AgentEventHandler = (event: AgentEvent) => void;

/**
 * Phase 4: FieldTech Agent Interface
 * Exposes the full power of the "Lemonade Mechanic" agent to the client.
 */
export interface IFieldTechAgent {
    /**
     * Diagnose a vehicle problem using multimodal input.
     * This drives the System 2 XState machine.
     */
    diagnose(input: ReasoningInput): Promise<NeurosymbolicState>;

    /**
     * Get a natural language explanation of what the agent is currently doing.
     * Useful for UI "loading" states.
     */
    explainCurrentState(): string;

    /**
     * Subscribe to real-time agent events (thoughts, actions, state changes).
     * @returns Unsubscribe function
     */
    subscribeToEvents(handler: AgentEventHandler): () => void;
}
