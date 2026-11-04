import {
    IMultimodalUploadAnalyzer,
    IChatAssistantAI,
    INHTSAService,
    IVectorRepository,
    IGoogleSearchService,
    IMemoryService,
    AIAnalysis,
    MessagePart,
    VerificationRequest,
    VerificationResponse,
    SafetyRecall,
    SearchRequest,
    SearchResponse,
    MemorySearchOptions,
    MemorySearchResult,
    MemoryDocument,
    StreamingEvent,
    VehicleSpecs,
    VectorDocument,
    SimilarCase,
    ReasoningEffort,
} from '@lemonade/core';
import { CONFIG } from '../constants/config';

// --- Vision Adapter ---
export class MobileVisionAdapter implements IMultimodalUploadAnalyzer {
    async analyzeUploadedVideo(
        videoUrl: string,
        vehicleContext: string,
        mimeType?: string,
        _userId?: string,
        sessionId?: string,
        _reasoningEffort?: ReasoningEffort,
        videoDurationMinutes?: number,
    ): Promise<AIAnalysis> {
        if (!sessionId) {
            // Fallback if no session provided (shouldn't happen in normal flow)
            return this.getPendingAnalysis();
        }

        try {
            await fetch(`${CONFIG.API.BASE_URL}/api/analysis/trigger`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId,
                    publicUrl: videoUrl,
                    videoDurationMinutes: videoDurationMinutes || 1, // Use passed value or fallback
                    vehicleContext,
                    mimeType: mimeType || 'video/mp4',
                }),
            });

            // Return pending state as analysis is async
            return this.getPendingAnalysis();
        } catch (e) {
            console.error('[MobileVisionAdapter] Analysis trigger failed', e);
            return this.getPendingAnalysis('Analysis trigger failed');
        }
    }

    private getPendingAnalysis(reason: string = 'Mobile agent waits for server-side vision analysis.'): AIAnalysis {
        return {
            diagnosis: 'Analysis pending server response',
            reasoning: reason,
            investigationPlan: [],
            visual_evidence: [],
            acoustic_evidence: [],
            severity: 'low',
            safety_alert: false,
            suggested_actions: [],
            engineDescription: 'N/A',
            isStock: true,
            visualConflictDetected: false,
            detectedCondition: 'unknown',
            confidence: 0,
        };
    }

    async analyzeUploadedImage(imageUrl: string, _vehicleContext: string): Promise<AIAnalysis> {
        console.warn('[MobileVisionAdapter] analyzeUploadedImage delegated to server', imageUrl);
        return {
            diagnosis: 'Analysis pending server response',
            reasoning: '',
            investigationPlan: [],
            visual_evidence: [],
            acoustic_evidence: [],
            severity: 'low',
            safety_alert: false,
            suggested_actions: [],
            engineDescription: 'N/A',
            isStock: true,
            visualConflictDetected: false,
            detectedCondition: 'unknown',
            confidence: 0,
        };
    }

    async countTokens(content: string | MessagePart[]): Promise<number> {
        console.log('[MobileVisionAdapter] countTokens', typeof content);
        return 0;
    }
}

// --- Chat Adapter ---
export class MobileChatAdapter implements IChatAssistantAI {
    async generateReply(): Promise<string | MessagePart[]> {
        return 'Offline Mode: Chat is delegated to the server.';
    }

    async *generateReplyStream(): AsyncGenerator<StreamingEvent, void, unknown> {
        yield { type: 'text', content: 'Offline Mode: Chat is delegated to the server.' };
        yield { type: 'done' };
    }

    async verifyHypothesis(request: VerificationRequest): Promise<VerificationResponse> {
        console.log('[MobileChatAdapter] verifyHypothesis', request.hypothesis);
        return { isVerified: false, source: null, reasoning: 'Offline verification unavailable' };
    }

    async countTokens(): Promise<number> {
        return 0;
    }
}

