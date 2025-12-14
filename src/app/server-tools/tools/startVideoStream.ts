'use server';
import { FunctionDeclaration, SchemaType } from '@google-cloud/vertexai';

export const START_VIDEO_STREAM_TOOL: FunctionDeclaration = {
    name: 'start_video_stream',
    description: `Request to start the video stream for visual inspection of a vehicle component.
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

export interface StartVideoRequest {
    reason: string;
    targetComponent?: string;
    focusArea: 'engine_bay' | 'undercarriage' | 'interior' | 'exterior' | 'specific_component';
}

export interface StartVideoResponse {
    status: 'video_requested' | 'video_active' | 'video_error';
    reason: string;
    targetComponent?: string;
    message: string;
}
