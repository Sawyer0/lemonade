import type { AIAnalysis } from '@lemonade/core';
import type { ChatCompletionRequest } from './ChatCompletionClient';
import { FakeChatCompletionClient } from './FakeChatCompletionClient';

/**
 * Canned model clients for LLM_PROVIDER=offline: the app runs end to end with no
 * model key or network, for demos, smoke tests and CI. Replies are fixed, so
 * they show the flow, not real diagnoses.
 */
export const OFFLINE_MODEL = 'offline-demo';

export const OFFLINE_CHAT_REPLY =
    'Offline demo reply: a squeal that fades after a few stops is usually surface rust on the rotors or ' +
    'glazed pads. Check pad thickness through the wheel spokes (replace under 3 mm) and look for a lip on ' +
    'the rotor edge.';

const OFFLINE_SAFETY_ASSESSMENT = {
    safety_score: 95,
    hazards_detected: [],
    user_intent: 'diagnostic_question',
    intervention_required: false,
};

const OFFLINE_VERIFICATION = {
    isVerified: false,
    source: null,
    reasoning: 'Offline demo: no external sources are checked.',
};

export const OFFLINE_ANALYSIS: AIAnalysis = {
    diagnosis: 'Offline demo: glazed front brake pads',
    reasoning: 'Fixed offline reply; no model was called.',
    investigationPlan: ['Measure pad thickness', 'Check the rotor edge for a lip'],
    visual_evidence: [],
    acoustic_evidence: [],
    severity: 'low',
    safety_alert: false,
    suggested_actions: ['Replace pads under 3 mm'],
    engineDescription: 'Not analyzed (offline demo)',
    isStock: true,
    visualConflictDetected: false,
    detectedCondition: 'unknown',
    confidence: 0.5,
};

const json = (value: unknown) => () => JSON.stringify(value);

/** Chat: plain text answers, and an unverified result for hypothesis checks (JSON requests). */
export function createOfflineChatClient(): FakeChatCompletionClient {
    return new FakeChatCompletionClient(
        [],
        (request: ChatCompletionRequest) =>
            request.jsonMode ? JSON.stringify(OFFLINE_VERIFICATION) : OFFLINE_CHAT_REPLY,
        OFFLINE_MODEL,
    );
}

/** System 1 safety: every message assessed as a safe diagnostic question. */
export function createOfflineSafetyClient(): FakeChatCompletionClient {
    return new FakeChatCompletionClient([], json(OFFLINE_SAFETY_ASSESSMENT), OFFLINE_MODEL);
}

/** Media: a fixed, schema-valid analysis for any photo or frame. */
export function createOfflineMediaClient(): FakeChatCompletionClient {
    return new FakeChatCompletionClient([], json(OFFLINE_ANALYSIS), OFFLINE_MODEL);
}
