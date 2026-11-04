import React from 'react';
import { render } from '@testing-library/react-native';
import { GhostCard } from '../GhostCard';

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

// Mock GlassCard
jest.mock('../GlassCard.native', () => ({
    GlassCard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
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

    describe('Edge Cases', () => {
        it('renders with empty title', () => {
            const { toJSON } = render(<GhostCard title="" />);
            // Should render without crashing
            expect(toJSON()).toBeTruthy();
        });

        it('renders with whitespace-only title', () => {
            const { toJSON } = render(<GhostCard title="   " />);
            expect(toJSON()).toBeTruthy();
        });

        it('renders with very long title', () => {
            const longTitle = 'A'.repeat(500);
            const { getByText } = render(<GhostCard title={longTitle} />);
            expect(getByText(longTitle)).toBeTruthy();
        });

        it('renders with very long subtitle', () => {
            const longSubtitle = 'B'.repeat(500);
            const { getByText } = render(<GhostCard title="Title" subtitle={longSubtitle} />);
            expect(getByText(longSubtitle)).toBeTruthy();
        });

        it('renders with special characters in title', () => {
            const specialTitle = '🔧 Analyzing <script>alert(1)</script> & "quotes"';
            const { getByText } = render(<GhostCard title={specialTitle} />);
            expect(getByText(specialTitle)).toBeTruthy();
        });

        it('renders with special characters in subtitle', () => {
            const specialSubtitle = 'émojis 🚗 && "special" <chars>';
            const { getByText } = render(<GhostCard title="Title" subtitle={specialSubtitle} />);
            expect(getByText(specialSubtitle)).toBeTruthy();
        });

        it('renders with newlines in title', () => {
            const multilineTitle = 'Line 1\nLine 2\nLine 3';
            const { getByText } = render(<GhostCard title={multilineTitle} />);
            expect(getByText(multilineTitle)).toBeTruthy();
        });

        it('renders without subtitle (optional prop)', () => {
            const { queryByText } = render(<GhostCard title="Title Only" />);
            // Title should be present, subtitle should not
            expect(queryByText('Title Only')).toBeTruthy();
        });

        it('renders with empty subtitle', () => {
            const { toJSON } = render(<GhostCard title="Title" subtitle="" />);
            expect(toJSON()).toBeTruthy();
        });

        it('renders with unicode characters', () => {
            const unicodeTitle = '日本語 中文 العربية';
            const { getByText } = render(<GhostCard title={unicodeTitle} />);
            expect(getByText(unicodeTitle)).toBeTruthy();
        });

        it('renders with RTL text', () => {
            const rtlTitle = 'مرحبا بالعالم';
            const { getByText } = render(<GhostCard title={rtlTitle} />);
            expect(getByText(rtlTitle)).toBeTruthy();
        });
    });

    describe('Animation Initialization', () => {
        it('initializes opacity shared value', () => {
            const { useSharedValue } = require('react-native-reanimated');
            render(<GhostCard title="Test" />);
            expect(useSharedValue).toHaveBeenCalledWith(0.3);
        });

        it('sets up animation effect', () => {
            const { withRepeat } = require('react-native-reanimated');
            render(<GhostCard title="Test" />);
            // Animation functions should be called during setup
            expect(withRepeat).toHaveBeenCalled();
        });

        it('creates animated style', () => {
            const { useAnimatedStyle } = require('react-native-reanimated');
            render(<GhostCard title="Test" />);
            expect(useAnimatedStyle).toHaveBeenCalled();
        });
    });

    describe('Component Structure', () => {
        it('renders skeleton lines', () => {
            const { UNSAFE_root } = render(<GhostCard title="Loading..." />);
            // Component should render without error - skeleton lines are Animated.View
            expect(UNSAFE_root).toBeTruthy();
        });

        it('renders pulse dot', () => {
            const { UNSAFE_root } = render(<GhostCard title="Loading..." />);
            expect(UNSAFE_root).toBeTruthy();
        });
    });

    describe('Prop Types', () => {
        it('handles title as string type only', () => {
            // TypeScript would catch this at compile time, but runtime should still work
            const { getByText } = render(<GhostCard title="Valid String" />);
            expect(getByText('Valid String')).toBeTruthy();
        });

        it('handles subtitle as optional string', () => {
            // With subtitle
            const { rerender, getByText, queryByText } = render(<GhostCard title="Title" subtitle="Subtitle" />);
            expect(getByText('Subtitle')).toBeTruthy();

            // Without subtitle
            rerender(<GhostCard title="Title" />);
            expect(queryByText('Subtitle')).toBeNull();
        });
    });
});
