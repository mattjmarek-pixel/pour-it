import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

const BG = '#1A1A2E';
const HIGHLIGHT = '#2A2A4E';

export function SkeletonCard() {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] });

  return (
    <View style={styles.wrapper}>
      <View style={styles.card}>
        <Animated.View style={[styles.imageBlock, { opacity, backgroundColor: HIGHLIGHT }]} />
        <Animated.View style={[styles.titleLine, { opacity, backgroundColor: HIGHLIGHT }]} />
        <Animated.View style={[styles.subtitleLine, { opacity, backgroundColor: HIGHLIGHT }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    marginHorizontal: 6,
    marginBottom: 2,
  },
  card: {
    backgroundColor: BG,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 18,
    minHeight: 140,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  imageBlock: {
    width: 60,
    height: 60,
    borderRadius: 12,
    marginBottom: 6,
  },
  titleLine: {
    width: '75%',
    height: 12,
    borderRadius: 6,
  },
  subtitleLine: {
    width: '50%',
    height: 10,
    borderRadius: 5,
  },
});
