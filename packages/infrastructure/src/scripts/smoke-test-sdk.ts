import 'reflect-metadata';
import * as dotenv from 'dotenv';
import path from 'path';
import { createFieldTechAgent } from '../FieldTechSDK';
import { ReasoningInput } from '@lemonade/core';

// Load env
dotenv.config({ path: path.resolve(__dirname, '../../../../.env.local') });

async function main() {
    console.log('🚀 Starting SDK Smoke Test...');

    try {
        // 1. Initialize
        const agent = createFieldTechAgent();
        console.log('✅ Agent Factory Initialized');

        // 2. Subscribe to events
        console.log('📡 Subscribing to events...');
        agent.subscribeToEvents((event) => {
            const time = new Date(event.timestamp).toLocaleTimeString();
            console.log(`   [${time}] [${event.type}]`, event.payload);
        });

        // 3. Prepare Input
        const input: ReasoningInput = {
            userQuery: 'My 2018 F-150 has a weird scraping noise when I brake.',
            sessionId: `smoke-test-${Date.now()}`,
            userId: 'smoke-test-user',
            vehicleContext: {
                year: 2018,
                make: 'Ford',
                model: 'F-150',
                vin: '1FTEW1CP5KFA12345', // Dummy VIN, might fail validation but that's okay, we want to test the flow
            },
            complaint: 'Scraping noise when braking',
        };

        console.log(`🏁 Calling agent.diagnose() for session: ${input.sessionId}`);
        console.log(`   Query: "${input.userQuery}"`);

        // 4. Execute
        const result = await agent.diagnose(input);

        // 5. Report
        console.log('\n✅ Diagnosis Complete!');
        console.log('==========================================');
        console.log('DECISION:', result.finalDiagnosis.decision);
        console.log('CONFIDENCE:', result.finalDiagnosis.metaConfidence);
        console.log('REASONING:', result.finalDiagnosis.reasoningTrace);
        console.log('OUTPUT:', result.finalDiagnosis.userOutput);
        console.log('==========================================');
    } catch (error) {
        console.error('❌ Smoke Test Failed:', error);
        process.exit(1);
    }
}

main();
