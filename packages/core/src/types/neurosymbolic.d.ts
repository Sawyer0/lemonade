import { z } from 'zod';
export declare const IntuitionSchema: z.ZodObject<{
    hypothesis: z.ZodString;
    confidence: z.ZodNumber;
    reasoning: z.ZodString;
}, "strip", z.ZodTypeAny, {
    confidence: number;
    hypothesis: string;
    reasoning: string;
}, {
    confidence: number;
    hypothesis: string;
    reasoning: string;
}>;
export declare const AuthorityDataSchema: z.ZodObject<{
    vin: z.ZodOptional<z.ZodString>;
    nhtsaRecalls: z.ZodArray<z.ZodString, "many">;
    manualSpecs: z.ZodNullable<z.ZodString>;
    safetyAlerts: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    nhtsaRecalls: string[];
    manualSpecs: string | null;
    safetyAlerts: string[];
    vin?: string | undefined;
}, {
    nhtsaRecalls: string[];
    manualSpecs: string | null;
    safetyAlerts: string[];
    vin?: string | undefined;
}>;
export declare const VisualGroundingSchema: z.ZodObject<{
    engineDescription: z.ZodString;
    isStock: z.ZodBoolean;
    visualConflictDetected: z.ZodBoolean;
    detectedCondition: z.ZodEnum<["clean", "rust", "leak", "broken", "modified", "unknown"]>;
}, "strip", z.ZodTypeAny, {
    engineDescription: string;
    isStock: boolean;
    visualConflictDetected: boolean;
    detectedCondition: "unknown" | "clean" | "rust" | "leak" | "broken" | "modified";
}, {
    engineDescription: string;
    isStock: boolean;
    visualConflictDetected: boolean;
    detectedCondition: "unknown" | "clean" | "rust" | "leak" | "broken" | "modified";
}>;
export declare const ConsensusDataSchema: z.ZodObject<{
    similarCasesFound: z.ZodNumber;
    consensusFix: z.ZodNullable<z.ZodString>;
    isKnownIssue: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    similarCasesFound: number;
    consensusFix: string | null;
    isKnownIssue: boolean;
}, {
    similarCasesFound: number;
    consensusFix: string | null;
    isKnownIssue: boolean;
}>;
export declare const VerificationDataSchema: z.ZodObject<{
    isVerified: z.ZodBoolean;
    verifiedSource: z.ZodNullable<z.ZodString>;
    conflictingEvidence: z.ZodNullable<z.ZodString>;
    searchQueryUsed: z.ZodNullable<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    isVerified: boolean;
    verifiedSource: string | null;
    conflictingEvidence: string | null;
    searchQueryUsed: string | null;
}, {
    isVerified: boolean;
    verifiedSource: string | null;
    conflictingEvidence: string | null;
    searchQueryUsed: string | null;
}>;
export declare const FinalDiagnosisSchema: z.ZodObject<{
    decision: z.ZodEnum<["PROCEED", "STOP_DANGER", "REQUEST_MORE_INFO", "REFER_TO_HUMAN"]>;
    reasoningTrace: z.ZodString;
    userOutput: z.ZodString;
    requiredActions: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    decision: "PROCEED" | "STOP_DANGER" | "REQUEST_MORE_INFO" | "REFER_TO_HUMAN";
    reasoningTrace: string;
    userOutput: string;
    requiredActions: string[];
}, {
    decision: "PROCEED" | "STOP_DANGER" | "REQUEST_MORE_INFO" | "REFER_TO_HUMAN";
    reasoningTrace: string;
    userOutput: string;
    requiredActions: string[];
}>;
export declare const NeurosymbolicStateSchema: z.ZodObject<{
    complaint: z.ZodOptional<z.ZodString>;
    intuition: z.ZodObject<{
        hypothesis: z.ZodString;
        confidence: z.ZodNumber;
        reasoning: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        confidence: number;
        hypothesis: string;
        reasoning: string;
    }, {
        confidence: number;
        hypothesis: string;
        reasoning: string;
    }>;
    authorityData: z.ZodObject<{
        vin: z.ZodOptional<z.ZodString>;
        nhtsaRecalls: z.ZodArray<z.ZodString, "many">;
        manualSpecs: z.ZodNullable<z.ZodString>;
        safetyAlerts: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        nhtsaRecalls: string[];
        manualSpecs: string | null;
        safetyAlerts: string[];
        vin?: string | undefined;
    }, {
        nhtsaRecalls: string[];
        manualSpecs: string | null;
        safetyAlerts: string[];
        vin?: string | undefined;
    }>;
    visualGrounding: z.ZodObject<{
        engineDescription: z.ZodString;
        isStock: z.ZodBoolean;
        visualConflictDetected: z.ZodBoolean;
        detectedCondition: z.ZodEnum<["clean", "rust", "leak", "broken", "modified", "unknown"]>;
    }, "strip", z.ZodTypeAny, {
        engineDescription: string;
        isStock: boolean;
        visualConflictDetected: boolean;
        detectedCondition: "unknown" | "clean" | "rust" | "leak" | "broken" | "modified";
    }, {
        engineDescription: string;
        isStock: boolean;
        visualConflictDetected: boolean;
        detectedCondition: "unknown" | "clean" | "rust" | "leak" | "broken" | "modified";
    }>;
    consensus: z.ZodObject<{
        similarCasesFound: z.ZodNumber;
        consensusFix: z.ZodNullable<z.ZodString>;
        isKnownIssue: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        similarCasesFound: number;
        consensusFix: string | null;
        isKnownIssue: boolean;
    }, {
        similarCasesFound: number;
        consensusFix: string | null;
        isKnownIssue: boolean;
    }>;
    verification: z.ZodObject<{
        isVerified: z.ZodBoolean;
        verifiedSource: z.ZodNullable<z.ZodString>;
        conflictingEvidence: z.ZodNullable<z.ZodString>;
        searchQueryUsed: z.ZodNullable<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        isVerified: boolean;
        verifiedSource: string | null;
        conflictingEvidence: string | null;
        searchQueryUsed: string | null;
    }, {
        isVerified: boolean;
        verifiedSource: string | null;
        conflictingEvidence: string | null;
        searchQueryUsed: string | null;
    }>;
    finalDiagnosis: z.ZodObject<{
        decision: z.ZodEnum<["PROCEED", "STOP_DANGER", "REQUEST_MORE_INFO", "REFER_TO_HUMAN"]>;
        reasoningTrace: z.ZodString;
        userOutput: z.ZodString;
        requiredActions: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        decision: "PROCEED" | "STOP_DANGER" | "REQUEST_MORE_INFO" | "REFER_TO_HUMAN";
        reasoningTrace: string;
        userOutput: string;
        requiredActions: string[];
    }, {
        decision: "PROCEED" | "STOP_DANGER" | "REQUEST_MORE_INFO" | "REFER_TO_HUMAN";
        reasoningTrace: string;
        userOutput: string;
        requiredActions: string[];
    }>;
}, "strip", z.ZodTypeAny, {
    verification: {
        isVerified: boolean;
        verifiedSource: string | null;
        conflictingEvidence: string | null;
        searchQueryUsed: string | null;
    };
    intuition: {
        confidence: number;
        hypothesis: string;
        reasoning: string;
    };
    authorityData: {
        nhtsaRecalls: string[];
        manualSpecs: string | null;
        safetyAlerts: string[];
        vin?: string | undefined;
    };
    visualGrounding: {
        engineDescription: string;
        isStock: boolean;
        visualConflictDetected: boolean;
        detectedCondition: "unknown" | "clean" | "rust" | "leak" | "broken" | "modified";
    };
    consensus: {
        similarCasesFound: number;
        consensusFix: string | null;
        isKnownIssue: boolean;
    };
    finalDiagnosis: {
        decision: "PROCEED" | "STOP_DANGER" | "REQUEST_MORE_INFO" | "REFER_TO_HUMAN";
        reasoningTrace: string;
        userOutput: string;
        requiredActions: string[];
    };
    complaint?: string | undefined;
}, {
    verification: {
        isVerified: boolean;
        verifiedSource: string | null;
        conflictingEvidence: string | null;
        searchQueryUsed: string | null;
    };
    intuition: {
        confidence: number;
        hypothesis: string;
        reasoning: string;
    };
    authorityData: {
        nhtsaRecalls: string[];
        manualSpecs: string | null;
        safetyAlerts: string[];
        vin?: string | undefined;
    };
    visualGrounding: {
        engineDescription: string;
        isStock: boolean;
        visualConflictDetected: boolean;
        detectedCondition: "unknown" | "clean" | "rust" | "leak" | "broken" | "modified";
    };
    consensus: {
        similarCasesFound: number;
        consensusFix: string | null;
        isKnownIssue: boolean;
    };
    finalDiagnosis: {
        decision: "PROCEED" | "STOP_DANGER" | "REQUEST_MORE_INFO" | "REFER_TO_HUMAN";
        reasoningTrace: string;
        userOutput: string;
        requiredActions: string[];
    };
    complaint?: string | undefined;
}>;
export type NeurosymbolicState = z.infer<typeof NeurosymbolicStateSchema>;
export type Intuition = z.infer<typeof IntuitionSchema>;
export type AuthorityData = z.infer<typeof AuthorityDataSchema>;
export type VisualGrounding = z.infer<typeof VisualGroundingSchema>;
export type ConsensusData = z.infer<typeof ConsensusDataSchema>;
export type VerificationData = z.infer<typeof VerificationDataSchema>;
export type FinalDiagnosis = z.infer<typeof FinalDiagnosisSchema>;
