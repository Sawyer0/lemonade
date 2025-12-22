import { Client } from 'langsmith';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function sync() {
    console.log('Available Env Keys:', Object.keys(process.env).filter(k => !k.includes('SECRET') && !k.includes('KEY')));
    // Just looking for the pattern without printing values
    const langchainKey = Object.keys(process.env).find(k => k.includes('LANG'));
    console.log('Found LangChain related key:', langchainKey);

    const apiKey = process.env.LANGSMITH_API_KEY || process.env.LANGCHAIN_API_KEY;
    if (apiKey) {
        console.log(`LangSmith/LangChain API Key found: ${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}`);
    } else {
        console.log('LangSmith/LangChain API Key NOT found in environment.');
    }

    const client = new Client();
    const datasetPath = path.resolve(__dirname, '../packages/infrastructure/src/observability/data/golden_dataset.json');
    const scenarios = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));

    const datasetName = 'Master Tech Golden Set';
    const description = '20+ real-world vehicle failure scenarios for diagnostic evaluation.';

    try {
        let dataset;
        try {
            dataset = await client.readDataset({ datasetName });
            console.log(`Dataset "${datasetName}" already exists. Updating...`);
        } catch {
            dataset = await client.createDataset(datasetName, { description });
            console.log(`Dataset "${datasetName}" created.`);
        }

        // To avoid duplicates if re-running, we might want to clear or check existing examples
        // For prototype simplicity, we just add them. 
        // In real production, we'd use scenario IDs to upsert.

        for (const scenario of scenarios) {
            await client.createExample(scenario.input, scenario.ground_truth, {
                datasetId: dataset.id,
                metadata: {
                    id: scenario.id,
                    name: scenario.name,
                    expected_behavior: scenario.expected_behavior
                }
            });
            console.log(`Uploaded scenario: ${scenario.name}`);
        }

        console.log('Synchronization complete!');
    } catch (error) {
        console.error('Failed to sync dataset:', error);
        process.exit(1);
    }
}

sync();
