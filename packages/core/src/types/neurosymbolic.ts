import { z } from 'zod';

// Node 1: Intuition (System 1)
export const IntuitionSchema = z.object({
    hypothesis: z.string().describe("The initial heuristic diagnosis based on the user's input/visuals."),
    confidence: z.number().min(0).max(1).describe("Confidence score of the initial intuition."),
    reasoning: z.string().describe("Brief explanation of why this intuition was formed."),
    investigationPlan: z.array(z.string()).describe("List of diagnostic steps (To-Do List) to verify the hypothesis.")
});

// Node 3: Authority (The Law)
export const AuthorityDataSchema = z.object({
    vin: z.string().optional(),
    nhtsaRecalls: z.array(z.string()).describe("List of active recalls for this vehicle."),
    manualSpecs: z.string().nullable().describe("Relevant specs extracted from the manual (e.g. Torque)."),
    safetyAlerts: z.array(z.string()).describe("Any additional safety warnings from the manual.")
});

// Node 4: Reality Anchor (Vision)
export const VisualGroundingSchema = z.object({
    engineDescription: z.string().describe("What the engine/part actually looks like."),
    isStock: z.boolean().describe("Does the part look like the OEM factory part for this VIN?"),
    visualConflictDetected: z.boolean().describe("Is there a mismatch between the VIN/Manual and the Visual Reality?"),
    detectedCondition: z.enum(['clean', 'rust', 'leak', 'broken', 'modified', 'unknown']).describe("Physical condition of the component.")
});

// Node 2: Consensus (Vector Search)
export const ConsensusDataSchema = z.object({
    similarCasesFound: z.number().describe("Number of similar cases found in collective memory."),
    consensusFix: z.string().nullable().describe("The most common fix for this symptom in the database."),
    isKnownIssue: z.boolean().describe("Does this match a known pattern?")
});

// Layer 4: External Verification (Web Search)
export const VerificationDataSchema = z.object({
    isVerified: z.boolean().describe("Did external search confirm the hypothesis?"),
    verifiedSource: z.string().nullable().describe("URL or Source that confirmed it."),
    conflictingEvidence: z.string().nullable().describe("If contradicted, what did the search find?"),
    searchQueryUsed: z.string().nullable()
});

// The Verdict (System 2 Decision)
export const FinalDiagnosisSchema = z.object({
    decision: z.enum(['PROCEED', 'STOP_DANGER', 'REQUEST_MORE_INFO', 'REFER_TO_HUMAN']),
    reasoningTrace: z.string().describe("Step-by-step logic explaining how the decision was reached (CoT)."),
    userOutput: z.string().describe("The final helpful response to the user."),
    requiredActions: z.array(z.string()).describe("Specific steps the user must take."),
    metaConfidence: z.number().min(0).max(1).describe("Aggregate confidence score after weighting all 4 layers.")
});

export const NeurosymbolicStateSchema = z.object({
    complaint: z.string().optional(), // Added
    intuition: IntuitionSchema,
    authorityData: AuthorityDataSchema,
    visualGrounding: VisualGroundingSchema,
    consensus: ConsensusDataSchema,
    verification: VerificationDataSchema, // Layer 4
    finalDiagnosis: FinalDiagnosisSchema
});

export type NeurosymbolicState = z.infer<typeof NeurosymbolicStateSchema>;
export type Intuition = z.infer<typeof IntuitionSchema>;
export type AuthorityData = z.infer<typeof AuthorityDataSchema>;
export type VisualGrounding = z.infer<typeof VisualGroundingSchema>;
export type ConsensusData = z.infer<typeof ConsensusDataSchema>;
export type VerificationData = z.infer<typeof VerificationDataSchema>;
export type FinalDiagnosis = z.infer<typeof FinalDiagnosisSchema>;
