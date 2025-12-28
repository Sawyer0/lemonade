import { LogBox } from 'react-native';

// Ignore specific warnings that are safe to ignore but break E2E tests
LogBox.ignoreLogs([
  "Can't perform a React state update on a component that hasn't mounted yet",
]);

// Custom entry point for expo-router
import 'expo-router/entry';