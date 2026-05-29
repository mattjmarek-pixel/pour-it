import { Feather } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/EmptyState';
import { ScanToast } from '@/components/ScanToast';
import type { AppMode, Product } from '@/src/data/recipes';
import { PRODUCTS } from '@/src/data/recipes';
import { safeNotification } from '@/utils/haptics';

interface ScanViewProps {
  mode: AppMode;
  accentColor: string;
  onProductFound: (product: Product) => void;
  onBrowseManually: () => void;
}

const RETICLE_WIDTH = 280;
const RETICLE_HEIGHT = 180;

const MODE_LABELS: Record<AppMode, string> = {
  spirits: 'Spirits',
  thc: 'THC',
  mocktails: 'Mocktails',
};

export function ScanView({ mode, accentColor, onProductFound, onBrowseManually }: ScanViewProps) {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [torch, setTorch] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scannedRef = useRef(false);

  const cornerOpacity = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(cornerOpacity, {
          toValue: 1,
          duration: 1100,
          useNativeDriver: true,
        }),
        Animated.timing(cornerOpacity, {
          toValue: 0.55,
          duration: 1100,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [cornerOpacity]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!permission) return;
    if (!permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);

  const handleBarcodeScanned = (result: BarcodeScanningResult) => {
    if (scannedRef.current) return;
    scannedRef.current = true;
    setScanned(true);

    const raw = result.data?.trim() ?? '';
    if (!raw) {
      resetAfter(800);
      return;
    }

    const candidates = new Set<string>([
      raw,
      raw.replace(/^0+/, ''),
      raw.padStart(13, '0'),
      raw.padStart(12, '0'),
    ]);

    const allProducts = PRODUCTS[mode];
    const match = allProducts.find((p) =>
      (p.barcodes ?? []).some((code) => candidates.has(code) || candidates.has(code.replace(/^0+/, '')))
    );

    if (match) {
      safeNotification(Haptics.NotificationFeedbackType.Success);
      onProductFound(match);
      return;
    }

    safeNotification(Haptics.NotificationFeedbackType.Warning);
    setToastVisible(true);
    resetAfter(2000);
  };

  const resetAfter = (ms: number) => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => {
      scannedRef.current = false;
      setScanned(false);
      setToastVisible(false);
    }, ms);
  };

  // Web fallback: CameraView's barcode scanning is unreliable in the iframe
  // preview, so we show a simple browse-manually surface instead of a broken
  // camera. The reticle still renders so the design intent is visible.
  if (Platform.OS === 'web') {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 16 }]}>
        <View style={styles.topBar}>
          <Text style={styles.modeLabel}>{MODE_LABELS[mode]}</Text>
        </View>
        <View style={styles.webNoticeWrap}>
          <View style={[styles.reticle, { width: RETICLE_WIDTH, height: RETICLE_HEIGHT }]}>
            <Reticle accentColor={accentColor} opacity={cornerOpacity} />
          </View>
          <Text style={styles.webNoticeTitle}>Camera preview not available on web</Text>
          <Text style={styles.webNoticeSub}>
            On a device, point at a barcode to scan automatically.
          </Text>
        </View>
        <Pressable
          onPress={onBrowseManually}
          accessibilityRole="button"
          accessibilityLabel="Browse manually"
          style={styles.browseLinkWrap}
        >
          <Text style={styles.browseLink}>Browse manually</Text>
        </Pressable>
      </View>
    );
  }

  if (!permission) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={accentColor} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.root}>
        <EmptyState
          icon="📷"
          title="Camera access needed"
          subtitle="Enable camera access in Settings to scan bottles"
          accentColor={accentColor}
          actionLabel="Open Settings"
          onAction={() => Linking.openSettings()}
        />
        <Pressable
          onPress={onBrowseManually}
          accessibilityRole="button"
          accessibilityLabel="Browse manually"
          style={styles.browseLinkWrap}
        >
          <Text style={styles.browseLink}>Browse manually</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        active={isFocused}
        enableTorch={torch}
        barcodeScannerSettings={{
          barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'qr'],
        }}
        onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
      />

      {/* Dim overlays around the reticle */}
      <View style={[styles.overlay, styles.overlayTop, { height: '50%', marginBottom: RETICLE_HEIGHT / 2 }]} />
      <View style={[styles.overlay, styles.overlayBottom, { height: '50%', marginTop: RETICLE_HEIGHT / 2 }]} />
      <View
        style={[
          styles.overlaySide,
          { width: `50%`, marginRight: RETICLE_WIDTH / 2, left: 0 },
        ]}
      />
      <View
        style={[
          styles.overlaySide,
          { width: `50%`, marginLeft: RETICLE_WIDTH / 2, right: 0 },
        ]}
      />

      {/* Reticle */}
      <View
        pointerEvents="none"
        style={[
          styles.reticle,
          {
            width: RETICLE_WIDTH,
            height: RETICLE_HEIGHT,
            top: '50%',
            left: '50%',
            marginLeft: -RETICLE_WIDTH / 2,
            marginTop: -RETICLE_HEIGHT / 2,
            position: 'absolute',
          },
        ]}
      >
        <Reticle accentColor={accentColor} opacity={cornerOpacity} />
      </View>

      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.modeLabel}>{MODE_LABELS[mode]}</Text>
        <Pressable
          onPress={() => setTorch((t) => !t)}
          style={styles.torchBtn}
          accessibilityRole="button"
          accessibilityLabel={torch ? 'Turn off flashlight' : 'Turn on flashlight'}
          hitSlop={8}
        >
          <Feather name={torch ? 'zap' : 'zap-off'} size={22} color="#FFFFFF" />
        </Pressable>
      </View>

      {/* Toast above the browse-manually link */}
      <View
        pointerEvents="none"
        style={[
          styles.toastSlot,
          {
            top: '50%',
            marginTop: RETICLE_HEIGHT / 2 + 24,
          },
        ]}
      >
        <ScanToast message="Product not found — try browsing manually" visible={toastVisible} />
      </View>

      {/* Browse manually link */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          onPress={onBrowseManually}
          accessibilityRole="button"
          accessibilityLabel="Browse manually"
        >
          <Text style={styles.browseLink}>Browse manually</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Reticle({
  accentColor,
  opacity,
}: {
  accentColor: string;
  opacity: Animated.Value;
}) {
  return (
    <>
      <Animated.View
        style={[styles.corner, styles.cornerTL, { borderColor: accentColor, opacity }]}
      />
      <Animated.View
        style={[styles.corner, styles.cornerTR, { borderColor: accentColor, opacity }]}
      />
      <Animated.View
        style={[styles.corner, styles.cornerBL, { borderColor: accentColor, opacity }]}
      />
      <Animated.View
        style={[styles.corner, styles.cornerBR, { borderColor: accentColor, opacity }]}
      />
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  overlayTop: { top: 0 },
  overlayBottom: { bottom: 0 },
  overlaySide: {
    position: 'absolute',
    top: '50%',
    height: RETICLE_HEIGHT,
    marginTop: -RETICLE_HEIGHT / 2,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  reticle: {
    borderRadius: 18,
  },
  corner: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderWidth: 3,
  },
  cornerTL: {
    top: -2,
    left: -2,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 12,
  },
  cornerTR: {
    top: -2,
    right: -2,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 12,
  },
  cornerBL: {
    bottom: -2,
    left: -2,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 12,
  },
  cornerBR: {
    bottom: -2,
    right: -2,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 12,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modeLabel: {
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 20,
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  torchBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  toastSlot: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: 16,
    alignItems: 'center',
  },
  browseLinkWrap: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  browseLink: {
    fontFamily: 'DMSans_400Regular',
    color: '#6B7280',
    fontSize: 13,
    textAlign: 'center',
  },
  webNoticeWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    gap: 20,
  },
  webNoticeTitle: {
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 18,
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: 12,
  },
  webNoticeSub: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    maxWidth: 260,
  },
});
