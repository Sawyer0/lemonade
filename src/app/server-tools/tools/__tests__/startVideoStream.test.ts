import { START_VIDEO_STREAM_TOOL } from '../startVideoStream';

/**
 * start_video_stream Tool Definitions Test
 * 
 * These tests verify the start_video_stream tool definition is correct.
 */

describe('start_video_stream Tool', () => {
    it('should have the correct name', () => {
        expect(START_VIDEO_STREAM_TOOL.name).toBe('start_video_stream');
    });

    it('should have the correct parameters', () => {
        expect(START_VIDEO_STREAM_TOOL.parameters).toBeDefined();
        // @ts-expect-error - testing specific property existence
        expect(START_VIDEO_STREAM_TOOL.parameters.required).toContain('reason');
        // @ts-expect-error - testing specific property existence
        expect(START_VIDEO_STREAM_TOOL.parameters.required).toContain('focusArea');
    });
});

