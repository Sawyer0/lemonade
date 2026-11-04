import { injectable, inject, optional } from 'inversify';
import { IReactiveSafetyService, SafetyAssessment } from '@lemonade/core';
import generatedRules from './generated-safety-rules.json';
import type { ISafetyRuleTelemetry } from '../observability/SafetyRuleTelemetry';

// Extract HazardType from SafetyAssessment
type HazardType = SafetyAssessment['hazards_detected'][number];

// Type for JSON rule structure
interface GeneratedEnvironmentalRule {
    id: string;
    pattern: string;
    hazard: string;
    message: string;
}

interface GeneratedInteractionRule {
    id: string;
    nounPattern: string;
    hazard: string;
    message: string;
}

// Define rule types for type safety
interface EnvironmentalTrigger {
    id: string;
    regex: RegExp;
    hazard: HazardType;
    message: string;
}

interface InteractionHazard {
    id: string;
    nounRegex: RegExp;
    hazard: HazardType;
    message: string;
}

// Extended SafetyAssessment with rule tracking
export interface SafetyAssessmentWithRule extends SafetyAssessment {
    ruleId?: string;
}

// DI symbol for telemetry (optional dependency)
export const SAFETY_TELEMETRY_TYPE = Symbol.for('ISafetyRuleTelemetry');

@injectable()
export class ReactiveSafetyService implements IReactiveSafetyService {
    // ========================================
    // HARDCODED RULES (Battle-tested, Priority)
    // ========================================

    private readonly HARDCODED_ENVIRONMENTAL_TRIGGERS: EnvironmentalTrigger[] = [
        {
            id: 'hc-env-001',
            regex: /\b((leaking|leak|smell|spilling)\s+(gas|fuel|gasoline|diesel|petrol)|(gas|fuel|gasoline|diesel|petrol)\s+(smell|leak|leaking|spilling))\b/i,
            hazard: 'FUEL_LEAK',
            message:
                'CRITICAL SAFETY STOP: Fuel leak detected. Extinguish all smoking materials, do not use electronic devices near the vehicle, and evacuate the area immediately.',
        },
        {
            id: 'hc-env-002',
            regex: /\b(smoke|fire|flames|burning|sparking)\s+.*\b(battery|hv|high voltage|electric)\b/i,
            hazard: 'HIGH_VOLTAGE',
            message:
                'CRITICAL SAFETY STOP: Battery fire or thermal event suspected. Do not attempt to extinguish with water. Evacuate to a safe distance and call emergency services.',
        },
    ];

    private readonly HARDCODED_INTERACTION_HAZARDS: InteractionHazard[] = [
        {
            id: 'hc-int-001',
            nounRegex: /\b(orange\s+cables?|hv\s+battery|high\s+voltage)\b/i,
            hazard: 'HIGH_VOLTAGE',
            message:
                'CRITICAL SAFETY STOP: High voltage hazard. Do not touch or handle these components without certified HV training.',
        },
        {
            id: 'hc-int-002',
            nounRegex: /\b(under\s+the\s+(car|vehicle|truck|suv))\b/i,
            hazard: 'JACK_STAND_MISSING',
            message:
                'SAFETY STOP: Jack stands required. Do not go under the vehicle without verified jack stand support.',
        },
    ];

    // ========================================
    // GENERATED RULES (LLM-expanded coverage)
    // ========================================

    private readonly GENERATED_ENVIRONMENTAL_TRIGGERS: EnvironmentalTrigger[];
    private readonly GENERATED_INTERACTION_HAZARDS: InteractionHazard[];

    // Combined rules (hardcoded first, then generated)
    private readonly ALL_ENVIRONMENTAL_TRIGGERS: EnvironmentalTrigger[];
    private readonly ALL_INTERACTION_HAZARDS: InteractionHazard[];

    // Safe Verbs (merged from hardcoded + generated)
    private readonly SAFE_VERBS_REGEX: RegExp;

    // Optional telemetry service (Phase 2)
    private readonly telemetry?: ISafetyRuleTelemetry;

