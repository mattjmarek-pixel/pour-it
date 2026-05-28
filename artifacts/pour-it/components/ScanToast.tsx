import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';

interface ScanToastProps {
  message: string;
  visible: boolean;
  /**
   * Reserved for API compatibility with the original spec. Dismissal is owned
   * by the parent via the `visible` prop to avoid duelling timers.
   */
  duration?: number;
}

export function ScanToast({ message, visible }: ScanToastProps) {
  const translateY = useRef(new Animated.Value(20)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else if (mounted) {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 20,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [visible, mounted, translateY, opacity]);

  if (!mounted) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.toast, { opacity, transform: [{ translateY }] }]}
    >
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 100,
    paddingHorizontal: 20,
    paddingVertical: 10,
    alignSelf: 'center',
  },
  text: {
    fontFamily: 'DMSans_400Regular',
    color: '#FFFFFF',
    fontSize: 14,
  },
});
