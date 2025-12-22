
import { LocalPerceptionService } from '../LocalPerceptionService';
import { MobileLogger } from '../MobileLogger';
import { PerformanceMonitor } from '../PerformanceMonitor';
import { initLlama } from 'llama.rn';
import * as FileSystem from 'expo-file-system';

// Mocks are hoisted from jest.setup.js, but we can refine them here if needed
const mockLogger = {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
} as any as MobileLogger;

const mockPerformanceMonitor = {
    getMetrics: jest.fn(() => ({ shouldThrottle: false })),
} as any as PerformanceMonitor;

describe('LocalPerceptionService', () => {
    let service: LocalPerceptionService;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new LocalPerceptionService(mockLogger, mockPerformanceMonitor);
    });

    it('should initialize correctly', async () => {
        await service.initialize('file:///model.gguf');
        expect(initLlama).toHaveBeenCalledWith(expect.objectContaining({
            model: 'file:///model.gguf',
            n_ctx: 1024,
        }));
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

    it('should triage frame and return detections', async () => {
        await service.initialize('file:///model.gguf');

        // Mock completion response
        const context = await (initLlama as jest.Mock).mock.results[0].value;
        context.completion.mockResolvedValueOnce({ text: 'alternator: rust' });

        const detections = await service.triageFrame('file:///frame.jpg');

        expect(detections).toHaveLength(1);
        expect(detections[0]).toEqual(expect.objectContaining({
            objectId: 'alternator',
            state: 'rust',
            confidence: 0.85
        }));
    });

    it('should handle throttling', async () => {
        (mockPerformanceMonitor.getMetrics as jest.Mock).mockReturnValue({ shouldThrottle: true });
        await service.initialize('file:///model.gguf');
        const detections = await service.triageFrame('file:///frame.jpg');
        expect(detections).toEqual([]);
    });
});
