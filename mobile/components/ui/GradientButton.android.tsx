import React from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Button } from 'react-native-paper';

/**
 * Android (Material 3) button. Same props as the shared GradientButton;
 * on Android it renders a Paper Button themed from the brand tokens.
 * The custom gradient is gone on Android — the filled primary is the
 * Material 3 contained button. The icon is a render function because
 * Paper's IconSource takes custom elements that way.
 */
interface GradientButtonProps {
    title: string;
    icon?: React.ReactNode;
    loading?: boolean;
    variant?: 'primary' | 'outline' | 'ghost';
    style?: StyleProp<ViewStyle>;
    disabled?: boolean;
    onPress?: () => void;
    testID?: string;
    accessibilityLabel?: string;
}

const MODE: Record<NonNullable<GradientButtonProps['variant']>, 'contained' | 'outlined' | 'text'> = {
    primary: 'contained',
    outline: 'outlined',
    ghost: 'text',
};

export function GradientButton({
    title,
    icon,
    loading,
    variant = 'primary',
    style,
    disabled,
    onPress,
    testID,
    accessibilityLabel,
}: GradientButtonProps) {
    const iconSource: React.ComponentProps<typeof Button>['icon'] = React.isValidElement(icon)
        ? ({ size, color }: { size: number; color: string }) =>
              React.cloneElement(icon as React.ReactElement<{ size?: number; color?: string }>, { size, color })
        : undefined;
    return (
        <Button
            mode={MODE[variant]}
            onPress={onPress}
            disabled={disabled}
            loading={loading}
            icon={iconSource}
            testID={testID}
            accessibilityLabel={accessibilityLabel}
            style={[styles.button, style]}
            contentStyle={styles.content}
        >
            {title}
        </Button>
    );
}

const styles = StyleSheet.create({
    button: {
        borderRadius: 12,
    },
    content: {
        paddingVertical: 12,
        paddingHorizontal: 24,
    },
});
