import * as React from 'react';
import { View, Text, ViewProps } from 'react-native';
import { requireNativeViewManager } from 'expo-modules-core';

export type MetaStreamViewProps = {
  deviceId?: string;
} & ViewProps;

// Try to load native view, wrapped in try-catch
let NativeView: React.ComponentType<MetaStreamViewProps> | null = null;
try {
  NativeView = requireNativeViewManager('MetaWearables');
} catch {
  // Native view not available
}

export default function MetaStreamView(props: MetaStreamViewProps) {
  if (!NativeView) {
    return (
      <View {...props} style={[{ backgroundColor: '#333', justifyContent: 'center', alignItems: 'center' }, props.style]}>
        <Text style={{ color: '#888' }}>Meta Stream not available</Text>
      </View>
    );
  }
  return <NativeView {...props} />;
}
