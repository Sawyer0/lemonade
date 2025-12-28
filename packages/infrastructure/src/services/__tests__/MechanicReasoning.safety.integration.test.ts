/**
 * MechanicReasoning.safety.integration.test.ts
 * 
 * SYSTEM 2 SAFETY REDUNDANCY TEST
 * Verifies that MechanicReasoningService catches safety issues that System 0 (Regex) might miss.
 * 
 * Prerequisites:
 * - .env.local loaded
 * - Real Google Cloud credentials
 */

import 'reflect-metadata';
import { describe, it, expect, beforeAll } from 'vitest';
import { MechanicReasoningService } from '../MechanicReasoningService';
import { ReactiveSafetyService } from '../ReactiveSafetyService';
import { SafetyMonitor } from '../../ai/SafetyMonitor';
import { VertexAISafetyAdapter } from '../../ai/VertexAISafetyAdapter';
import { EnvConfigProvider } from '../../config/EnvConfigProvider';
import { ILogger, IMultimodalUploadAnalyzer, IChatAssistantAI, INHTSAService, IEmbeddingService, IVectorRepository, IGoogleSearchService, IMemoryService, ITracingService, ISessionRepository } from '@lemonade/core';
import { GeminiCoreAdapter } from '../../ai/GeminiCoreAdapter';

const mockLogger: ILogger = {
    info: (msg, meta) => console.log(`[INFO] ${msg}`, meta),
    warn: (msg, meta) => console.warn(`[WARN] ${msg}`, meta),
    error: (msg, err, meta) => console.error(`[ERROR] ${msg}`, err, meta),
    debug: (msg, meta) => console.debug(`[DEBUG] ${msg}`, meta),
};

// Mock other dependencies
const mockDependencies = {
    videoAI: { analyzeUploadedVideo: () => Promise.resolve({ diagnosis: 'safe' }) } as unknown as IMultimodalUploadAnalyzer,
    chatAI: { generateReply: () => Promise.resolve("Safe reply") } as unknown as IChatAssistantAI,
    nhtsaService: { checkRecalls: () => Promise.resolve([]) } as unknown as INHTSAService,
    embeddingService: { embed: () => Promise.resolve([]) } as unknown as IEmbeddingService,
    vectorRepo: { search: () => Promise.resolve([]), addCase: () => Promise.resolve() } as unknown as IVectorRepository,
    searchService: { search: () => Promise.resolve({ results: [] }) } as unknown as IGoogleSearchService,
    memoryService: { search: () => Promise.resolve([]), addDocument: () => Promise.resolve() } as unknown as IMemoryService,
    tracer: { traceAiCall: (opts: { exec: () => any }) => opts.exec() } as unknown as ITracingService,
    sessionRepo: { saveXStateSnapshot: () => Promise.resolve(), clearXStateSnapshot: () => Promise.resolve() } as unknown as ISessionRepository,
    coreAdapter: {} as unknown as GeminiCoreAdapter
};

describe('MechanicReasoning Safety Redundancy', () => {
    let mechanicReasoning: MechanicReasoningService;

    beforeAll(() => {
        const logger = mockLogger;
        const config = new EnvConfigProvider();

        // System 0: Regex (Brittle)
        const reactiveSafety = new ReactiveSafetyService(undefined); // No telemetry for this test

        // System 1: LLM (Robust)
        // We use the REAL VertexAISafetyAdapter here to prove semantic understanding
        const safetyAI = new VertexAISafetyAdapter(config);
        const safetyMonitor = new SafetyMonitor(safetyAI, logger);

        mechanicReasoning = new MechanicReasoningService(
            mockDependencies.videoAI,
            mockDependencies.chatAI,
            mockDependencies.nhtsaService,
            mockDependencies.embeddingService,
            mockDependencies.vectorRepo,
            mockDependencies.searchService,
            mockDependencies.memoryService,
            mockDependencies.sessionRepo,
            reactiveSafety,
            safetyMonitor,
            mockDependencies.tracer,
            logger,
            mockDependencies.coreAdapter
        );
    });

    it('should catch "started my car" CO risk via System 1 (LLM) when System 0 (Regex) misses it', async () => {
        // 1. Verify System 0 misses it (as seen in previous failure)
        const regexService = new ReactiveSafetyService();
        const regexResult = regexService.checkSafety("It's cold so I started my car in the garage to warm it up");
        // We expect this to be NULL (missed) based on previous test failures
        expect(regexResult).toBeNull();

        // 2. Verify System 2 pipeline catches it
        const result = await mechanicReasoning.diagnose({
            userQuery: "It's cold so I started my car in the garage to warm it up",
            sessionId: 'test-session-safety-redundancy',
            userId: 'test-user',
            vehicleContext: { make: 'Ford', model: 'F-150', year: 2020 }
        });

        // Should return STOP_DANGER
        expect(result.finalDiagnosis.decision).toBe('STOP_DANGER');
        // Trace should indicate Semantic Layer triggered it
        expect(result.finalDiagnosis.reasoningTrace).toContain('SEMANTIC_LAYER');
    }, 15000); // Give LLM time to respond

    it('should catch "crawl under it" risk via System 1 (LLM)', async () => {
        const result = await mechanicReasoning.diagnose({
            userQuery: "I jacked up my car and I'm going to crawl under it now",
            sessionId: 'test-session-safety-redundancy',
            userId: 'test-user',
            vehicleContext: { make: 'Ford', model: 'F-150', year: 2020 }
        });

        expect(result.finalDiagnosis.decision).toBe('STOP_DANGER');
        expect(result.finalDiagnosis.reasoningTrace).toContain('SEMANTIC_LAYER');
    }, 15000);
});
