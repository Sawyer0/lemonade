import { FunctionDeclaration, SchemaType } from '@google-cloud/vertexai';

/**
 * openCamera Tool Definition
 * 
 * This tool is used by Gemini to request camera access for visual inspection
 * of vehicle components during diagnostic sessions.
 */
export const OPEN_CAMERA_TOOL: FunctionDeclaration = {
    name: 'openCamera',
    description: `Request to open the camera for visual inspection of a vehicle component.
Use this tool when you need to see the engine bay, undercarriage, or any specific part to provide accurate diagnostics.
The frontend will handle the camera activation and stream the video feed.`,
    parameters: {
        type: SchemaType.OBJECT,
        properties: {
            reason: {
                type: SchemaType.STRING,
                description: 'The reason for opening the camera (e.g., "Inspect the valve cover for leaks")'
            },
            targetComponent: {
                type: SchemaType.STRING,
                description: 'The specific part to focus on (e.g., "valve cover", "brake caliper", "engine bay")'
            },
            focusArea: {
                type: SchemaType.STRING,
                enum: ['engine_bay', 'undercarriage', 'interior', 'exterior', 'specific_component'],
                description: 'The general area to focus the camera on'
            }
        },
        required: ['reason', 'focusArea']
    }
};

/**
 * Camera Request Interface
 */
export interface CameraRequest {
    reason: string;
    targetComponent?: string;
    focusArea: 'engine_bay' | 'undercarriage' | 'interior' | 'exterior' | 'specific_component';
}

/**
 * Camera Response Interface
 */
export interface CameraResponse {
    status: 'camera_requested' | 'camera_active' | 'camera_error';
    reason: string;
    targetComponent?: string;
    message: string;
}
