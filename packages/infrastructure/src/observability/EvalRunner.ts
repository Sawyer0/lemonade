import { injectable, inject } from 'inversify';
import { Client } from 'langsmith';
import { TYPES } from '../di/types';
import type { IConfigProvider } from '../interfaces/IConfigProvider';
import type { ILogger, IMechanicReasoningService, EvalScenario, EvalResult } from '@lemonade/core';
import { SafetyEvaluator, ReasoningEvaluator } from './EvalGraders';

@injectable()
export class EvalRunner {
    private client: Client;
    private reasoningEvaluator: ReasoningEvaluator;

    constructor(
        @inject(TYPES.ConfigProvider) private config: IConfigProvider,
        @inject(TYPES.MechanicReasoningService) private mechanicReasoning: IMechanicReasoningService,
        @inject(TYPES.Logger) private logger: ILogger,
    ) {
        this.client = new Client();
        this.reasoningEvaluator = new ReasoningEvaluator(config);
    }

    async runSuite(datasetName: string): Promise<EvalResult[]> {
        this.logger.info(`Starting evaluation suite: ${datasetName}`);

        try {
            const examples = this.client.listExamples({ datasetName });
            const results: EvalResult[] = [];

            for await (const example of examples) {
                const metadata = (example as unknown as { metadata: Record<string, unknown> }).metadata || {};
                const scenario = {
                    id: (metadata.id as string) || example.id,
                    name: (metadata.name as string) || 'Unnamed Scenario',
                    input: example.inputs,
                    ground_truth: example.outputs,
                    expected_behavior: metadata.expected_behavior as string,
                } as unknown as EvalScenario;

                this.logger.info(`Running scenario: ${scenario.name}`);

                const diagnosisResult = await this.mechanicReasoning.diagnose(scenario.input);

                const safetyEval = SafetyEvaluator.evaluate(scenario, diagnosisResult);
                const reasoningEval = await this.reasoningEvaluator.evaluate(scenario, diagnosisResult);

                results.push({
                    scenarioId: scenario.id,
                    accuracyScore: reasoningEval.score,
                    safetyScore: safetyEval.score,
                    feedback: `Safety: ${safetyEval.feedback} | Reasoning: ${reasoningEval.feedback}`,
                });
            }

            return results;
        } catch (error) {
            this.logger.error(`Failed to run evaluation suite: ${datasetName}`, error as Error);
            throw error;
        }
    }

    async createDataset(name: string, description: string, scenarios: EvalScenario[]) {
        try {
            const dataset = await this.client.createDataset(name, { description });
            for (const scenario of scenarios) {
                await this.client.createExample(scenario, scenario.ground_truth, {
                    datasetId: dataset.id,
                });
            }
            this.logger.info(`Dataset created successfully: ${name}`);
        } catch (error) {
            this.logger.error(`Failed to create dataset: ${name}`, error as Error);
            throw error;
        }
    }
}
