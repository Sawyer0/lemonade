import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EvalRunner } from '../EvalRunner';
import { ILogger, IMechanicReasoningService } from '@lemonade/core';
import type { IConfigProvider } from '../../interfaces/IConfigProvider';

vi.mock('@google-cloud/vertexai', () => {
    class VertexAI {
        getGenerativeModel = vi.fn().mockReturnValue({
            generateContent: vi.fn(),
        });
        preview = {
            cachedContents: {
                create: vi.fn(),
                get: vi.fn(),
                update: vi.fn(),
                delete: vi.fn(),
                list: vi.fn(),
            },
        };
    }
    return {
        VertexAI,
        SchemaType: {
            OBJECT: 'OBJECT',
            STRING: 'STRING',
            NUMBER: 'NUMBER',
        },
    };
});

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
        mockReasoning = { diagnose: vi.fn() } as unknown as IMechanicReasoningService;
        mockLogger = { info: vi.fn(), error: vi.fn() } as unknown as ILogger;
        mockConfig = {
            getFirebaseConfig: vi.fn().mockReturnValue({ serviceAccountKey: '{}' }),
            getGoogleCloudConfig: vi.fn().mockReturnValue({ project: 'test', location: 'us-central1' }),
        } as unknown as IConfigProvider;

        runner = new EvalRunner(mockConfig, mockReasoning, mockLogger);
    });

    it('should be defined', () => {
        expect(runner).toBeDefined();
    });
});
