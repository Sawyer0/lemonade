import React from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { FAB } from 'react-native-paper';

/**
 * Android (Material 3) floating action button. On Android it renders a
 * Paper FAB themed from the brand tokens; the shared Fab keeps the
 * current custom look on iOS.
 */
interface FabProps {
    onPress: () => void;
    testID?: string;
    accessibilityLabel?: string;
    style?: StyleProp<ViewStyle>;
}

export function Fab({ onPress, testID, accessibilityLabel, style }: FabProps) {
    return (
        <FAB
            icon="plus"
            onPress={onPress}
            testID={testID}
            accessibilityLabel={accessibilityLabel}
            style={[styles.fab, style]}
        />
    );
}

const styles = StyleSheet.create({
    fab: {
        position: 'absolute',
        bottom: 24,
        right: 24,
    },
});
