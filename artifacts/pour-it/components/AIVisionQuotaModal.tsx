import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

export type AIVisionQuotaIssue = 'exhausted' | 'unknown';

interface AIVisionQuotaModalProps {
  visible: boolean;
  issue: AIVisionQuotaIssue;
  accentColor: string;
  onDismiss: () => void;
}

export function AIVisionQuotaModal({
  visible,
  issue,
  accentColor,
  onDismiss,
}: AIVisionQuotaModalProps) {
  const exhausted = issue === 'exhausted';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityViewIsModal>
          <Text style={styles.icon}>{exhausted ? '✨' : '⚠️'}</Text>
          <Text style={styles.title}>
            {exhausted
              ? "You've used your 3 free AI scans"
              : 'AI scan allowance unavailable'}
          </Text>
          <Text style={styles.body}>
            {exhausted
              ? 'Upgrade to keep identifying bottles with AI.'
              : "We couldn't read or save your scan allowance on this device. AI scanning is paused. Try again; barcode matches and browsing are still available."}
          </Text>

          {exhausted && (
            <Pressable
              disabled
              style={[styles.upgradeButton, styles.disabledButton]}
              accessibilityRole="button"
              accessibilityLabel="Upgrade coming soon"
              accessibilityState={{ disabled: true }}
            >
              <Text style={styles.disabledButtonText}>Upgrade coming soon</Text>
            </Pressable>
          )}

          {/* TODO(RevenueCat): wire the enabled purchase action here once
              RevenueCat is integrated; do not enable this button beforehand. */}
          <Pressable
            onPress={onDismiss}
            style={({ pressed }) => [
              styles.dismissButton,
              { borderColor: accentColor },
              pressed && { backgroundColor: `${accentColor}20` },
            ]}
            accessibilityRole="button"
            accessibilityLabel={exhausted ? 'Back to scanner' : 'Try again'}
          >
            <Text style={[styles.dismissText, { color: accentColor }]}>
              {exhausted ? 'Back to scanner' : 'Try again'}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  card: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 28,
    borderRadius: 22,
    backgroundColor: '#14141D',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  icon: {
    fontSize: 34,
    marginBottom: 12,
  },
  title: {
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 22,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  body: {
    marginTop: 10,
    fontFamily: 'DMSans_400Regular',
    fontSize: 14,
    lineHeight: 21,
    color: '#A1A1AA',
    textAlign: 'center',
  },
  upgradeButton: {
    width: '100%',
    marginTop: 22,
    minHeight: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabledButton: {
    backgroundColor: '#3A3A45',
    opacity: 0.72,
  },
  disabledButtonText: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 14,
    color: '#A1A1AA',
  },
  dismissButton: {
    width: '100%',
    marginTop: 12,
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dismissText: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 14,
  },
});