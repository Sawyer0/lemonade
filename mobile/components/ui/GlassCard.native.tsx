import React from 'react';
import { View, StyleSheet, ViewProps } from 'react-native';
import { Theme } from '@mobile/constants/theme';

interface GlassCardProps extends ViewProps {
  variant?: 'default' | 'thin';
}

export function GlassCard({ children, style, variant = 'default', ...props }: GlassCardProps) {
  return (
    <View 
      style={[
        styles.card, 
        variant === 'thin' && styles.thin,
        style
      ]} 
      {...props}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Theme.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.border,
    padding: 16,
    // Shadow for iOS
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.30,
    shadowRadius: 4.65,
    // Elevation for Android
    elevation: 8,
  },
  thin: {
    padding: 12,
    borderRadius: 12,
  }
});
