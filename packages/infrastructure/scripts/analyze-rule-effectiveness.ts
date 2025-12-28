/**
 * analyze-rule-effectiveness.ts
 * 
 * Analyzes safety rule telemetry data to identify:
 * - Most/least frequently triggered rules
 * - Rules with high override rates (potential false positives)
 * - Common trigger phrases for each rule
 * 
 * Run with: npx tsx packages/infrastructure/scripts/analyze-rule-effectiveness.ts
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

// Initialize Firebase Admin if not already done
if (getApps().length === 0) {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!serviceAccount) {
        console.error('Error: FIREBASE_SERVICE_ACCOUNT_KEY environment variable required');
        process.exit(1);
    }
    initializeApp({
        credential: cert(JSON.parse(serviceAccount)),
    });
}

const db = getFirestore();
const COLLECTION_NAME = 'safety_rule_events';

interface RuleFiringEvent {
    ruleId: string;
    hazardType: string;
    userQuery: string;
    timestamp: FirebaseFirestore.Timestamp;
    wasOverriddenByUser: boolean;
    sessionId: string;
    safetyMessage?: string;
}

interface RuleAnalysis {
    ruleId: string;
    totalFirings: number;
    overrideCount: number;
    overrideRate: number;
    hazardType: string;
    lastFired: string;
    commonPhrases: string[];
    recommendation: 'keep' | 'refine' | 'remove';
}

async function analyzeRuleEffectiveness() {
    console.log('🔍 Analyzing safety rule effectiveness...\n');

    try {
        // Fetch all rule firing events (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const snapshot = await db
            .collection(COLLECTION_NAME)
            .where('timestamp', '>=', thirtyDaysAgo)
            .orderBy('timestamp', 'desc')
            .limit(5000)
            .get();

        if (snapshot.empty) {
            console.log('📭 No rule firing events found in the last 30 days.');
            console.log('   Deploy with telemetry enabled and collect data first.');
            return;
        }

        console.log(`📊 Found ${snapshot.size} rule firing events\n`);

        // Group events by ruleId
        const ruleEvents = new Map<string, RuleFiringEvent[]>();
        for (const doc of snapshot.docs) {
            const event = doc.data() as RuleFiringEvent;
            const existing = ruleEvents.get(event.ruleId) || [];
            existing.push(event);
            ruleEvents.set(event.ruleId, existing);
        }

        // Analyze each rule
        const analyses: RuleAnalysis[] = [];
        for (const [ruleId, events] of ruleEvents.entries()) {
            const overrideCount = events.filter(e => e.wasOverriddenByUser).length;
            const overrideRate = events.length > 0 ? overrideCount / events.length : 0;

            // Extract common phrases (word frequency)
            const phraseCounts = new Map<string, number>();
            for (const event of events) {
                const words = event.userQuery.toLowerCase()
                    .split(/\s+/)
                    .filter(w => w.length > 3 && !['the', 'and', 'that', 'with', 'this'].includes(w));
                for (const word of words) {
                    phraseCounts.set(word, (phraseCounts.get(word) || 0) + 1);
                }
            }
            const commonPhrases = Array.from(phraseCounts.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([phrase]) => phrase);

            // Determine recommendation
            let recommendation: 'keep' | 'refine' | 'remove' = 'keep';
            if (overrideRate > 0.5) {
                recommendation = 'remove'; // More than 50% overridden = likely false positive
            } else if (overrideRate > 0.2) {
                recommendation = 'refine'; // 20-50% overridden = needs refinement
            }

            analyses.push({
                ruleId,
                totalFirings: events.length,
                overrideCount,
                overrideRate,
                hazardType: events[0]?.hazardType || 'UNKNOWN',
                lastFired: events[0]?.timestamp?.toDate?.()?.toISOString() || 'Unknown',
                commonPhrases,
                recommendation,
            });
        }

        // Sort by firing count (most active first)
        analyses.sort((a, b) => b.totalFirings - a.totalFirings);

        // Print report
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('                    SAFETY RULE EFFECTIVENESS REPORT           ');
        console.log('═══════════════════════════════════════════════════════════════\n');

        console.log('📈 OVERVIEW');
        console.log(`   Total events: ${snapshot.size}`);
        console.log(`   Unique rules: ${analyses.length}`);
        console.log(`   Rules to review: ${analyses.filter(a => a.recommendation !== 'keep').length}\n`);

        console.log('🔴 HIGH PRIORITY (Recommend Remove/Refine)');
        console.log('───────────────────────────────────────────');
        const needsAttention = analyses.filter(a => a.recommendation !== 'keep');
        if (needsAttention.length === 0) {
            console.log('   None - all rules performing well!\n');
        } else {
            for (const rule of needsAttention) {
                console.log(`   ${rule.ruleId} [${rule.recommendation.toUpperCase()}]`);
                console.log(`      Firings: ${rule.totalFirings} | Override Rate: ${(rule.overrideRate * 100).toFixed(1)}%`);
                console.log(`      Hazard: ${rule.hazardType}`);
                console.log(`      Common phrases: ${rule.commonPhrases.join(', ')}\n`);
            }
        }

        console.log('🟢 TOP PERFORMING RULES');
        console.log('───────────────────────────────────────────');
        const topRules = analyses.filter(a => a.recommendation === 'keep').slice(0, 5);
        for (const rule of topRules) {
            console.log(`   ${rule.ruleId}`);
            console.log(`      Firings: ${rule.totalFirings} | Override Rate: ${(rule.overrideRate * 100).toFixed(1)}%`);
            console.log(`      Hazard: ${rule.hazardType}\n`);
        }

        // Save detailed report to JSON
        const reportPath = path.join(__dirname, 'rule-effectiveness-report.json');
        fs.writeFileSync(reportPath, JSON.stringify({
            generatedAt: new Date().toISOString(),
            totalEvents: snapshot.size,
            uniqueRules: analyses.length,
            analyses,
        }, null, 2));

        console.log(`📁 Full report saved to: ${reportPath}`);

    } catch (error) {
        console.error('❌ Error analyzing rules:', error);
        process.exit(1);
    }
}

// Run analysis
analyzeRuleEffectiveness();
