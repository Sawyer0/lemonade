import { View, Text } from 'react-native';

export default function Index() {
    console.log('Index rendering!');
    return (
        <View style={{ flex: 1, backgroundColor: '#16213e', justifyContent: 'center', alignItems: 'center' }}>
            <Text style={{ fontSize: 50 }}>🍋</Text>
            <Text style={{ fontSize: 32, color: '#fff', fontWeight: 'bold' }}>Lemonade</Text>
            <Text style={{ fontSize: 18, color: '#e94560', marginTop: 10 }}>Routes are working!</Text>
        </View>
    );
}