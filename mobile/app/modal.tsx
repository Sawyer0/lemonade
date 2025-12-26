import { useLocalSearchParams, Stack } from 'expo-router';
import { StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { ThemedView } from '@mobile/components/themed-view';
import { ThemedText } from '@mobile/components/themed-text';

export default function ModalScreen() {
  const { url, title } = useLocalSearchParams<{ url: string; title: string }>();

  if (!url) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText>No content URL provided.</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: title || 'Documentation', presentation: 'modal' }} />
      <WebView 
        source={{ uri: decodeURIComponent(url) }} 
        style={styles.webview}
        startInLoadingState
        scalesPageToFit
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webview: {
    flex: 1,
  },
});
