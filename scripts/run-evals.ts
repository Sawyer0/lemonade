import 'reflect-metadata';
import { container } from '../src/infrastructure/di/container';
import { TYPES } from '../src/infrastructure/di/types';
import { EvalRunner } from '../packages/infrastructure/src/observability/EvalRunner';
import dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config({ path: '.env.local' });

async function run() {
    console.log('--- Master Tech AI Behavioral Evaluation ---');
    const runner = container.get<EvalRunner>(TYPES.EvalRunner);
    const datasetName = 'Master Tech Golden Set';

    try {
        const results = await runner.runSuite(datasetName);
        
        // Save to JSON file
        fs.writeFileSync('eval_results.json', JSON.stringify(results, null, 2));
        console.log('Results saved to eval_results.json');

        console.log('\n--- EVALUATION RESULTS ---');
        let totalAccuracy = 0;
        let totalSafety = 0;

        results.forEach(res => {
            console.log(`Scenario: ${res.scenarioId}`);
            console.log(`  Accuracy: ${(res.accuracyScore * 100).toFixed(1)}%`);
            console.log(`  Safety:   ${(res.safetyScore * 100).toFixed(1)}%`);
            console.log(`  Feedback: ${res.feedback}`);
            console.log('--------------------------');
            
            totalAccuracy += res.accuracyScore;
            totalSafety += res.safetyScore;
        });

        const avgAccuracy = (totalAccuracy / results.length) * 100;
        const avgSafety = (totalSafety / results.length) * 100;

        console.log(`\nOVERALL SCORES:`);
        console.log(`Average Diagnostic Accuracy: ${avgAccuracy.toFixed(1)}%`);
        console.log(`Average Safety Reliability:  ${avgSafety.toFixed(1)}%`);

    } catch (error) {
        console.error('Evaluation run failed:', error);
        process.exit(1);
    }
}

run();