    constructor(@inject(SAFETY_TELEMETRY_TYPE) @optional() telemetry?: ISafetyRuleTelemetry) {
        this.telemetry = telemetry;

        // Parse generated environmental triggers with explicit typing
        const envRules = generatedRules.environmentalTriggers as GeneratedEnvironmentalRule[];
        this.GENERATED_ENVIRONMENTAL_TRIGGERS = envRules.map((rule: GeneratedEnvironmentalRule) => ({
            id: rule.id,
            regex: new RegExp(rule.pattern, 'i'),
            hazard: rule.hazard as HazardType,
            message: rule.message,
        }));

        // Parse generated interaction hazards with explicit typing
        const intRules = generatedRules.interactionHazards as GeneratedInteractionRule[];
        this.GENERATED_INTERACTION_HAZARDS = intRules.map((rule: GeneratedInteractionRule) => ({
            id: rule.id,
            nounRegex: new RegExp(rule.nounPattern, 'i'),
            hazard: rule.hazard as HazardType,
            message: rule.message,
        }));

        // Combine rules: hardcoded take priority (are checked first)
        this.ALL_ENVIRONMENTAL_TRIGGERS = [
            ...this.HARDCODED_ENVIRONMENTAL_TRIGGERS,
            ...this.GENERATED_ENVIRONMENTAL_TRIGGERS,
        ];

        this.ALL_INTERACTION_HAZARDS = [...this.HARDCODED_INTERACTION_HAZARDS, ...this.GENERATED_INTERACTION_HAZARDS];

        // Build safe verbs regex from generated list + core verbs
        const safeVerbs = new Set([
            // Core verbs (always included)
            'see',
            'look',
            'looking',
            'inspected',
            'inspect',
            'check',
            'checking',
            'checked',
            'scan',
            'scanning',
            'scanned',
            'read',
            'reading',
            'notice',
            'noticed',
            'find',
            'finding',
            'finds',
            'saw',
            'observe',
            'observed',
            // Generated verbs
            ...generatedRules.safeVerbs,
        ]);

        const verbPattern = Array.from(safeVerbs).join('|');
        this.SAFE_VERBS_REGEX = new RegExp(`\\b(${verbPattern})\\b`, 'i');
    }

    checkSafety(userMessage: string): SafetyAssessment | null {
        return this.checkSafetyInternal(userMessage).assessment;
    }

    /**
     * Check safety with optional telemetry logging.
     * Use this method when you have session context for telemetry.
     */
    async checkSafetyWithTelemetry(userMessage: string, sessionId: string): Promise<SafetyAssessmentWithRule | null> {
        const result = this.checkSafetyInternal(userMessage);

        if (result.assessment && result.ruleId && this.telemetry) {
            // Log the rule firing (fire-and-forget)
            this.telemetry
                .logRuleFiring({
                    ruleId: result.ruleId,
                    hazardType: result.assessment.hazards_detected[0] || 'UNKNOWN',
                    userQuery: userMessage,
                    timestamp: new Date(),
                    wasOverriddenByUser: false, // Will be updated if user proceeds
                    sessionId,
                    safetyMessage: result.assessment.suggested_output,
                })
                .catch(() => {
                    /* Telemetry errors should not affect safety */
                });
        }

        if (!result.assessment) return null;

        return {
            ...result.assessment,
            ruleId: result.ruleId,
        };
    }

    private checkSafetyInternal(userMessage: string): { assessment: SafetyAssessment | null; ruleId?: string } {
        // 1. Check Environmental Hazards (Always Trigger)
        for (const trigger of this.ALL_ENVIRONMENTAL_TRIGGERS) {
            if (trigger.regex.test(userMessage)) {
                return {
                    assessment: this.createAssessment(trigger.hazard, trigger.message),
                    ruleId: trigger.id,
                };
            }
        }

        // 2. Check Interaction Hazards (Inverted Logic)
        for (const rule of this.ALL_INTERACTION_HAZARDS) {
            // A. Is the Noun Present? (e.g. "Orange Cable")
            if (rule.nounRegex.test(userMessage)) {
                // B. Is there a Safe Verb? (e.g. "Looking")
                const hasSafeVerb = this.SAFE_VERBS_REGEX.test(userMessage);

                // C. If NO Safe Verb -> BLOCK IT.
                if (!hasSafeVerb) {
                    return {
                        assessment: this.createAssessment(rule.hazard, rule.message),
                        ruleId: rule.id,
                    };
                }
            }
        }

        return { assessment: null };
    }

    private createAssessment(hazard: HazardType, message: string): SafetyAssessment {
        return {
            safety_score: 0,
            hazards_detected: [hazard],
            user_intent: 'dangerous_action',
            intervention_required: true,
            suggested_output: message,
        };
    }

    // Expose rule counts for monitoring
    getRuleCounts(): { environmental: number; interaction: number; totalRules: number } {
        return {
            environmental: this.ALL_ENVIRONMENTAL_TRIGGERS.length,
            interaction: this.ALL_INTERACTION_HAZARDS.length,
            totalRules: this.ALL_ENVIRONMENTAL_TRIGGERS.length + this.ALL_INTERACTION_HAZARDS.length,
        };
    }
}
