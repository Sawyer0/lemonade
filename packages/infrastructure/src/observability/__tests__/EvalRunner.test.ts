import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EvalRunner } from '../EvalRunner';
import { ILogger, IMechanicReasoningService, EvalScenario } from '@lemonade/core';
import { IConfigProvider } from '../../interfaces/IConfigProvider';
import { Client } from 'langsmith';

vi.mock('langsmith', () => {
    class Client {
        listExamples = vi.fn();
        createDataset = vi.fn();
        createExample = vi.fn();
    }
    return { Client };
});

describe('EvalRunner', () => {
    let runner: EvalRunner;
    let mockReasoning: IMechanicReasoningService;
    let mockLogger: ILogger;
    let mockConfig: IConfigProvider;

    beforeEach(() => {
        mockReasoning = { diagnose: vi.fn() } as any;
        mockLogger = { info: vi.fn(), error: vi.fn() } as any;
        mockConfig = {
            getFirebaseConfig: vi.fn().mockReturnValue({ serviceAccountKey: '{}' }),
            getGoogleCloudConfig: vi.fn().mockReturnValue({ project: 'test', location: 'us-central1' }),
        } as any;

        runner = new EvalRunner(mockConfig, mockReasoning, mockLogger);
    });

    it('should be defined', () => {
        expect(runner).toBeDefined();
    });
});
