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

interface AIPanelProps {
  visible: boolean;
  recipe: Recipe | null;
  accentColor: string;
  onClose: () => void;
}

export function AIPanel({ visible, recipe, accentColor, onClose }: AIPanelProps) {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(0)).current;
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
      setResponse('');
      setError('');
      setStreaming(false);
    }
  }, [visible]);

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
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No reader');

      const decoder = new TextDecoder();
      let buffer = '';

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
          try {
            const parsed = JSON.parse(data);
            if (parsed.content) {
              setResponse((prev) => prev + parsed.content);
            }
          } catch {}
        }
      }
    } catch (err) {
      setError('Unable to connect. Please check your connection and try again.');
    } finally {
      setStreaming(false);
    }
  };

  if (!visible && slideAnim._value === 0) return null;

  return (
    <View style={[StyleSheet.absoluteFill, { pointerEvents: visible ? 'auto' : 'none' }]}>
      <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
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
          <Pressable style={styles.closeBtn} onPress={onClose}>
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
          />
        </View>

        <Pressable
          style={[
            styles.generateBtn,
            { backgroundColor: streaming ? `${accentColor}66` : accentColor },
          ]}
          onPress={handleStream}
          disabled={streaming}
        >
          {streaming ? (
            <>
              <Feather name="loader" size={15} color="#0A0A0F" />
              <Text style={styles.generateBtnText}>Creating magic...</Text>
            </>
          ) : (
            <>
              <Feather name="zap" size={15} color="#0A0A0F" />
              <Text style={styles.generateBtnText}>Generate Variation</Text>
            </>
          )}
        </Pressable>

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
    width: 34,
    height: 34,
    borderRadius: 17,
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
  },
  generateBtnText: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 15,
    color: '#0A0A0F',
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
