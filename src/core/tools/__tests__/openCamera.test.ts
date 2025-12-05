import { describe, it, expect } from 'vitest';
import { SchemaType } from '@google-cloud/vertexai';
import { OPEN_CAMERA_TOOL, CameraRequest, CameraResponse } from '../openCamera';

/**
 * These tests verify the openCamera tool definition is correct.
 * 
 * WHAT BUGS WOULD THIS CATCH?
 * - Missing required fields that would cause camera to open without context
 * - Wrong focus areas that don't match frontend camera modes
 * - Missing reason field (critical for safety - we need to know WHY camera is opening)
 */
describe('OPEN_CAMERA_TOOL Definition', () => {
    it('should have the correct tool name', () => {
        expect(OPEN_CAMERA_TOOL.name).toBe('openCamera');
    });

    it('should require reason parameter (safety requirement)', () => {
        // CRITICAL: We must know WHY the camera is being requested
        // This is logged for safety audits
        expect(OPEN_CAMERA_TOOL.parameters?.required).toContain('reason');
    });

    it('should require focusArea parameter', () => {
        // Frontend needs to know which camera mode to activate
        expect(OPEN_CAMERA_TOOL.parameters?.required).toContain('focusArea');
    });

    it('should NOT require targetComponent (optional detail)', () => {
        // targetComponent is extra context, not required
        expect(OPEN_CAMERA_TOOL.parameters?.required).not.toContain('targetComponent');
    });

    it('should have all valid focusArea enum values', () => {
        // These must match frontend camera modes exactly
        const focusAreaProp = OPEN_CAMERA_TOOL.parameters?.properties?.focusArea;
        const expectedAreas = ['engine_bay', 'undercarriage', 'interior', 'exterior', 'specific_component'];
        
        expect(focusAreaProp?.enum).toEqual(expectedAreas);
    });

    it('should have undercarriage as a focus area (safety critical)', () => {
        // SAFETY: undercarriage work requires jack stand verification
        // If this enum is missing, AI can't request undercarriage inspection
        const focusAreaProp = OPEN_CAMERA_TOOL.parameters?.properties?.focusArea;
        expect(focusAreaProp?.enum).toContain('undercarriage');
    });

    it('should have STRING type for reason', () => {
        const reasonProp = OPEN_CAMERA_TOOL.parameters?.properties?.reason;
        expect(reasonProp?.type).toBe(SchemaType.STRING);
    });
});

describe('CameraRequest Interface', () => {
    it('should require reason and focusArea', () => {
        const request: CameraRequest = {
            reason: 'Inspect valve cover for oil leaks',
            focusArea: 'engine_bay'
        };
        
        expect(request.reason).toBeDefined();
        expect(request.focusArea).toBeDefined();
    });

    it('should accept optional targetComponent', () => {
        const request: CameraRequest = {
            reason: 'Check brake pad thickness',
            focusArea: 'specific_component',
            targetComponent: 'front brake caliper'
        };
        
        expect(request.targetComponent).toBe('front brake caliper');
    });

    it('should type-check focusArea values', () => {
        const validAreas: CameraRequest['focusArea'][] = [
            'engine_bay', 'undercarriage', 'interior', 'exterior', 'specific_component'
        ];
        
        validAreas.forEach(area => {
            const request: CameraRequest = { reason: 'test', focusArea: area };
            expect(request.focusArea).toBe(area);
        });
    });
});

describe('CameraResponse Interface', () => {
    it('should have valid status values', () => {
        const validStatuses: CameraResponse['status'][] = [
            'camera_requested', 'camera_active', 'camera_error'
        ];
        
        validStatuses.forEach(status => {
            const response: CameraResponse = {
                status,
                reason: 'test',
                message: 'test message'
            };
            expect(response.status).toBe(status);
        });
    });

    it('should include reason in response (for UI display)', () => {
        const response: CameraResponse = {
            status: 'camera_active',
            reason: 'Inspecting timing belt',
            message: 'Camera activated for timing belt inspection'
        };
        
        // UI needs to show user WHY camera opened
        expect(response.reason).toBeDefined();
        expect(response.message).toBeDefined();
    });
});
