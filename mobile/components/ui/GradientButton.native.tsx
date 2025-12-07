import React from 'react';
import { Text, StyleSheet, TouchableOpacity, TouchableOpacityProps, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Theme } from '@/constants/theme';

interface GradientButtonProps extends TouchableOpacityProps {
  title: string;
  icon?: React.ReactNode;
  loading?: boolean;
  variant?: 'primary' | 'outline' | 'ghost';
}

export function GradientButton({ 
  title, 
  icon, 
  loading, 
  variant = 'primary', 
  style, 
  disabled,
  ...props 
}: GradientButtonProps) {
  
  const isPrimary = variant === 'primary';

  const Content = (
    <React.Fragment>
      {loading ? (
        <ActivityIndicator color={isPrimary ? 'black' : 'white'} />
      ) : (
        <>
          {icon}
          <Text style={[
            styles.text, 
            { color: isPrimary ? 'black' : 'white' },
            icon ? { marginLeft: 8 } : {}
          ]}>
            {title}
          </Text>
        </>
      )}
    </React.Fragment>
  );

  if (isPrimary) {
    return (
      <TouchableOpacity 
        activeOpacity={0.8} 
        disabled={disabled || loading}
        style={[styles.container, style]}
        {...props}
      >
        <LinearGradient
          colors={[Theme.gradientStart, Theme.gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.gradient, disabled && styles.disabled]}
        >
          {Content}
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity 
      activeOpacity={0.7}
      disabled={disabled || loading}
      style={[
        styles.container, 
        styles.secondaryContainer,
        variant === 'outline' && styles.outline,
        style,
        disabled && styles.disabled
      ]} 
      {...props}
    >
      {Content}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  gradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  secondaryContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  outline: {
    borderWidth: 1,
    borderColor: Theme.border,
    backgroundColor: 'transparent',
  },
  text: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  disabled: {
    opacity: 0.5,
  }
});
