import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { AppMode, Product } from '@/src/data/recipes';
import { CATEGORIES, PRODUCTS } from '@/src/data/recipes';

interface ScanViewProps {
  mode: AppMode;
  accentColor: string;
  onProductFound: (product: Product) => void;
  onCategorySelected: (category: string) => void;
}

export function ScanView({ mode, accentColor, onProductFound, onCategorySelected }: ScanViewProps) {
  const insets = useSafeAreaInsets();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(0.6)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulseAnim, { toValue: 1.03, duration: 1400, useNativeDriver: false }),
          Animated.timing(opacityAnim, { toValue: 1, duration: 1400, useNativeDriver: false }),
          Animated.timing(glowAnim, { toValue: 1, duration: 1400, useNativeDriver: false }),
        ]),
        Animated.parallel([
          Animated.timing(pulseAnim, { toValue: 1, duration: 1400, useNativeDriver: false }),
          Animated.timing(opacityAnim, { toValue: 0.45, duration: 1400, useNativeDriver: false }),
          Animated.timing(glowAnim, { toValue: 0, duration: 1400, useNativeDriver: false }),
        ]),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  const handleTapScan = () => {
    if (scanning) return;
    setScanning(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setTimeout(() => {
      const products = PRODUCTS[mode];
      const random = products[Math.floor(Math.random() * products.length)];
      onProductFound(random);
      setScanning(false);
    }, 600);
  };

  const categories = CATEGORIES[mode];
  const topPad = insets.top + (Platform.OS === 'web' ? 67 : 20);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: topPad }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.headline}>Scan Your Bottle</Text>
      <Text style={[styles.subheadline, { color: accentColor }]}>
        Tap the scanner or browse by category
      </Text>

      <View style={styles.scanContainer}>
        <Animated.View
          style={[
            styles.viewfinderOuter,
            {
              transform: [{ scale: pulseAnim }],
              opacity: opacityAnim,
            },
          ]}
        >
          <Pressable
            style={[styles.viewfinder, { borderColor: accentColor }]}
            onPress={handleTapScan}
          >
            <View style={styles.scanInner}>
              {scanning ? (
                <>
                  <Animated.View
                    style={[
                      styles.scanLine,
                      { backgroundColor: accentColor },
                    ]}
                  />
                  <Text style={[styles.scanningText, { color: accentColor }]}>
                    Scanning...
                  </Text>
                </>
              ) : (
                <>
                  <View style={[styles.scanIcon, { borderColor: accentColor }]}>
                    <Feather name="camera" size={32} color={accentColor} />
                  </View>
                  <Text style={[styles.tapText, { color: accentColor }]}>
                    Tap to Scan
                  </Text>
                  <Text style={styles.tapSub}>
                    Point at bottle label or barcode
                  </Text>
                </>
              )}
            </View>

            {/* Corner brackets */}
            <View style={[styles.corner, styles.topLeft, { borderColor: accentColor }]} />
            <View style={[styles.corner, styles.topRight, { borderColor: accentColor }]} />
            <View style={[styles.corner, styles.bottomLeft, { borderColor: accentColor }]} />
            <View style={[styles.corner, styles.bottomRight, { borderColor: accentColor }]} />
          </Pressable>
        </Animated.View>
      </View>

      <View style={styles.dividerRow}>
        <View style={styles.divider} />
        <Text style={styles.dividerText}>or browse by category</Text>
        <View style={styles.divider} />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        {categories.map((cat) => (
          <Pressable
            key={cat}
            style={({ pressed }) => [
              styles.chip,
              {
                borderColor: accentColor,
                backgroundColor: pressed ? `${accentColor}25` : 'rgba(255,255,255,0.06)',
                transform: [{ scale: pressed ? 0.95 : 1 }],
              },
            ]}
            onPress={() => {
              Haptics.selectionAsync();
              onCategorySelected(cat);
            }}
          >
            <Text style={[styles.chipText, { color: accentColor }]}>{cat}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <Text style={styles.browseAll}>
        Or tap any category above to browse all products
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 130,
  },
  headline: {
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 34,
    color: '#FFFFFF',
    letterSpacing: -0.8,
    marginBottom: 6,
  },
  subheadline: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 15,
    marginBottom: 32,
    lineHeight: 22,
  },
  scanContainer: {
    alignItems: 'center',
    marginBottom: 36,
  },
  viewfinderOuter: {
    width: '100%',
    aspectRatio: 0.9,
  },
  viewfinder: {
    flex: 1,
    borderRadius: 24,
    borderWidth: 1.5,
    backgroundColor: 'rgba(255,255,255,0.04)',
    overflow: 'visible',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanInner: {
    alignItems: 'center',
    gap: 14,
    padding: 30,
  },
  scanIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  tapText: {
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 22,
    letterSpacing: -0.3,
  },
  tapSub: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    color: 'rgba(255,255,255,0.35)',
    textAlign: 'center',
  },
  scanLine: {
    width: '80%',
    height: 2,
    borderRadius: 1,
    marginBottom: 10,
  },
  scanningText: {
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 20,
    letterSpacing: -0.3,
  },
  corner: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderWidth: 3,
  },
  topLeft: {
    top: -1,
    left: -1,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 8,
  },
  topRight: {
    top: -1,
    right: -1,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 8,
  },
  bottomLeft: {
    bottom: -1,
    left: -1,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 8,
  },
  bottomRight: {
    bottom: -1,
    right: -1,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 8,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 12,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  dividerText: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 12,
    color: 'rgba(255,255,255,0.30)',
  },
  chips: {
    gap: 10,
    flexDirection: 'row',
    paddingBottom: 6,
  },
  chip: {
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 100,
    borderWidth: 1,
  },
  chipText: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
  },
  browseAll: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 12,
    color: 'rgba(255,255,255,0.2)',
    textAlign: 'center',
    marginTop: 16,
  },
});
