import React from 'react';
import { AccessibilityInfo, StyleSheet, Text } from 'react-native';
import { render, waitFor } from '@testing-library/react-native';
import { BRAND_TOKENS } from '@lemonade/core';
import { GlassCard } from '../GlassCard';

jest.mock('expo-glass-effect', () => {
    const React = require('react');
    const { View } = require('react-native');
    return {
        GlassView: (props: Record<string, unknown>) => <View testID="glass-view" {...props} />,
        isLiquidGlassAvailable: jest.fn(),
        isGlassEffectAPIAvailable: jest.fn(),
    };
});

// GlassCard resolves its scheme from the OS preference when no provider
// wraps it; pin that preference to dark so the tint assertions exercise
// the dark scheme.
jest.mock('@mobile/hooks/use-color-scheme', () => ({
    useColorScheme: () => 'dark',
}));

const glassEffect = require('expo-glass-effect') as {
    isLiquidGlassAvailable: jest.Mock;
    isGlassEffectAPIAvailable: jest.Mock;
};

describe('GlassCard (iOS)', () => {
    beforeEach(() => {
        jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockResolvedValue(false);
        glassEffect.isLiquidGlassAvailable.mockReturnValue(true);
        glassEffect.isGlassEffectAPIAvailable.mockReturnValue(true);
    });

    afterEach(() => {
        jest.restoreAllMocks();
        jest.clearAllMocks();
    });

    it('renders real glass tinted from the brand tokens when glass is available', async () => {
        const { getByTestId } = render(
            <GlassCard>
                <></>
            </GlassCard>,
        );

        await waitFor(() => expect(getByTestId('glass-view')).toBeTruthy());
        const glass = getByTestId('glass-view');
        expect(glass.props.tintColor).toBe(BRAND_TOKENS.dark.primarySoft);
        expect(glass.props.colorScheme).toBe('dark');
        expect(glass.props.glassEffectStyle).toBe('regular');
    });

    it('renders the fallback on the first frame before the probe resolves', () => {
        const { queryByTestId, unmount } = render(
            <GlassCard>
                <></>
            </GlassCard>,
        );

        expect(queryByTestId('glass-view')).toBeNull();
        // Unmount so the probe resolving after the test ends cannot set state
        // outside act() and print a warning.
        unmount();
    });

    it('renders glass on the first frame when the Reduce Transparency probe API is absent', () => {
        // jest.replaceProperty refuses function-valued properties, so hide the
        // probe with defineProperty and restore the beforeEach spy by hand.
        const descriptor = Object.getOwnPropertyDescriptor(AccessibilityInfo, 'isReduceTransparencyEnabled');
        Object.defineProperty(AccessibilityInfo, 'isReduceTransparencyEnabled', {
            value: undefined,
            configurable: true,
        });
        const { getByTestId } = render(
            <GlassCard>
                <></>
            </GlassCard>,
        );

        // The effect already ran inside render, so restoring the probe cannot
        // change the already-resolved initial state.
        if (descriptor) {
            Object.defineProperty(AccessibilityInfo, 'isReduceTransparencyEnabled', descriptor);
        }
        expect(getByTestId('glass-view')).toBeTruthy();
    });

    it('renders the fallback surface when Liquid Glass is unavailable', async () => {
        glassEffect.isLiquidGlassAvailable.mockReturnValue(false);
        const { getByText, queryByTestId } = render(
            <GlassCard>
                <Text>Fallback content</Text>
            </GlassCard>,
        );

        await waitFor(() => expect(getByText('Fallback content')).toBeTruthy());
        expect(queryByTestId('glass-view')).toBeNull();
    });

    it('renders the fallback surface when the glass API is unavailable', async () => {
        glassEffect.isGlassEffectAPIAvailable.mockReturnValue(false);
        const { getByText, queryByTestId } = render(
            <GlassCard>
                <Text>Fallback content</Text>
            </GlassCard>,
        );

        await waitFor(() => expect(getByText('Fallback content')).toBeTruthy());
        expect(queryByTestId('glass-view')).toBeNull();
    });

    it('renders the fallback surface when Reduce Transparency is on', async () => {
        jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockResolvedValue(true);
        const { getByText, queryByTestId } = render(
            <GlassCard>
                <Text>Fallback content</Text>
            </GlassCard>,
        );

        await waitFor(() => expect(getByText('Fallback content')).toBeTruthy());
        expect(queryByTestId('glass-view')).toBeNull();
    });

    it('applies the thin variant radii and padding on the glass surface', async () => {
        const { getByTestId } = render(
            <GlassCard variant="thin">
                <></>
            </GlassCard>,
        );

        await waitFor(() => expect(getByTestId('glass-view')).toBeTruthy());
        const flat = StyleSheet.flatten(getByTestId('glass-view').props.style);
        expect(flat.borderRadius).toBe(12);
        expect(flat.padding).toBe(12);
    });

    it('applies the default variant radii and padding on the glass surface', async () => {
        const { getByTestId } = render(
            <GlassCard>
                <></>
            </GlassCard>,
        );

        await waitFor(() => expect(getByTestId('glass-view')).toBeTruthy());
        const flat = StyleSheet.flatten(getByTestId('glass-view').props.style);
        expect(flat.borderRadius).toBe(16);
        expect(flat.padding).toBe(16);
    });
});
