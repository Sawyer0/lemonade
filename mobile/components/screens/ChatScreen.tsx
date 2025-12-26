import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function ChatScreen() {
    return (
        <View style={styles.container}>
            <Text style={styles.text}>Chat Screen (Web)</Text>
            <Text style={styles.subtext}>This feature is only available on mobile</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#1a1a1a',
    },
    text: {
        color: '#00EDA4',
        fontSize: 24,
        fontWeight: 'bold',
    },
    subtext: {
        color: '#888',
        fontSize: 16,
        marginTop: 10,
    },
});
