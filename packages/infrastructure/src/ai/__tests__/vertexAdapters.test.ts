import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AIAnalysis, ILogger } from '@lemonade/core';
import { AppError } from '@lemonade/core';
import type { IConfigProvider } from '../../interfaces/IConfigProvider';
import type { TracingService } from '../../observability/TracingService';

/**
 * Fakes for the two Google SDKs. Each records how it was constructed and what the
 * adapters sent, and answers with whatever the test queues.
 */
const vertex = vi.hoisted(() => ({
    clients: [] as Array<{ options: Record<string, unknown> }>,
    models: [] as Array<Record<string, unknown>>,
    generateContent: vi.fn(),
    countTokens: vi.fn(),
    caches: {
        create: vi.fn(),
        get: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        list: vi.fn(),
    },
}));

vi.mock('@google-cloud/vertexai', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@google-cloud/vertexai')>();
    class FakeVertexAI {
        readonly preview = { cachedContents: vertex.caches };
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
const { VertexAIVideoAdapter } = await import('../VertexAIVideoAdapter');
const { ContextCacheService } = await import('../ContextCacheService');
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

const tracer = { traceAiCall: ({ exec }: { exec: () => unknown }) => exec() } as unknown as TracingService;

const analysis: AIAnalysis = {
    diagnosis: 'Worn serpentine belt',
    reasoning: 'Squeal on cold start',
    investigationPlan: ['Inspect belt ribs'],
    visual_evidence: ['glazed belt'],
    acoustic_evidence: ['squeal'],
    severity: 'low',
    safety_alert: false,
    suggested_actions: ['Replace belt'],
    engineDescription: 'Front of engine bay',
    isStock: true,
    visualConflictDetected: false,
    detectedCondition: 'unknown',
    confidence: 0.7,
};

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

describe('VertexAIVideoAdapter', () => {
    it('sends the video with its mime type and validates the JSON analysis', async () => {
        const adapter = new VertexAIVideoAdapter(config(), tracer);
        vertex.generateContent.mockResolvedValueOnce(
            modelReply(JSON.stringify(analysis), { groundingMetadata: { webSearchQueries: ['belt squeal'] } }),
        );
        const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

        expect(await adapter.analyzeUploadedVideo('gs://b/v.mov', '2015 Civic', 'video/quicktime')).toEqual(analysis);
        const request = vertex.generateContent.mock.calls[0][0];
        expect(request.contents[0].parts[1]).toEqual({
            fileData: { fileUri: 'gs://b/v.mov', mimeType: 'video/quicktime' },
        });
        log.mockRestore();
    });

    it('defaults image mime type and rejects empty or invalid replies', async () => {
        const adapter = new VertexAIVideoAdapter(config(), tracer);
        const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        vertex.generateContent.mockResolvedValueOnce(modelReply(JSON.stringify(analysis)));
        await adapter.analyzeUploadedImage('gs://b/p', 'ctx');
        expect(vertex.generateContent.mock.calls[0][0].contents[0].parts[1].fileData.mimeType).toBe('image/jpeg');

        vertex.generateContent.mockResolvedValueOnce(modelReply(undefined));
        await expect(adapter.analyzeUploadedVideo('gs://b/v', 'ctx')).rejects.toThrow('empty response');
        vertex.generateContent.mockResolvedValueOnce(modelReply('{"diagnosis": 1}'));
        await expect(adapter.analyzeUploadedImage('gs://b/p', 'ctx')).rejects.toThrow('Invalid JSON');
        err.mockRestore();
    });

    it('counts tokens through the model', async () => {
        vertex.countTokens.mockResolvedValueOnce({ totalTokens: 42 });
        expect(await new VertexAIVideoAdapter(config(), tracer).countTokens('hello')).toBe(42);
    });
});

describe('ContextCacheService', () => {
    it('uses Application Default Credentials without a key and rejects a malformed one', () => {
        new ContextCacheService(logger(), config());
        expect(vertex.clients[0].options.googleAuthOptions).toBeUndefined();
        expect(() => new ContextCacheService(logger(), config('{bad'))).toThrow(AppError);
    });

    it('creates a cache from text and file parts', async () => {
        vertex.caches.create.mockResolvedValueOnce({ name: 'cachedContents/1' });
        const service = new ContextCacheService(logger(), config());
        const name = await service.createCache(
            [{ text: 'manual' }, { fileData: { mimeType: 'video/mp4', fileUri: 'gs://b/v' } }],
            600,
            'session-1',
        );
        expect(name).toBe('cachedContents/1');
        expect(vertex.caches.create.mock.calls[0][0]).toMatchObject({ ttl: '600s', displayName: 'session-1' });
    });

    it('wraps create failures and a missing resource name', async () => {
        const service = new ContextCacheService(logger(), config());
        vertex.caches.create.mockResolvedValueOnce({});
        await expect(service.createCache([{ text: 'x' }])).rejects.toThrow('Context caching failed');
        vertex.caches.create.mockRejectedValueOnce(new Error('quota'));
        await expect(service.createCache([{ text: 'x' }])).rejects.toBeInstanceOf(AppError);
    });

    it('gets, updates, deletes and finds caches by display name', async () => {
        const service = new ContextCacheService(logger(), config());
        vertex.caches.get.mockResolvedValueOnce({ name: 'c/1' });
        expect(await service.getCache('c/1')).toEqual({ name: 'c/1' });

        await service.updateCache('c/1', 120);
        expect(vertex.caches.update).toHaveBeenCalledWith({ name: 'c/1', ttl: '120s' }, ['ttl']);
        await service.deleteCache('c/1');
        expect(vertex.caches.delete).toHaveBeenCalledWith('c/1');

        vertex.caches.list.mockResolvedValueOnce({ cachedContents: [{ name: 'c/2', displayName: 'session-2' }] });
        expect(await service.findCacheByDisplayName('session-2')).toBe('c/2');
        vertex.caches.list.mockResolvedValueOnce([]);
        expect(await service.findCacheByDisplayName('nope')).toBeNull();
        vertex.caches.list.mockRejectedValueOnce(new Error('down'));
        expect(await service.findCacheByDisplayName('x')).toBeNull();
    });

    it('rethrows get, update and delete failures', async () => {
        const service = new ContextCacheService(logger(), config());
        vertex.caches.get.mockRejectedValueOnce(new Error('404'));
        await expect(service.getCache('c/x')).rejects.toThrow('404');
        vertex.caches.update.mockRejectedValueOnce(new Error('denied'));
        await expect(service.updateCache('c/x', 1)).rejects.toThrow('denied');
        vertex.caches.delete.mockRejectedValueOnce(new Error('gone'));
        await expect(service.deleteCache('c/x')).rejects.toThrow('gone');
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
