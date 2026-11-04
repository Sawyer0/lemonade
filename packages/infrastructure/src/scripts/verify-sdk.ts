import 'reflect-metadata';
import * as dotenv from 'dotenv';
import path from 'path';
import { createFieldTechAgent } from '../FieldTechSDK';

// Load env
dotenv.config({ path: path.resolve(__dirname, '../../../../.env.local') });

async function main() {
    console.log('🔄 Verifying FieldTech SDK Factory...');

    try {
        const agent = createFieldTechAgent();
        console.log('✅ Agent created successfully');

        console.log(`   State: ${agent.explainCurrentState()}`);

        if (typeof agent.diagnose === 'function' && typeof agent.subscribeToEvents === 'function') {
            console.log('✅ Interface methods verified');
        } else {
            throw new Error('Agent interface mismatch');
        }
    } catch (error) {
        console.error('❌ SDK Verification Failed:', error);
        process.exit(1);
    }
}

main();