// --- NHTSA Adapter (Real API Client) ---
export class MobileNHTSAAdapter implements INHTSAService {
    async checkRecalls(year: number, make: string, model: string): Promise<SafetyRecall[]> {
        try {
            const response = await fetch(
                `${CONFIG.API.BASE_URL}/api/nhtsa/recalls?year=${year}&make=${make}&model=${model}`,
            );
            if (!response.ok) return [];
            return await response.json();
        } catch (e) {
            console.error('[MobileNHTSAAdapter] Failed to fetch recalls', e);
            return [];
        }
    }

    async getVehicleDetails(vin: string): Promise<VehicleSpecs | null> {
        // This endpoint might not exist yet, assuming standard pattern
        try {
            const response = await fetch(`${CONFIG.API.BASE_URL}/api/nhtsa/vin/${vin}`);
            if (!response.ok) return null;
            return await response.json();
        } catch (e) {
            console.error('[MobileNHTSAAdapter] Failed to fetch VIN details', e);
            return null;
        }
    }

    async validateVin(vin: string): Promise<boolean> {
        // Standard VIN regex: 17 chars, alphanumeric, excluding I, O, Q
        return /^[A-HJ-NPR-Z0-9]{17}$/.test(vin);
    }
}

// --- Vector Adapter ---
export class MobileVectorAdapter implements IVectorRepository {
    async search(query: string, limit?: number, filter?: Record<string, unknown>): Promise<VectorDocument[]> {
        try {
            const response = await fetch(`${CONFIG.API.BASE_URL}/api/vector`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'search',
                    query,
                    limit,
                    filter,
                }),
            });
            if (!response.ok) return [];
            const data = await response.json();
            return data.results || [];
        } catch (e) {
            console.error('[MobileVectorAdapter] Search failed', e);
            return [];
        }
    }

    async findSimilar(vector: number[], limit?: number, filter?: { userId?: string }): Promise<SimilarCase[]> {
        try {
            const response = await fetch(`${CONFIG.API.BASE_URL}/api/vector`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'findSimilar',
                    vector,
                    limit,
                    filter,
                }),
            });
            if (!response.ok) return [];
            const data = await response.json();
            return data.results || [];
        } catch (e) {
            console.error('[MobileVectorAdapter] Find similar failed', e);
            return [];
        }
    }

    async addCase(text: string, vector: number[], metadata?: Record<string, unknown>): Promise<void> {
        try {
            await fetch(`${CONFIG.API.BASE_URL}/api/vector`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'addCase',
                    text,
                    vector,
                    metadata,
                }),
            });
        } catch (e) {
            console.error('[MobileVectorAdapter] Add case failed', e);
        }
    }
}

// --- Search Adapter ---
export class MobileSearchAdapter implements IGoogleSearchService {
    async search(request: SearchRequest): Promise<SearchResponse> {
        try {
            const response = await fetch(`${CONFIG.API.BASE_URL}/api/search`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(request),
            });
            if (!response.ok) {
                return { results: [], queryUsed: request.query, totalFound: 0 };
            }
            return await response.json();
        } catch (e) {
            console.error('[MobileSearchAdapter] Search failed', e);
            return { results: [], queryUsed: request.query, totalFound: 0 };
        }
    }
}

// --- Memory Adapter ---
export class MobileMemoryAdapter implements IMemoryService {
    async addDocument(doc: MemoryDocument, spaceId?: string): Promise<void> {
        try {
            await fetch(`${CONFIG.API.BASE_URL}/api/memory`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'add',
                    doc,
                    spaceId,
                }),
            });
        } catch (e) {
            console.error('[MobileMemoryAdapter] Add document failed', e);
        }
    }

    async search(query: string, options?: MemorySearchOptions): Promise<MemorySearchResult[]> {
        try {
            const response = await fetch(`${CONFIG.API.BASE_URL}/api/memory`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'search',
                    query,
                    options,
                }),
            });
            if (!response.ok) return [];
            const data = await response.json();
            return data.results || [];
        } catch (e) {
            console.error('[MobileMemoryAdapter] Memory search failed', e);
            return [];
        }
    }
}
