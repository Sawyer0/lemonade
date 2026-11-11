import React from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { GlassView } from 'expo-glass-effect';
import { BRAND_TOKENS } from '@lemonade/core';
import { resolveBrandColorScheme } from '@mobile/constants/brandScheme';
import { useLiquidGlassAvailable } from '@mobile/hooks/use-liquid-glass';

interface GlassCardProps extends ViewProps {
    variant?: 'default' | 'thin';
}

/**
 * Card surface on iOS: real Liquid Glass on iOS 26, the token surface below.
 *
 * The glass tint comes from the brand tokens (primarySoft of the resolved
 * scheme) and the glass renders in the resolved scheme, not the OS scheme —
 * the app forces dark today, so 'auto' would mismatch the rest of the screen.
 * Where glass cannot render, the fallback is the same layout on the token
 * surface with the token border and the card's shadow: same tokens, no glass.
 */
export function GlassCard({ children, style, variant = 'default', ...props }: GlassCardProps) {
    const glassAvailable = useLiquidGlassAvailable();
    const scheme = BRAND_TOKENS[resolveBrandColorScheme()];

    if (!glassAvailable) {
        return (
            <View
                style={[
                    styles.card,
                    variant === 'thin' && styles.thin,
                    styles.fallbackShadow,
                    { backgroundColor: scheme.surface, borderColor: scheme.border },
                    style,
                ]}
                {...props}
            >
                {children}
            </View>
        );
    }

    return (
        <GlassView
            style={[styles.card, variant === 'thin' && styles.thin, { borderColor: scheme.border }, style]}
            glassEffectStyle="regular"
            tintColor={scheme.primarySoft}
            colorScheme={resolveBrandColorScheme()}
            {...props}
        >
            {children}
        </GlassView>
    );
}

const styles = StyleSheet.create({
    card: {
        borderRadius: 16,
        borderWidth: 1,
        padding: 16,
    },
    thin: {
        padding: 12,
        borderRadius: 12,
    },
    fallbackShadow: {
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 4,
        },
        shadowOpacity: 0.3,
        shadowRadius: 4.65,
    },
});
