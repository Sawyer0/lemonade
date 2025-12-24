// Test file to see if expo-router discovers .js files
import { View, Text } from 'react-native';

export default function TestRoute() {
    return (
        <View style={{ flex: 1, backgroundColor: 'red', justifyContent: 'center', alignItems: 'center' }}>
            <Text style={{ fontSize: 30, color: 'white' }}>TEST ROUTE JS FILE</Text>
        </View>
    );
}
