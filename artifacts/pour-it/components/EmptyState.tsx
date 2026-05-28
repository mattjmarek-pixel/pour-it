import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { safeSelection } from '@/utils/haptics';

interface EmptyStateProps {
  icon: string;
  title: string;
  subtitle: string;
  accentColor?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon,
  title,
  subtitle,
  accentColor = '#D4A843',
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.icon} accessibilityElementsHidden>
        {icon}
      </Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
      {actionLabel && onAction && (
        <Pressable
          style={({ pressed }) => [
            styles.action,
            {
              borderColor: accentColor,
              backgroundColor: pressed ? `${accentColor}25` : 'rgba(255,255,255,0.04)',
            },
          ]}
          onPress={() => {
            safeSelection();
            onAction();
          }}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
        >
          <Text style={[styles.actionText, { color: accentColor }]}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 36,
    paddingVertical: 60,
    gap: 12,
  },
  icon: {
    fontSize: 48,
    marginBottom: 6,
  },
  title: {
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 22,
    color: '#FFFFFF',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 21,
    maxWidth: 280,
  },
  action: {
    marginTop: 18,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 100,
    borderWidth: 1,
    minHeight: 44,
    justifyContent: 'center',
  },
  actionText: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 14,
  },
});
