import React from 'react';
import { StyleSheet, type ViewProps } from 'react-native';
import { Card } from 'react-native-paper';

/**
 * Android (Material 3) card. Same props as the shared GlassCard; on
 * Android it renders a Paper Card themed from the brand tokens. The
 * `thin` variant maps to the outlined card with tighter padding.
 */
interface GlassCardProps extends ViewProps {
    variant?: 'default' | 'thin';
}

export function GlassCard({ children, style, variant = 'default', ...props }: GlassCardProps) {
    return (
        <Card
            mode={variant === 'thin' ? 'outlined' : 'elevated'}
            style={[variant === 'thin' ? styles.thin : styles.card, style]}
            {...props}
        >
            {children}
        </Card>
    );
}

const styles = StyleSheet.create({
    card: {
        padding: 16,
        borderRadius: 16,
    },
    thin: {
        padding: 12,
        borderRadius: 12,
    },
});
