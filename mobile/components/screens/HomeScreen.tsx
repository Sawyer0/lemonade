import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Link, useRouter } from 'expo-router';

export default function HomeScreenWeb() {
    const router = useRouter();

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Lemonade Mobile Web</Text>
            <Text style={styles.subtitle}>
                You are running the mobile app in a browser.
                Native modules (Google Signin, WebView) are disabled.
            </Text>

            <View style={styles.buttonContainer}>
                <Link href="/live-mechanic" asChild>
                    <TouchableOpacity style={styles.button}>
                        <Text style={styles.buttonText}>Launch Live Mechanic Demo</Text>
                    </TouchableOpacity>
                </Link>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
        backgroundColor: '#f5f5f5',
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 10,
        color: '#333',
    },
    subtitle: {
        fontSize: 16,
        color: '#666',
        textAlign: 'center',
        marginBottom: 30,
        maxWidth: 400,
    },
    buttonContainer: {
        gap: 15,
        width: '100%',
        maxWidth: 300,
    },
    button: {
        backgroundColor: '#007AFF',
        paddingVertical: 15,
        paddingHorizontal: 20,
        borderRadius: 10,
        alignItems: 'center',
    },
    buttonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: '600',
    },
});
