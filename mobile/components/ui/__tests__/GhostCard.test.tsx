import React from 'react';
import { render } from '@testing-library/react-native';
import { GhostCard } from '../GhostCard';

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

// Mock GlassCard
jest.mock('../GlassCard.native', () => ({
    GlassCard: ({ children, style }: any) => <>{children}</>
}));

describe('GhostCard', () => {
    it('renders with title', () => {
        const { getByText } = render(<GhostCard title="Analyzing..." />);
        expect(getByText('Analyzing...')).toBeTruthy();
    });

    it('renders with subtitle if provided', () => {
        const { getByText } = render(<GhostCard title="Analyzing..." subtitle="Sending to cloud" />);
        expect(getByText('Sending to cloud')).toBeTruthy();
    });
});
