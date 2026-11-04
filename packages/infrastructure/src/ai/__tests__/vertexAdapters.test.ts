import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ILogger } from '@lemonade/core';
import { AppError } from '@lemonade/core';
import type { IConfigProvider } from '../../interfaces/IConfigProvider';

/**
 * Fakes for the two Google SDKs. Each records how it was constructed and what the
 * adapters sent, and answers with whatever the test queues.
 */
const vertex = vi.hoisted(() => ({
    clients: [] as Array<{ options: Record<string, unknown> }>,
    models: [] as Array<Record<string, unknown>>,
    generateContent: vi.fn(),
    countTokens: vi.fn(),
}));

vi.mock('@google-cloud/vertexai', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@google-cloud/vertexai')>();
    class FakeVertexAI {
        constructor(readonly options: Record<string, unknown>) {
            vertex.clients.push(this);
        }
        getGenerativeModel(params: Record<string, unknown>) {
            vertex.models.push(params);
            return { generateContent: vertex.generateContent, countTokens: vertex.countTokens };
        }
    }
    return { ...actual, VertexAI: FakeVertexAI };
});

const genai = vi.hoisted(() => ({ options: [] as unknown[], embedContent: vi.fn() }));
vi.mock('@google/genai', () => ({
    GoogleGenAI: class {
        readonly models = { embedContent: genai.embedContent };
        constructor(options: unknown) {
            genai.options.push(options);
        }
    },
}));

const { GeminiCoreAdapter } = await import('../GeminiCoreAdapter');
const { VertexAISafetyAdapter } = await import('../VertexAISafetyAdapter');
const { EmbeddingService, EMBEDDING_DIMENSIONS } = await import('../EmbeddingService');

const SERVICE_ACCOUNT = JSON.stringify({ client_email: 'svc@example.iam.gserviceaccount.com', private_key: 'k' });

function config(serviceAccountKey = ''): IConfigProvider {
    return {
        getGoogleCloudConfig: () => ({ projectId: 'demo-project', location: 'us-east1', apiKey: '' }),
        getFirebaseConfig: () => ({ serviceAccountKey }) as ReturnType<IConfigProvider['getFirebaseConfig']>,
        getGeminiModel: () => 'gemini-test',
    } as unknown as IConfigProvider;
}

function logger(): ILogger {
    return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as ILogger;
}

function modelReply(text: string | undefined, extra: Record<string, unknown> = {}) {
    return { response: { candidates: [{ content: { parts: [{ text }] }, ...extra }] } };
}

beforeEach(() => {
    vi.clearAllMocks();
    vertex.clients.length = 0;
    vertex.models.length = 0;
    genai.options.length = 0;
});

describe('GeminiCoreAdapter', () => {
    it('uses Application Default Credentials when no service account key is set', () => {
        new GeminiCoreAdapter(logger(), config());
        expect(vertex.clients[0].options).toEqual({
            project: 'demo-project',
            location: 'us-east1',
            googleAuthOptions: undefined,
        });
    });

    it('passes an explicit service account key through', () => {
        new GeminiCoreAdapter(logger(), config(SERVICE_ACCOUNT));
        expect(vertex.clients[0].options.googleAuthOptions).toEqual({ credentials: JSON.parse(SERVICE_ACCOUNT) });
    });

    it('fails with an AppError on a malformed key', () => {
        expect(() => new GeminiCoreAdapter(logger(), config('{not json'))).toThrow(AppError);
    });

    it('builds models with the shared tools and safety settings unless overridden', () => {
        const core = new GeminiCoreAdapter(logger(), config());
        core.getGenerativeModel('gemini-x');
        expect(vertex.models[0]).toMatchObject({
            model: 'gemini-x',
            tools: core.commonTools,
            safetySettings: core.commonSafetySettings,
        });
        const names = core.commonTools[0].functionDeclarations?.map((f) => f.name);
        expect(names).toContain('verify_safe_support');

        core.getGenerativeModel('gemini-y', [], []);
        expect(vertex.models[1]).toMatchObject({ model: 'gemini-y', tools: [], safetySettings: [] });
    });
});

describe('VertexAISafetyAdapter', () => {
    it('returns the model text, or an empty string when there is none', async () => {
        const adapter = new VertexAISafetyAdapter(config());
        expect(vertex.models[0]).toMatchObject({ model: 'gemini-test' });

        vertex.generateContent.mockResolvedValueOnce(modelReply('{"is_safe":true}'));
        expect(await adapter.assessSafety('is this safe?')).toBe('{"is_safe":true}');
        vertex.generateContent.mockResolvedValueOnce(modelReply(undefined));
        expect(await adapter.assessSafety('again')).toBe('');
    });
});

describe('EmbeddingService', () => {
    it('targets Vertex AI with ADC or an explicit key', () => {
        new EmbeddingService(logger(), config());
        new EmbeddingService(logger(), config(SERVICE_ACCOUNT));
        expect(genai.options[0]).toEqual({
            vertexai: true,
            project: 'demo-project',
            location: 'us-east1',
            googleAuthOptions: undefined,
        });
        expect(genai.options[1]).toMatchObject({ googleAuthOptions: { credentials: JSON.parse(SERVICE_ACCOUNT) } });
    });

    it('embeds a query and a document batch with the matching task types', async () => {
        const service = new EmbeddingService(logger(), config());
        genai.embedContent.mockResolvedValueOnce({ embeddings: [{ values: [0.1, 0.2] }] });
        expect(await service.embed('brake squeal')).toEqual([0.1, 0.2]);
        expect(genai.embedContent.mock.calls[0][0]).toMatchObject({
            contents: ['brake squeal'],
            config: { taskType: 'RETRIEVAL_QUERY', outputDimensionality: EMBEDDING_DIMENSIONS },
        });

        genai.embedContent.mockResolvedValueOnce({ embeddings: [{ values: [1] }, { values: [2] }] });
        expect(await service.embedBatch(['a', 'b'])).toEqual([[1], [2]]);
        expect(genai.embedContent.mock.calls[1][0].config.taskType).toBe('RETRIEVAL_DOCUMENT');
        expect(await service.embedBatch([])).toEqual([]);
        expect(genai.embedContent).toHaveBeenCalledTimes(2);
    });

    it('raises an AppError on failures and incomplete replies', async () => {
        const service = new EmbeddingService(logger(), config());
        genai.embedContent.mockRejectedValueOnce(new Error('quota'));
        await expect(service.embed('x')).rejects.toBeInstanceOf(AppError);
        genai.embedContent.mockResolvedValueOnce({ embeddings: [{ values: [1] }] });
        await expect(service.embedBatch(['a', 'b'])).rejects.toThrow('Failed to generate embeddings');
        genai.embedContent.mockResolvedValueOnce({ embeddings: [{}] });
        await expect(service.embed('x')).rejects.toBeInstanceOf(AppError);
    });
});
