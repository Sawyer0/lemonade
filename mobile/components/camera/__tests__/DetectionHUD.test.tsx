
import React from 'react';
import { render } from '@testing-library/react-native';
import { DetectionHUD } from '../DetectionHUD';
import { SemanticTriageResult } from '@lemonade/core';

// Mock Reanimated
jest.mock('react-native-reanimated', () => {
    const mockReanimated = require('react-native-reanimated/mock');
    return {
        ...mockReanimated,
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
    const mockResults: SemanticTriageResult[] = [
        {
            id: { obj: 'Brake Rotor', cat: 'Braking' },
            eval: { stat: 'CRITICAL', risk: true, note: 'Severe rust' },
            confidence: 0.9,
            timestamp: Date.now(),
            steadyStrikeCount: 1
        }
    ];

    it('should render nothing when no detections', () => {
        const { toJSON } = render(<DetectionHUD detections={[]} agentState="idle" />);
        expect(toJSON()).toBeNull();
    });

    it('should render locked state (Green) when confidence >= 0.8', () => {
        const { getByText } = render(<DetectionHUD detections={mockResults} agentState="idle" />);
        expect(getByText('BRAKE ROTOR')).toBeTruthy();
        // Expects note to be displayed
        expect(getByText('SEVERE RUST (90%)')).toBeTruthy();
    });

    it('should render searching state (Yellow) when confidence < 0.8', () => {
        const lowConfResults = [{ ...mockResults[0], confidence: 0.5 }];
        const { getByText } = render(<DetectionHUD detections={lowConfResults} agentState="idle" />);
        expect(getByText('BRAKE ROTOR')).toBeTruthy();
    });

    it('should render listening state (Purple) when agentState is listening', () => {
        const { getByText } = render(<DetectionHUD detections={mockResults} agentState="listening" />);
        expect(getByText('LISTENING...')).toBeTruthy();
    });

    it('should render thinking state (Purple) when agentState is thinking', () => {
        const { getByText } = render(<DetectionHUD detections={mockResults} agentState="thinking" />);
        expect(getByText('THINKING...')).toBeTruthy();
    });
});
