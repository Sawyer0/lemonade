import { Slot } from 'expo-router';
import { View } from 'react-native';

export default function RootLayout() {
    console.log('RootLayout rendering!');
    return (
        <View style={{ flex: 1, backgroundColor: '#000' }}>
            <Slot />
        </View>
    );
}
