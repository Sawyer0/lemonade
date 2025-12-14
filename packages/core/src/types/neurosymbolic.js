"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NeurosymbolicStateSchema = exports.FinalDiagnosisSchema = exports.VerificationDataSchema = exports.ConsensusDataSchema = exports.VisualGroundingSchema = exports.AuthorityDataSchema = exports.IntuitionSchema = void 0;
const zod_1 = require("zod");
// Node 1: Intuition (System 1)
exports.IntuitionSchema = zod_1.z.object({
    hypothesis: zod_1.z.string().describe("The initial heuristic diagnosis based on the user's input/visuals."),
    confidence: zod_1.z.number().min(0).max(1).describe("Confidence score of the initial intuition."),
    reasoning: zod_1.z.string().describe("Brief explanation of why this intuition was formed.")
});
// Node 3: Authority (The Law)
exports.AuthorityDataSchema = zod_1.z.object({
    vin: zod_1.z.string().optional(),
    nhtsaRecalls: zod_1.z.array(zod_1.z.string()).describe("List of active recalls for this vehicle."),
    manualSpecs: zod_1.z.string().nullable().describe("Relevant specs extracted from the manual (e.g. Torque)."),
    safetyAlerts: zod_1.z.array(zod_1.z.string()).describe("Any additional safety warnings from the manual.")
});
// Node 4: Reality Anchor (Vision)
exports.VisualGroundingSchema = zod_1.z.object({
    engineDescription: zod_1.z.string().describe("What the engine/part actually looks like."),
    isStock: zod_1.z.boolean().describe("Does the part look like the OEM factory part for this VIN?"),
    visualConflictDetected: zod_1.z.boolean().describe("Is there a mismatch between the VIN/Manual and the Visual Reality?"),
    detectedCondition: zod_1.z.enum(['clean', 'rust', 'leak', 'broken', 'modified', 'unknown']).describe("Physical condition of the component.")
});
// Node 2: Consensus (Vector Search)
exports.ConsensusDataSchema = zod_1.z.object({
    similarCasesFound: zod_1.z.number().describe("Number of similar cases found in collective memory."),
    consensusFix: zod_1.z.string().nullable().describe("The most common fix for this symptom in the database."),
    isKnownIssue: zod_1.z.boolean().describe("Does this match a known pattern?")
});
// Layer 4: External Verification (Web Search)
exports.VerificationDataSchema = zod_1.z.object({
    isVerified: zod_1.z.boolean().describe("Did external search confirm the hypothesis?"),
    verifiedSource: zod_1.z.string().nullable().describe("URL or Source that confirmed it."),
    conflictingEvidence: zod_1.z.string().nullable().describe("If contradicted, what did the search find?"),
    searchQueryUsed: zod_1.z.string().nullable()
});
// The Verdict (System 2 Decision)
exports.FinalDiagnosisSchema = zod_1.z.object({
    decision: zod_1.z.enum(['PROCEED', 'STOP_DANGER', 'REQUEST_MORE_INFO', 'REFER_TO_HUMAN']),
    reasoningTrace: zod_1.z.string().describe("Step-by-step logic explaining how the decision was reached (CoT)."),
    userOutput: zod_1.z.string().describe("The final helpful response to the user."),
    requiredActions: zod_1.z.array(zod_1.z.string()).describe("Specific steps the user must take.")
});
exports.NeurosymbolicStateSchema = zod_1.z.object({
    complaint: zod_1.z.string().optional(), // Added
    intuition: exports.IntuitionSchema,
    authorityData: exports.AuthorityDataSchema,
    visualGrounding: exports.VisualGroundingSchema,
    consensus: exports.ConsensusDataSchema,
    verification: exports.VerificationDataSchema, // Layer 4
    finalDiagnosis: exports.FinalDiagnosisSchema
});
