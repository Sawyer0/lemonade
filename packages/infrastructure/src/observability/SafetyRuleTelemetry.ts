/**
 * SafetyRuleTelemetry.ts
 *
 * Logs safety rule firing events for analysis and refinement.
 * Part of Phase 2: Feedback Loop for Constraint Refinement.
 */

import { injectable, inject } from 'inversify';
import { ILogger } from '@lemonade/core';
import { TYPES } from '../di/types';
import { adminDb } from '../firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * Represents a safety rule firing event for telemetry.
 */
export interface RuleFiringEvent {
    /** Unique identifier of the rule that fired (e.g., "hc-env-001", "int-005") */
    ruleId: string;

    /** The type of hazard detected */
    hazardType: string;

    /** The original user query that triggered the rule */
    userQuery: string;

    /** When the rule fired */
    timestamp: Date;

    /** Whether the user acknowledged and proceeded anyway (for non-critical warnings) */
    wasOverriddenByUser: boolean;

    /** The diagnostic session ID for context */
    sessionId: string;

    /** Optional: The safety message shown to the user */
    safetyMessage?: string;
}

/**
 * Telemetry summary for a specific rule.
 */
export interface RuleTelemetrySummary {
    ruleId: string;
    totalFirings: number;
    overrideRate: number;
    lastFired: Date;
    commonTriggerPhrases: string[];
}

/**
 * Interface for the safety rule telemetry service.
 */
export interface ISafetyRuleTelemetry {
    logRuleFiring(event: RuleFiringEvent): Promise<void>;
    getRuleSummary(ruleId: string): Promise<RuleTelemetrySummary | null>;
    getAllRuleSummaries(limit?: number): Promise<RuleTelemetrySummary[]>;
}

const COLLECTION_NAME = 'safety_rule_events';

@injectable()
export class SafetyRuleTelemetry implements ISafetyRuleTelemetry {
    constructor(@inject(TYPES.Logger) private readonly logger: ILogger) {}

    /**
     * Log a safety rule firing event to Firestore.
     * This is designed to be fast and non-blocking.
     */
    async logRuleFiring(event: RuleFiringEvent): Promise<void> {
        try {
            // Fire-and-forget pattern for minimal latency impact
            const docRef = adminDb.collection(COLLECTION_NAME).doc();

            await docRef.set({
                ...event,
                timestamp: FieldValue.serverTimestamp(),
                createdAt: new Date().toISOString(),
            });

            this.logger.debug('Safety rule firing logged', {
                ruleId: event.ruleId,
                hazardType: event.hazardType,
                sessionId: event.sessionId,
            });
        } catch (error) {
            // Don't throw - telemetry should never break safety checks
            this.logger.error('Failed to log safety rule firing', {
                error: error instanceof Error ? error.message : String(error),
                ruleId: event.ruleId,
            });
        }
    }

    /**
     * Get telemetry summary for a specific rule.
     */
    async getRuleSummary(ruleId: string): Promise<RuleTelemetrySummary | null> {
        try {
            const snapshot = await adminDb
                .collection(COLLECTION_NAME)
                .where('ruleId', '==', ruleId)
                .orderBy('timestamp', 'desc')
                .limit(100)
                .get();

            if (snapshot.empty) {
                return null;
            }

            const events = snapshot.docs.map((doc) => doc.data() as RuleFiringEvent);
            const overriddenCount = events.filter((e) => e.wasOverriddenByUser).length;

            // Extract common phrases (simple word frequency)
            const phraseCounts = new Map<string, number>();
            for (const event of events) {
                const words = event.userQuery
                    .toLowerCase()
                    .split(/\s+/)
                    .filter((w) => w.length > 3);
                for (const word of words) {
                    phraseCounts.set(word, (phraseCounts.get(word) || 0) + 1);
                }
            }
            const commonPhrases = Array.from(phraseCounts.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([phrase]) => phrase);

            return {
                ruleId,
                totalFirings: events.length,
                overrideRate: events.length > 0 ? overriddenCount / events.length : 0,
                lastFired: events[0]?.timestamp || new Date(),
                commonTriggerPhrases: commonPhrases,
            };
        } catch (error) {
            this.logger.error('Failed to get rule summary', {
                error: error instanceof Error ? error.message : String(error),
                ruleId,
            });
            return null;
        }
    }

    /**
     * Get summaries for all rules that have fired.
     */
    async getAllRuleSummaries(limit: number = 50): Promise<RuleTelemetrySummary[]> {
        try {
            // Get unique rule IDs from recent events
            const snapshot = await adminDb.collection(COLLECTION_NAME).orderBy('timestamp', 'desc').limit(1000).get();

            if (snapshot.empty) {
                return [];
            }

            // Group by ruleId
            const eventsByRule = new Map<string, RuleFiringEvent[]>();
            for (const doc of snapshot.docs) {
                const event = doc.data() as RuleFiringEvent;
                const existing = eventsByRule.get(event.ruleId) || [];
                existing.push(event);
                eventsByRule.set(event.ruleId, existing);
            }

            // Build summaries
            const summaries: RuleTelemetrySummary[] = [];
            for (const [ruleId, events] of eventsByRule.entries()) {
                const overriddenCount = events.filter((e) => e.wasOverriddenByUser).length;

                summaries.push({
                    ruleId,
                    totalFirings: events.length,
                    overrideRate: events.length > 0 ? overriddenCount / events.length : 0,
                    lastFired: events[0]?.timestamp || new Date(),
                    commonTriggerPhrases: [],
                });
            }

            // Sort by firing count and limit
            return summaries.sort((a, b) => b.totalFirings - a.totalFirings).slice(0, limit);
        } catch (error) {
            this.logger.error('Failed to get all rule summaries', {
                error: error instanceof Error ? error.message : String(error),
            });
            return [];
        }
    }
}
