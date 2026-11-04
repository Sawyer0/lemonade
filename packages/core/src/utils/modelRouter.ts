/**
 * Model Router - Dynamic Model Selection for XState States
 *
 * Routes LLM invocations to the optimal model based on the current XState state.
 * This optimizes costs while maintaining quality where it matters most.
 */

import { SHARED_CONFIG } from '../config';

export type MechanicState =
    'idle' | 'gathering_context' | 'intuition' | 'investigating' | 'vision_verifying' | 'synthesizing';

export interface ModelRoutingConfig {
    model: string;
    reason: string;
    costMultiplier: number; // Relative to Flash (1.0)
}

// Model constants from config
const FLASH_MODEL = SHARED_CONFIG.AI_MODELS.AGENT.WORKER;
const PRO_MODEL = SHARED_CONFIG.AI_MODELS.AGENT.BRAIN;
const LOCAL_MODEL = 'local-smolvlm';

/**
 * State-to-Model Mapping
 *
 * Key Design Decisions:
 * - `intuition`: Uses Pro for deep diagnostic reasoning (the "Brain")
 * - `vision_verifying`: Uses local model (SmolVLM2) for on-device triage
 * - Everything else: Uses Flash for cost efficiency
 */
export const MODEL_ROUTING: Record<MechanicState, ModelRoutingConfig> = {
    idle: {
        model: FLASH_MODEL,
        reason: 'No LLM needed - awaiting input',
        costMultiplier: 0,
    },
    gathering_context: {
        model: 'gemini-2.5-flash',
        reason: 'Simple data formatting and API parsing',
        costMultiplier: 1.0,
    },
    intuition: {
        model: PRO_MODEL,
        reason: 'Deep diagnostic reasoning - ASE Master Technician',
        costMultiplier: 4.0,
    },
    investigating: {
        model: 'gemini-2.5-flash',
        reason: 'Search result parsing and verification',
        costMultiplier: 1.0,
    },
    vision_verifying: {
        model: LOCAL_MODEL,
        reason: 'On-device triage (SmolVLM2 via llama.rn)',
        costMultiplier: 0,
    },
    synthesizing: {
        model: 'gemini-2.5-flash',
        reason: 'JSON cleanup and final summary',
        costMultiplier: 1.0,
    },
};

/**
 * Get the optimal model for a given XState state
 */
export function getModelForState(state: MechanicState): string {
    return MODEL_ROUTING[state]?.model ?? FLASH_MODEL;
}

/**
 * Get the routing configuration for a given state
 */
export function getRoutingConfig(state: MechanicState): ModelRoutingConfig {
    return (
        MODEL_ROUTING[state] ?? {
            model: FLASH_MODEL,
            reason: 'Default fallback',
            costMultiplier: 1.0,
        }
    );
}

/**
 * Check if a state should use local model
 */
export function shouldUseLocalModel(state: MechanicState): boolean {
    return getModelForState(state) === LOCAL_MODEL;
}

/**
 * Check if a state requires the Pro model (expensive reasoning)
 */
export function requiresProModel(state: MechanicState): boolean {
    return getModelForState(state).includes('pro');
}
