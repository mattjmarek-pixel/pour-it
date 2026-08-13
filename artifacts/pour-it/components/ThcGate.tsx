import React, { useState } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';

import { useThcGate } from '@/context/ThcGateContext';
import { US_STATES } from '@/src/data/legalStatesForTHC';
import { MODE_COLORS } from '@/constants/colors';

/**
 * Gate wrapper for the THC tab. Renders children only when the user's state
 * has been affirmatively verified as legal. Everything else (checking,
 * blocked, unverified) shows a non-bypassable screen with no scan UI.
 */
export function ThcGate({ children }: { children: React.ReactNode }) {
  const gate = useThcGate();
  const insets = useSafeAreaInsets();
  const [pickerOpen, setPickerOpen] = useState(false);
  const accent = MODE_COLORS.thc;

  // Verify on first focus each session, and re-verify when the check is stale
  // (user may have traveled). `ensureFresh` is referentially stable, so this
  // effect only re-runs on focus changes — not on every gate state transition.
  const { ensureFresh } = gate;
  useFocusEffect(
    React.useCallback(() => {
      ensureFresh();
    }, [ensureFresh])
  );

  if (gate.status === 'allowed') {
    return <>{children}</>;
  }

  const pad = insets.top + (Platform.OS === 'web' ? 67 : 0) + 24;

  if (gate.status === 'checking' || gate.status === 'idle') {
    return (
      <View style={[styles.root, { paddingTop: pad }]}>
        <View style={styles.center}>
          <ActivityIndicator color={accent} />
          <Text style={styles.subText}>Verifying your location…</Text>
        </View>
      </View>
    );
  }

  if (pickerOpen) {
    return (
      <View style={[styles.root, { paddingTop: pad }]}>
        <Text style={styles.title}>Select your state</Text>
        <Text style={styles.subText}>
          We use this to confirm THC features are available where you are.
        </Text>
        <FlatList
          data={US_STATES}
          keyExtractor={(s) => s.abbr}
          style={styles.stateList}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => {
                setPickerOpen(false);
                gate.submitManualState(item.abbr);
              }}
              style={styles.stateRow}
              accessibilityRole="button"
              accessibilityLabel={`Select ${item.name}`}
            >
              <Text style={styles.stateName}>{item.name}</Text>
              <Feather name="chevron-right" size={18} color="rgba(255,255,255,0.35)" />
            </Pressable>
          )}
        />
      </View>
    );
  }

  const blocked = gate.status === 'blocked';

  return (
    <View style={[styles.root, { paddingTop: pad }]}>
      <View style={styles.center}>
        <View style={[styles.iconWrap, { borderColor: accent }]}>
          <Feather name={blocked ? 'slash' : 'map-pin'} size={28} color={accent} />
        </View>
        <Text style={styles.title}>
          {blocked
            ? 'THC recognition isn’t available in your state'
            : 'Location needed for THC features'}
        </Text>
        <Text style={styles.subText}>
          {blocked
            ? gate.stateAbbr
              ? `Cannabis products aren’t legal for recreational use in ${gate.stateAbbr}, so THC scanning and recipes are disabled here.`
              : 'THC scanning and recipes are only available in states where recreational cannabis is legal.'
            : 'We couldn’t verify your location. THC features are only available in states where recreational cannabis is legal.'}
        </Text>
        {!blocked && (
          <>
            <Pressable
              onPress={() => void gate.verifyLocation()}
              style={[styles.primaryBtn, { backgroundColor: accent }]}
              accessibilityRole="button"
              accessibilityLabel="Retry location check"
            >
              <Text style={styles.primaryBtnText}>Use my location</Text>
            </Pressable>
            <Pressable
              onPress={() => setPickerOpen(true)}
              style={styles.linkBtn}
              accessibilityRole="button"
              accessibilityLabel="Select state manually"
            >
              <Text style={[styles.linkText, { color: accent }]}>
                Select my state manually
              </Text>
            </Pressable>
          </>
        )}
        {blocked && (
          <Pressable
            onPress={() => void gate.verifyLocation()}
            style={styles.linkBtn}
            accessibilityRole="button"
            accessibilityLabel="Re-check my location"
          >
            <Text style={[styles.linkText, { color: accent }]}>Re-check my location</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0A0A0F',
    paddingHorizontal: 24,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: {
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 22,
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  subText: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 14,
    lineHeight: 21,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
  },
  primaryBtn: {
    marginTop: 8,
    paddingHorizontal: 28,
    paddingVertical: 13,
    borderRadius: 26,
  },
  primaryBtnText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 15,
    color: '#0A0A0F',
  },
  linkBtn: {
    paddingVertical: 10,
  },
  linkText: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
  },
  stateList: {
    marginTop: 16,
  },
  stateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  stateName: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 15,
    color: '#FFFFFF',
  },
});
