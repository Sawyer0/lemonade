/// <reference types="vitest/globals" />
export const createMockLogger = () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() });
export const createMockNHTSA = () => ({ checkRecalls: vi.fn().mockResolvedValue([]), validateVin: vi.fn() });
export const createMockEmbedding = () => ({ embed: vi.fn().mockResolvedValue([0.1, 0.1]), embedBatch: vi.fn() });
export const createMockVectorRepo = () => ({ addCase: vi.fn().mockResolvedValue(true), findSimilar: vi.fn().mockResolvedValue([]) });
export const createMockVideoAI = () => ({ analyzeMechanicalVideo: vi.fn().mockResolvedValue({ diagnosis: "Default", confidence: 0.5 }), analyzeManual: vi.fn() });
