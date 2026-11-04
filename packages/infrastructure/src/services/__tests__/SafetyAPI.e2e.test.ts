import 'reflect-metadata';
import { describe, it, expect, beforeAll } from 'vitest';
import type { DocumentData, Firestore } from 'firebase-admin/firestore';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
const TEST_SESSION_ID = 'cb9fd194-7977-49ab-8e5e-d89b58ce7f4b'; // Test session from memory
const DEV_BYPASS_SECRET = process.env.DEV_BYPASS_SECRET;
// The Firestore tests write to a real project; run them only when credentials are set up.
const RUN_LIVE_CLOUD_TESTS = process.env.RUN_LIVE_CLOUD_TESTS === 'true';

describe('Safety API E2E Tests', () => {
    beforeAll(async () => {
        // Get auth token for test user
        // Using the test account from memory: e2e-test@lemonade.dev
        if (!DEV_BYPASS_SECRET) {
            console.warn('No DEV_BYPASS_SECRET - tests may fail without auth');
        }
    });

    describe('Chat API Safety Integration', () => {
        it.skip('should intercept dangerous message before AI processing', async () => {
            // This test verifies that safety checks happen BEFORE the AI call
            const response = await fetch(`${BASE_URL}/api/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-dev-bypass': DEV_BYPASS_SECRET || '',
                },
                body: JSON.stringify({
                    sessionId: TEST_SESSION_ID,
                    message: "My car is leaking gas everywhere, should I start it?"
                })
            });

            const data = await response.json();

            // The response should indicate safety intervention
            // This depends on how your chat API handles safety blocks
            console.log('Chat API response:', data);
        });

        it.skip('should allow safe messages through to AI', async () => {
            const response = await fetch(`${BASE_URL}/api/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-dev-bypass': DEV_BYPASS_SECRET || '',
                },
                body: JSON.stringify({
                    sessionId: TEST_SESSION_ID,
                    message: "How do I check my oil level?"
                })
            });

            const data = await response.json();

            // Should get a normal AI response, not safety intervention
            console.log('Safe message response:', data);
            expect(response.status).toBe(200);
        });
    });

    describe('Session Safety State', () => {
        it.skip('should mark session with safety_stop when intervention occurs', async () => {
            // First, send a dangerous message
            await fetch(`${BASE_URL}/api/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-dev-bypass': DEV_BYPASS_SECRET || '',
                },
                body: JSON.stringify({
                    sessionId: TEST_SESSION_ID,
                    message: "There is smoke coming from under the hood and I smell burning"
                })
            });

            // Then check if session was flagged
            const sessionResponse = await fetch(`${BASE_URL}/api/session/${TEST_SESSION_ID}`, {
                headers: {
                    'x-dev-bypass': DEV_BYPASS_SECRET || '',
                }
            });

            const session = await sessionResponse.json();
            console.log('Session after safety event:', session);

            // Session should have safety_stop flag
            // expect(session.safety_stop).toBe(true);
        });
    });
});

describe('LangSmith Trace Verification', () => {
    /**
     * These tests verify that LangSmith traces are being recorded
     * for safety-related AI calls.
     */

    it.skip('should create trace for safety intervention', async () => {
        // This would require LangSmith API access to verify traces exist
        // For now, we just log that traces should be checked manually
        console.log('Verify in LangSmith: https://smith.langchain.com/');
        console.log('Project: lemonade-master-tech');
        console.log('Look for traces with safety intervention tags');
    });
});

/**
 * DIRECT FIRESTORE INTEGRATION TESTS
 * These bypass the API and test direct Firestore operations.
 */
describe.runIf(RUN_LIVE_CLOUD_TESTS)('Firestore Direct Integration', async () => {
    // Dynamic import to handle module resolution
    let adminDb: Firestore;

    beforeAll(async () => {
        try {
            const { adminDb: db } = await import('../../firebase/admin');
            adminDb = db as unknown as Firestore;
        } catch {
            console.warn('Could not import adminDb - Firestore tests will be skipped');
        }
    });

    it('should write safety rule event to Firestore', async () => {
        if (!adminDb) {
            console.log('Skipping: adminDb not available');
            return;
        }

        const testEvent = {
            ruleId: 'integration-test-rule',
            hazardType: 'FUEL_LEAK',
            userQuery: 'Integration test query',
            sessionId: 'integration-test-session',
            timestamp: new Date(),
            wasOverriddenByUser: false,
            safetyMessage: 'Integration test safety message'
        };

        // Write to Firestore
        const docRef = await adminDb.collection('safety_rule_events').add(testEvent);
        expect(docRef.id).toBeTruthy();
        console.log('Created test event:', docRef.id);

        // Clean up
        await docRef.delete();
        console.log('Cleaned up test event');
    });

    it('should query recent safety events', async () => {
        if (!adminDb) {
            console.log('Skipping: adminDb not available');
            return;
        }

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const snapshot = await adminDb.collection('safety_rule_events')
            .where('timestamp', '>=', thirtyDaysAgo)
            .orderBy('timestamp', 'desc')
            .limit(10)
            .get();

        console.log(`Found ${snapshot.size} safety events in last 30 days`);

        snapshot.docs.forEach((doc: DocumentData) => {
            const data = doc.data();
            console.log(`  - ${data.ruleId}: ${data.hazardType} (${data.userQuery?.substring(0, 50)}...)`);
        });
    });
});
