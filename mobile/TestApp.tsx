// Temporarily bypass expo-router to test if React Native works
import { registerRootComponent } from 'expo';
import { View, Text, StyleSheet } from 'react-native';

function App() {
    return (
        <View style={styles.container}>
            <Text style={styles.title}>🍋 Lemonade MVP</Text>
            <Text style={styles.subtitle}>React Native is working!</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#00EDA4',
        justifyContent: 'center',
        alignItems: 'center',
    },
    title: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#1a1a1a',
    },
    subtitle: {
        fontSize: 18,
        color: '#333',
        marginTop: 10,
    },
});

registerRootComponent(App);
