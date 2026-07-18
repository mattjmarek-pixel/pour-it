import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import type { AppMode } from '@/src/data/recipes';
import { MODE_COLORS } from '@/constants/colors';

const MODE_LABELS: Record<AppMode, string> = {
  spirits: 'Spirits',
  thc: 'THC',
  mocktails: 'Mocktails',
};

interface CrossCategoryWarningModalProps {
  visible: boolean;
  detectedCategory: AppMode;
  currentMode: AppMode;
  productName?: string;
  onSwitchMode: () => void;
  onCancel: () => void;
}

/**
 * Fully blocking safety modal shown when a scanned/identified product belongs
 * to a different category than the active mode. There is intentionally no
 * "continue anyway" path, no tap-outside dismiss, and no swipe dismiss —
 * the only exits are switching to the correct mode or cancelling back to
 * the scanner.
 */
export function CrossCategoryWarningModal({
  visible,
  detectedCategory,
  currentMode,
  productName,
  onSwitchMode,
  onCancel,
}: CrossCategoryWarningModalProps) {
  const detectedLabel = MODE_LABELS[detectedCategory];
  const currentLabel = MODE_LABELS[currentMode];
  const detectedColor = MODE_COLORS[detectedCategory];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Feather name="alert-triangle" size={26} color="#F59E0B" />
          </View>

          <Text style={styles.title}>Different category detected</Text>

          <Text style={styles.body}>
            {productName
              ? `${productName} looks like a ${detectedLabel} product, but you're in ${currentLabel} mode.`
              : `This looks like a ${detectedLabel} product, but you're in ${currentLabel} mode.`}
          </Text>
          <Text style={styles.subBody}>
            To keep recipes accurate and safe, {currentLabel} recipes can't be
            shown for {detectedLabel} products.
          </Text>

          <Pressable
            style={[styles.switchBtn, { backgroundColor: detectedColor }]}
            onPress={onSwitchMode}
            accessibilityRole="button"
            accessibilityLabel={`Switch to ${detectedLabel} mode`}
          >
            <Text style={styles.switchBtnText}>Switch to {detectedLabel} mode</Text>
          </Pressable>

          <Pressable
            style={styles.cancelBtn}
            onPress={onCancel}
            accessibilityRole="button"
            accessibilityLabel="Cancel and return to scanner"
          >
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 28,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#12121A',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.45)',
    padding: 26,
    alignItems: 'center',
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 20,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 10,
  },
  body: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 6,
  },
  subBody: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 22,
  },
  switchBtn: {
    width: '100%',
    borderRadius: 100,
    paddingVertical: 14,
    alignItems: 'center',
    minHeight: 44,
    marginBottom: 10,
  },
  switchBtnText: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 15,
    color: '#0A0A0F',
  },
  cancelBtn: {
    width: '100%',
    borderRadius: 100,
    paddingVertical: 14,
    alignItems: 'center',
    minHeight: 44,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  cancelBtnText: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 15,
    color: 'rgba(255,255,255,0.8)',
  },
});
