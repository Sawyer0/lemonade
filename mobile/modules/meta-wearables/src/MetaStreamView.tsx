import { requireNativeViewManager } from 'expo-modules-core';
import * as React from 'react';
import { ViewProps } from 'react-native';

export type MetaStreamViewProps = {
  deviceId?: string;
} & ViewProps;

const NativeView: React.ComponentType<MetaStreamViewProps> =
  requireNativeViewManager('MetaWearables');

export default function MetaStreamView(props: MetaStreamViewProps) {
  return <NativeView {...props} />;
}
