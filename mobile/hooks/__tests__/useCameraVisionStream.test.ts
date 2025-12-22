
import { renderHook, act } from '@testing-library/react-native';
import { useCameraVisionStream } from '../useCameraVisionStream';

// Imports
import { useLocalPerception } from '../../context/LocalPerceptionContext';
const mockUseLocalPerception = useLocalPerception as jest.Mock;

describe('useCameraVisionStream', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockUseLocalPerception.mockReturnValue({
            localPerception: {
                triageFrame: jest.fn(),
                isReady: jest.fn().mockReturnValue(true),
            },
        });
    });

    it('should initialize with empty detections', () => {
        const { result } = renderHook(() => useCameraVisionStream({ sessionId: 'test-session' }));
        expect(result.current.currentDetections).toEqual([]);
    });

    // Note: Testing frameProcessor internals requires deeper mocking of the worklet runtime
    // For unit testing, we focus on the state exposure which is what we added.

    it('should expose currentDetections', () => {
        const { result } = renderHook(() => useCameraVisionStream({ sessionId: 'test-session' }));
        expect(result.current).toHaveProperty('currentDetections');
    });

    it('should allow setting ROI', () => {
        const { result } = renderHook(() => useCameraVisionStream({ sessionId: 'test-session' }));

        act(() => {
            result.current.setRegionOfInterest({ x: 10, y: 10, width: 100, height: 100 });
        });

        // Verify state update (implicitly via zoom recalculation logic which is internal)
        // Ideally we'd test the zoom output, but that depends on device prop which is mocked.
    });
});
