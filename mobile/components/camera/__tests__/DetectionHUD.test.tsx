
import React from 'react';
import { render } from '@testing-library/react-native';
import { DetectionHUD } from '../DetectionHUD';
import { LocalDetection } from '@lemonade/core';

// Mock Reanimated
jest.mock('react-native-reanimated', () => {
    const Reanimated = require('react-native-reanimated/mock');
    Reanimated.default.call = () => { };
    return {
        ...Reanimated,
        useSharedValue: jest.fn(() => ({ value: 0 })),
        useAnimatedStyle: jest.fn(() => ({})),
        withRepeat: jest.fn(),
        withSequence: jest.fn(),
        withTiming: jest.fn(),
        Easing: {
            inOut: jest.fn(),
            ease: jest.fn(),
        },
    };
});

describe('DetectionHUD', () => {
    const mockDetections: LocalDetection[] = [
        { objectId: 'rust', confidence: 0.9, bbox: [0, 0, 100, 100], state: 'severe', lastSeen: Date.now(), steadyStrikeCount: 1 }
    ];

    it('should render nothing when no detections', () => {
        const { toJSON } = render(<DetectionHUD detections={[]} agentState="idle" />);
        expect(toJSON()).toBeNull();
    });

    it('should render locked state (Green) when confidence >= 0.8', () => {
        const { getByText } = render(<DetectionHUD detections={mockDetections} agentState="idle" />);
        expect(getByText('RUST')).toBeTruthy();
        expect(getByText('SEVERE (90%)')).toBeTruthy();
    });

    it('should render searching state (Yellow) when confidence < 0.8', () => {
        const lowConfDetections = [{ ...mockDetections[0], confidence: 0.5 }];
        const { getByText } = render(<DetectionHUD detections={lowConfDetections} agentState="idle" />);
        expect(getByText('RUST')).toBeTruthy();
        // Visual style check would require snapshot or style inspection
    });

    it('should render listening state (Purple) when agentState is listening', () => {
        const { getByText } = render(<DetectionHUD detections={mockDetections} agentState="listening" />);
        expect(getByText('LISTENING...')).toBeTruthy();
    });

    it('should render thinking state (Purple) when agentState is thinking', () => {
        const { getByText } = render(<DetectionHUD detections={mockDetections} agentState="thinking" />);
        expect(getByText('THINKING...')).toBeTruthy();
    });
});
