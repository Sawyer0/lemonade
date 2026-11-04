import { LocalPerceptionService } from '../LocalPerceptionService';
import { MobileLogger } from '../MobileLogger';
import { PerformanceMonitor } from '../PerformanceMonitor';
import { initLlama } from 'llama.rn';
import * as FileSystem from 'expo-file-system/legacy';

// Explicitly mock llama.rn for Jest
jest.mock('llama.rn', () => ({
    initLlama: jest.fn(() =>
        Promise.resolve({
            completion: jest.fn(() => Promise.resolve({ text: 'part: state' })),
            release: jest.fn(),
        }),
    ),
    LlamaContext: jest.fn(),
}));

// Mock Expo FileSystem
jest.mock('expo-file-system/legacy', () => ({
    writeAsStringAsync: jest.fn(),
    cacheDirectory: 'file:///cache/',
    EncodingType: { Base64: 'base64' },
}));

// Mocks
const mockLogger = {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
} as unknown as MobileLogger;

const mockPerformanceMonitor = {
    getMetrics: jest.fn(() => ({ shouldThrottle: false })),
} as unknown as PerformanceMonitor;

describe('LocalPerceptionService', () => {
    let service: LocalPerceptionService;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new LocalPerceptionService(mockLogger, mockPerformanceMonitor);
    });

    it('should initialize correctly', async () => {
        await service.initialize('file:///model.gguf');
        expect(initLlama).toHaveBeenCalledWith(
            expect.objectContaining({
                model: 'file:///model.gguf',
                n_ctx: 1024,
            }),
        );
        expect(service.isReady()).toBe(true);
    });

    it('should warmup successfully', async () => {
        await service.initialize('file:///model.gguf');
        await service.warmup();
        expect(FileSystem.writeAsStringAsync).toHaveBeenCalled();
        // Check if completion was called on the context
        const context = await (initLlama as jest.Mock).mock.results[0].value;
        expect(context.completion).toHaveBeenCalled();
    });

    it('should triage frame and return semantic results', async () => {
        await service.initialize('file:///model.gguf');

        // Mock completion response with VALID JSON
        const context = await (initLlama as jest.Mock).mock.results[0].value;
        const validJson = JSON.stringify({
            id: { obj: 'Brake Rotor', cat: 'Braking' },
            eval: { stat: 'CRITICAL', risk: true, note: 'Deep surface rust visible' },
        });
        context.completion.mockResolvedValueOnce({
            text: validJson,
            completion_probabilities: [
                { content: '{', probs: [{ tok_str: '{', prob: 0.9 }] },
                { content: 'CRITICAL', probs: [{ tok_str: 'CRITICAL', prob: 0.4 }] },
            ],
        });

        const results = await service.triageFrame('file:///frame.jpg');

        expect(results).toHaveLength(1);
        expect(results[0].confidence).toBeCloseTo(0.6);
        expect(context.completion).toHaveBeenLastCalledWith(expect.objectContaining({ n_probs: 1 }));
        expect(results[0]).toEqual(
            expect.objectContaining({
                id: expect.objectContaining({ obj: 'Brake Rotor' }),
                eval: expect.objectContaining({ risk: true, stat: 'CRITICAL' }),
            }),
        );
    });

    it('should handle invalid JSON by returning UNCERTAIN', async () => {
        await service.initialize('file:///model.gguf');
        const context = await (initLlama as jest.Mock).mock.results[0].value;
        context.completion.mockResolvedValueOnce({ text: 'Not JSON' });

        const results = await service.triageFrame('file:///frame.jpg');
        // We expect one result indicating UNCERTAIN due to parsing error
        expect(results).toHaveLength(1);
        expect(results[0].eval.stat).toBe('UNCERTAIN');
    });

    it('should handle throttling', async () => {
        (mockPerformanceMonitor.getMetrics as jest.Mock).mockReturnValue({ shouldThrottle: true });
        await service.initialize('file:///model.gguf');
        const results = await service.triageFrame('file:///frame.jpg');
        expect(results).toEqual([]);
    });
});
