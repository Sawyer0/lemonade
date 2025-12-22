import { FunctionDeclaration, SchemaType } from '@google-cloud/vertexai';

/**
 * verifySafeSupport Tool Definition
 * 
 * This tool is used by Gemini to analyze camera frames and verify
 * that proper safety equipment is in place before dangerous operations.
 */
export const VERIFY_SAFE_SUPPORT_TOOL: FunctionDeclaration = {
    name: 'verify_safe_support',
    description: `Analyze the current camera frame to verify safety equipment.
Use this tool when the user mentions going under a vehicle, working underneath, or similar dangerous situations.
The tool will capture the current frame and analyze it for jack stands and proper support.`,
    parameters: {
        type: SchemaType.OBJECT,
        properties: {
            reason: {
                type: SchemaType.STRING,
                description: 'Why safety verification is needed (e.g., "User mentioned going under the car")'
            },
            required_equipment: {
                type: SchemaType.ARRAY,
                items: { type: SchemaType.STRING },
                description: 'List of required safety equipment to verify (e.g., ["jack_stands", "wheel_chocks"])'
            }
        },
        required: ['reason']
    }
};

/**
 * Safety Verification Result Interface
 */
export interface SafetyVerificationResult {
    safe: boolean;
    confidence: number;
    detected_equipment: string[];
    concerns: string[];
    recommendation: string;
}

/**
 * Tool Response Interface
 */
export interface VerifySafeSupportResponse {
    tool_call_id: string;
    result: SafetyVerificationResult;
}
