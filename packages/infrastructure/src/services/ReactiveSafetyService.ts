import { injectable } from 'inversify';
import { IReactiveSafetyService, SafetyAssessment } from '@lemonade/core';

@injectable()
export class ReactiveSafetyService implements IReactiveSafetyService {
    // Environmental Hazards: Trigger on PRESENCE (Regex)
    private readonly ENVIRONMENTAL_TRIGGERS = [
        {
            regex: /\b((leaking|leak|smell|spilling)\s+(gas|fuel|gasoline|diesel|petrol)|(gas|fuel|gasoline|diesel|petrol)\s+(smell|leak|leaking|spilling))\b/i,
            hazard: 'FUEL_LEAK' as const,
            message: 'CRITICAL SAFETY STOP: Fuel leak detected. Extinguish all smoking materials, do not use electronic devices near the vehicle, and evacuate the area immediately.'
        },
        {
            regex: /\b(smoke|fire|flames|burning|sparking)\s+.*\b(battery|hv|high voltage|electric)\b/i,
            hazard: 'HIGH_VOLTAGE' as const,
            message: 'CRITICAL SAFETY STOP: Battery fire or thermal event suspected. Do not attempt to extinguish with water. Evacuate to a safe distance and call emergency services.'
        }
    ] as const;

    // Interaction Hazards: Trigger on NOUN + LACK OF SAFE VERB (Inverted Logic)
    private readonly INTERACTION_HAZARDS = [
        {
            nounRegex: /\b(orange\s+cables?|hv\s+battery|high\s+voltage)\b/i,
            hazard: 'HIGH_VOLTAGE' as const,
            message: 'CRITICAL SAFETY STOP: High voltage hazard. Do not touch or handle these components without certified HV training.'
        },
        {
            nounRegex: /\b(under\s+the\s+(car|vehicle|truck|suv))\b/i,
            hazard: 'JACK_STAND_MISSING' as const,
            message: 'SAFETY STOP: Jack stands required. Do not go under the vehicle without verified jack stand support.'
        }
    ];

    // Safe Verbs (Whitelist)
    private readonly SAFE_VERBS_REGEX = /\b(see|look|looking|inspected?|check(ing|ed)?|scan(ning|ned)?|read(ing)?|notice(d)?|find(ing|s)?|saw|observe(d)?)\b/i;

    checkSafety(userMessage: string): SafetyAssessment | null {
        // 1. Check Environmental Hazards (Always Trigger)
        for (const trigger of this.ENVIRONMENTAL_TRIGGERS) {
            if (trigger.regex.test(userMessage)) {
                return this.createAssessment(trigger.hazard, trigger.message);
            }
        }

        // 2. Check Interaction Hazards (Inverted Logic)
        for (const rule of this.INTERACTION_HAZARDS) {
            // A. Is the Noun Present? (e.g. "Orange Cable")
            if (rule.nounRegex.test(userMessage)) {
                // B. Is there a Safe Verb? (e.g. "Looking")
                const hasSafeVerb = this.SAFE_VERBS_REGEX.test(userMessage);

                // C. If NO Safe Verb -> BLOCK IT.
                if (!hasSafeVerb) {
                    return this.createAssessment(rule.hazard, rule.message);
                }
            }
        }

        return null;
    }

    private createAssessment(hazard: "JACK_STAND_MISSING" | "HIGH_VOLTAGE" | "FUEL_LEAK" | "SAFETY_CHECK_FAILED" | "NONE", message: string): SafetyAssessment {
        return {
            safety_score: 0,
            hazards_detected: [hazard],
            user_intent: 'dangerous_action',
            intervention_required: true,
            suggested_output: message
        };
    }
}