import { NeurosymbolicState } from '../types/neurosymbolic';
import type { IMultimodalUploadAnalyzer, IChatAssistantAI } from '../interfaces/IAIService';
import type { INHTSAService } from '../interfaces/INHTSAService';
import type { IVectorRepository } from '../interfaces/IVectorRepository';
import type { IGoogleSearchService } from '../interfaces/IGoogleSearchService';
import type { AIAnalysis } from '../types/models';
import type { VerificationRequest, VerificationResponse, SearchRequest, SearchResponse } from '../types/verification';
export interface VisionInput {
    service: IMultimodalUploadAnalyzer;
    data: MechanicContext & {
        searchContext: SearchResponse | undefined;
        verificationContext: VerificationResponse | undefined;
    };
}
export interface NhtsaInput {
    service: INHTSAService;
    data: {
        year: number;
        make: string;
        model: string;
    };
}
export interface VectorInput {
    service: IVectorRepository;
    data: {
        query: string;
        userId: string;
    };
}
export interface SearchInput {
    service: IGoogleSearchService;
    data: SearchRequest;
}
export interface VerificationInput {
    service: IChatAssistantAI;
    data: VerificationRequest;
}
export interface WebInput {
    service: IChatAssistantAI;
    data: VerificationRequest;
}
export interface MechanicInput {
    sessionId: string;
    userId: string;
    vehicleContext: Record<string, unknown>;
    userQuery: string;
    videoUrl?: string;
    services: MechanicServices;
}
export interface MechanicContext extends MechanicInput {
    nhtsaResults: unknown[];
    embeddingInfo: Record<string, unknown>[];
    visualAnalysis?: AIAnalysis;
    searchResults?: SearchResponse;
    verificationResult?: VerificationResponse;
    result?: NeurosymbolicState;
    error?: string;
}
export interface MechanicServices {
    vision: IMultimodalUploadAnalyzer;
    nhtsa: INHTSAService;
    vector: IVectorRepository;
    chat: IChatAssistantAI;
    search: IGoogleSearchService;
}
export type MechanicEvent = {
    type: 'DIAGNOSE';
    userId: string;
    sessionId: string;
    vehicleContext: Record<string, unknown>;
    userQuery: string;
    videoUrl?: string;
} | {
    type: 'REPORT_ERROR';
    error: string;
} | {
    type: 'UPDATE_SERVICES';
    services: MechanicServices;
};
export declare const mechanicMachine: import("xstate").StateMachine<MechanicContext, {
    type: "DIAGNOSE";
    userId: string;
    sessionId: string;
    vehicleContext: Record<string, unknown>;
    userQuery: string;
    videoUrl?: string;
} | {
    type: "REPORT_ERROR";
    error: string;
} | {
    type: "UPDATE_SERVICES";
    services: MechanicServices;
}, {
    [x: string]: import("xstate").ActorRefFromLogic<import("xstate").PromiseActorLogic<{
        diagnosis: string;
        visual_evidence: string[];
        acoustic_evidence: string[];
        severity: "low" | "medium" | "high" | "critical";
        safety_alert: boolean;
        suggested_actions: string[];
        engineDescription: string;
        isStock: boolean;
        visualConflictDetected: boolean;
        detectedCondition: "unknown" | "clean" | "rust" | "leak" | "broken" | "modified";
        confidence: number;
        verification?: {
            isVerified: boolean;
            verifiedSource: string | null;
            conflictingEvidence?: string | null | undefined;
        } | undefined;
    }, VisionInput, import("xstate").EventObject>> | import("xstate").ActorRefFromLogic<import("xstate").PromiseActorLogic<{
        ReportReceivedDate: string;
        Component: string;
        Summary: string;
        Consequence: string;
        Remedy: string;
        Notes: string;
        NHTSACampaignNumber?: string | undefined;
        Manufacturer?: string | undefined;
        parkIt?: boolean | undefined;
        parkOutSide?: boolean | undefined;
        overTheAirUpdate?: boolean | undefined;
        NHTSAActionNumber?: string | undefined;
        ModelYear?: string | undefined;
        Make?: string | undefined;
        Model?: string | undefined;
    }[], NhtsaInput, import("xstate").EventObject>> | import("xstate").ActorRefFromLogic<import("xstate").PromiseActorLogic<{
        id: string;
        createdAt: Date;
        text: string;
        vector: number[];
        metadata: Record<string, any>;
    }[], VectorInput, import("xstate").EventObject>> | import("xstate").ActorRefFromLogic<import("xstate").PromiseActorLogic<{
        results: {
            title: string;
            link: string;
            snippet: string;
            source?: string | undefined;
        }[];
        queryUsed: string;
        totalFound: number;
    }, SearchInput, import("xstate").EventObject>> | import("xstate").ActorRefFromLogic<import("xstate").PromiseActorLogic<{
        isVerified: boolean;
        source: string | null;
        reasoning: string;
    }, VerificationInput, import("xstate").EventObject>> | undefined;
}, {
    src: "visionAnalysis";
    logic: import("xstate").PromiseActorLogic<{
        diagnosis: string;
        visual_evidence: string[];
        acoustic_evidence: string[];
        severity: "low" | "medium" | "high" | "critical";
        safety_alert: boolean;
        suggested_actions: string[];
        engineDescription: string;
        isStock: boolean;
        visualConflictDetected: boolean;
        detectedCondition: "unknown" | "clean" | "rust" | "leak" | "broken" | "modified";
        confidence: number;
        verification?: {
            isVerified: boolean;
            verifiedSource: string | null;
            conflictingEvidence?: string | null | undefined;
        } | undefined;
    }, VisionInput, import("xstate").EventObject>;
    id: string | undefined;
} | {
    src: "nhtsaCheck";
    logic: import("xstate").PromiseActorLogic<{
        ReportReceivedDate: string;
        Component: string;
        Summary: string;
        Consequence: string;
        Remedy: string;
        Notes: string;
        NHTSACampaignNumber?: string | undefined;
        Manufacturer?: string | undefined;
        parkIt?: boolean | undefined;
        parkOutSide?: boolean | undefined;
        overTheAirUpdate?: boolean | undefined;
        NHTSAActionNumber?: string | undefined;
        ModelYear?: string | undefined;
        Make?: string | undefined;
        Model?: string | undefined;
    }[], NhtsaInput, import("xstate").EventObject>;
    id: string | undefined;
} | {
    src: "vectorSearch";
    logic: import("xstate").PromiseActorLogic<{
        id: string;
        createdAt: Date;
        text: string;
        vector: number[];
        metadata: Record<string, any>;
    }[], VectorInput, import("xstate").EventObject>;
    id: string | undefined;
} | {
    src: "googleSearch";
    logic: import("xstate").PromiseActorLogic<{
        results: {
            title: string;
            link: string;
            snippet: string;
            source?: string | undefined;
        }[];
        queryUsed: string;
        totalFound: number;
    }, SearchInput, import("xstate").EventObject>;
    id: string | undefined;
} | {
    src: "webVerification";
    logic: import("xstate").PromiseActorLogic<{
        isVerified: boolean;
        source: string | null;
        reasoning: string;
    }, VerificationInput, import("xstate").EventObject>;
    id: string | undefined;
}, {
    type: "setError";
    params: import("xstate").NonReducibleUnknown;
} | {
    type: "setResult";
    params: import("xstate").NonReducibleUnknown;
}, {
    type: "hasVideo";
    params: unknown;
} | {
    type: "hasRecalls";
    params: unknown;
}, never, "idle" | "vision_verifying" | "synthesizing" | {
    analyzing: {
        verification: "done" | "verifying";
        search: "done" | "querying";
        authority: "done" | "checking";
        memory: "done" | "searching";
    };
}, string, MechanicInput, import("xstate").NonReducibleUnknown, import("xstate").EventObject, import("xstate").MetaObject, {
    id: "mechanic";
    states: {
        readonly idle: {};
        readonly analyzing: {
            states: {
                readonly authority: {
                    states: {
                        readonly checking: {};
                        readonly done: {};
                    };
                };
                readonly memory: {
                    states: {
                        readonly searching: {};
                        readonly done: {};
                    };
                };
                readonly search: {
                    states: {
                        readonly querying: {};
                        readonly done: {};
                    };
                };
                readonly verification: {
                    states: {
                        readonly verifying: {};
                        readonly done: {};
                    };
                };
            };
        };
        readonly vision_verifying: {};
        readonly synthesizing: {};
    };
}>;
