import { Stack } from 'expo-router';
import { Theme } from '../../constants/theme';

export default function GarageLayout() {
    return (
        <Stack
            screenOptions={{
                headerShown: true,
                headerStyle: { backgroundColor: Theme.background },
                headerTintColor: Theme.text,
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
