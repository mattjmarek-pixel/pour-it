import { Feather } from '@expo/vector-icons';
import { fetch } from 'expo/fetch';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Recipe } from '@/src/data/recipes';

const STREAM_TIMEOUT_MS = 30_000;

interface AIPanelProps {
  visible: boolean;
  recipe: Recipe | null;
  accentColor: string;
  onClose: () => void;
}

export function AIPanel({ visible, recipe, accentColor, onClose }: AIPanelProps) {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(0)).current;
  const skeletonAnim = useRef(new Animated.Value(0.3)).current;
  const abortControllerRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [prompt, setPrompt] = useState('Make this drink more tropical');
  const [streaming, setStreaming] = useState(false);
  const [response, setResponse] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: visible ? 1 : 0,
      bounciness: 6,
      speed: 14,
      useNativeDriver: true,
    }).start();

    if (!visible) {
      abortControllerRef.current?.abort();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setResponse('');
      setError('');
      setStreaming(false);
    }
  }, [visible]);

  useEffect(() => {
    if (!streaming) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(skeletonAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(skeletonAnim, { toValue: 0.3, duration: 700, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [streaming]);

  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [700, 0],
  });

  const overlayOpacity = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const handleStream = async () => {
    if (!recipe || streaming) return;
    Keyboard.dismiss();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStreaming(true);
    setResponse('');
    setError('');

    abortControllerRef.current = new AbortController();
    const { signal } = abortControllerRef.current;

    timeoutRef.current = setTimeout(() => {
      abortControllerRef.current?.abort();
    }, STREAM_TIMEOUT_MS);

    try {
      const domain = process.env.EXPO_PUBLIC_DOMAIN;
      const url = `https://${domain}/api/claude-stream`;

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({ recipe, prompt }),
        signal: signal as AbortSignal,
      });

      if (res.status === 429) {
        setError("We're getting a lot of requests right now. Please try again in a moment.");
        return;
      }

      if (!res.ok) {
        setError(`Something went wrong (${res.status}). Tap to retry.`);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setError('Something went wrong. Tap to retry.');
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let receivedAny = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          if (data.startsWith('{')) {
            try {
              const parsed = JSON.parse(data) as { content?: string; error?: string };
              if (parsed.error) {
                setError(parsed.error);
                return;
              }
              if (parsed.content) {
                receivedAny = true;
                setResponse((prev) => prev + parsed.content);
              }
            } catch {}
          }
        }
      }

      if (!receivedAny) {
        setError('No response received. Tap to retry.');
      }
    } catch (err) {
      const e = err as Error;
      if (e.name === 'AbortError') {
        if (signal.aborted) {
          setError('Request timed out after 30 seconds. Tap to retry.');
        }
      } else {
        setError('Unable to connect. Check your connection and tap to retry.');
      }
    } finally {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setStreaming(false);
    }
  };

  if (!visible && (slideAnim as unknown as { _value: number })._value === 0) return null;

  return (
    <View style={[StyleSheet.absoluteFill, { pointerEvents: visible ? 'auto' : 'none' }]}>
      <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close AI panel" />
      </Animated.View>

      <Animated.View
        style={[
          styles.panel,
          {
            borderColor: accentColor,
            paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 0),
            transform: [{ translateY }],
          },
        ]}
      >
        <View style={styles.handle} />

        <View style={styles.panelHeader}>
          <View>
            <Text style={styles.panelTitle}>Customize with AI</Text>
            {recipe && (
              <Text style={[styles.panelSubtitle, { color: accentColor }]}>{recipe.name}</Text>
            )}
          </View>
          <Pressable
            style={styles.closeBtn}
            onPress={onClose}
            accessibilityLabel="Close"
            accessibilityRole="button"
          >
            <Feather name="x" size={18} color="rgba(255,255,255,0.5)" />
          </Pressable>
        </View>

        <View style={[styles.inputContainer, { borderColor: `${accentColor}55` }]}>
          <TextInput
            style={styles.textInput}
            value={prompt}
            onChangeText={setPrompt}
            placeholder="e.g. Make it more tropical..."
            placeholderTextColor="rgba(255,255,255,0.25)"
            multiline
            maxLength={200}
            accessibilityLabel="Customization prompt"
          />
        </View>

        <Pressable
          style={[
            styles.generateBtn,
            { backgroundColor: streaming ? `${accentColor}66` : accentColor },
          ]}
          onPress={error ? handleStream : handleStream}
          disabled={streaming}
          accessibilityLabel={streaming ? 'Generating recipe variation' : 'Generate variation'}
          accessibilityRole="button"
        >
          {streaming ? (
            <>
              <Feather name="loader" size={15} color="#0A0A0F" />
              <Text style={styles.generateBtnText}>Creating magic...</Text>
            </>
          ) : error ? (
            <>
              <Feather name="refresh-cw" size={15} color="#0A0A0F" />
              <Text style={styles.generateBtnText}>Retry</Text>
            </>
          ) : (
            <>
              <Feather name="zap" size={15} color="#0A0A0F" />
              <Text style={styles.generateBtnText}>Generate Variation</Text>
            </>
          )}
        </Pressable>

        {streaming && !response && (
          <View style={styles.skeletonContainer}>
            <Animated.View style={[styles.skeletonLine, { opacity: skeletonAnim, width: '90%' }]} />
            <Animated.View style={[styles.skeletonLine, { opacity: skeletonAnim, width: '75%' }]} />
            <Animated.View style={[styles.skeletonLine, { opacity: skeletonAnim, width: '85%' }]} />
            <Animated.View style={[styles.skeletonLine, { opacity: skeletonAnim, width: '60%' }]} />
          </View>
        )}

        {(response || error) && (
          <ScrollView style={styles.responseContainer} showsVerticalScrollIndicator={false}>
            {error ? (
              <Text style={styles.errorText}>{error}</Text>
            ) : (
              <Text style={styles.responseText}>{response}</Text>
            )}
          </ScrollView>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
  },
  panel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#12121A',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    padding: 24,
    paddingTop: 12,
    maxHeight: '85%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center',
    marginBottom: 20,
  },
  panelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  panelTitle: {
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 22,
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  panelSubtitle: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    marginTop: 3,
  },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputContainer: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 14,
    minHeight: 80,
  },
  textInput: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 15,
    color: '#FFFFFF',
    lineHeight: 22,
  },
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 100,
    paddingVertical: 14,
    marginBottom: 18,
    minHeight: 44,
  },
  generateBtnText: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 15,
    color: '#0A0A0F',
  },
  skeletonContainer: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  skeletonLine: {
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  responseContainer: {
    maxHeight: 280,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    padding: 16,
  },
  responseText: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    lineHeight: 22,
  },
  errorText: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 14,
    color: '#EF4444',
    lineHeight: 22,
  },
});
