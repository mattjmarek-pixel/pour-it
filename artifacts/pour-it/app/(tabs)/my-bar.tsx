import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/EmptyState';
import { MODE_COLORS, MODE_LABELS } from '@/constants/colors';
import { getMyBarItems, type MyBarItem } from '@/src/services/myBarStorage';

function formatLastScanned(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function MyBarScreen() {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<MyBarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const topPadding = insets.top + (Platform.OS === 'web' ? 67 : 16);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);

      void getMyBarItems().then((storedItems) => {
        if (!active) return;
        setItems(storedItems);
        setLoading(false);
      });

      return () => {
        active = false;
      };
    }, [])
  );

  if (loading) {
    return (
      <View style={[styles.container, styles.center, { paddingTop: topPadding }]}>
        <ActivityIndicator color={MODE_COLORS.spirits} />
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={[styles.container, { paddingTop: topPadding }]}>
        <Text style={styles.title}>My Bar</Text>
        <EmptyState
          icon="🍾"
          title="Your bar is empty"
          subtitle="Products you identify with the scanner will appear here"
          accentColor={MODE_COLORS.spirits}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: topPadding }]}>
      <Text style={styles.title}>My Bar</Text>
      <Text style={styles.subtitle}>{items.length} scanned</Text>

      <FlatList
        data={items}
        keyExtractor={(item) => item.identity}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 100) },
        ]}
        renderItem={({ item }) => {
          const accent = MODE_COLORS[item.mode];
          return (
            <View style={styles.card}>
              <View style={[styles.iconWrap, { backgroundColor: `${accent}20` }]}>
                <Feather name="package" size={20} color={accent} />
              </View>
              <View style={styles.cardCopy}>
                <Text style={styles.productName}>{item.name}</Text>
                <Text style={styles.productMeta}>
                  {item.brand} · {item.category}
                </Text>
                <Text style={styles.date}>Last scanned {formatLastScanned(item.lastScannedAt)}</Text>
              </View>
              <View style={[styles.modeBadge, { borderColor: `${accent}66` }]}>
                <Text style={[styles.modeText, { color: accent }]}>{MODE_LABELS[item.mode]}</Text>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
    paddingHorizontal: 20,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: '#FFFFFF',
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 30,
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.35)',
    fontFamily: 'DMSans_400Regular',
    fontSize: 14,
    marginBottom: 20,
  },
  listContent: {
    gap: 10,
  },
  card: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.10)',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    padding: 14,
  },
  iconWrap: {
    alignItems: 'center',
    borderRadius: 12,
    height: 42,
    justifyContent: 'center',
    marginRight: 12,
    width: 42,
  },
  cardCopy: {
    flex: 1,
  },
  productName: {
    color: '#FFFFFF',
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 16,
  },
  productMeta: {
    color: 'rgba(255,255,255,0.52)',
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    marginTop: 2,
  },
  date: {
    color: 'rgba(255,255,255,0.32)',
    fontFamily: 'DMSans_400Regular',
    fontSize: 11,
    marginTop: 5,
  },
  modeBadge: {
    borderRadius: 10,
    borderWidth: 1,
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  modeText: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 10,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});