import { Stack } from 'expo-router';
import { useBrandColors } from '../../hooks/useBrandColors';

export default function GarageLayout() {
    const theme = useBrandColors();
    return (
        <Stack
            screenOptions={{
                headerShown: true,
                headerStyle: { backgroundColor: theme.background },
                headerTintColor: theme.text,
                headerShadowVisible: false,
                headerTitleStyle: {
                    fontWeight: 'bold',
                },
                // freezeOnBlur helps with screen state preservation
                freezeOnBlur: true,
            }}
        />
    );
}
