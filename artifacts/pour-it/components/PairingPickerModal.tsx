import { Feather } from '@expo/vector-icons';
import React, { useState, useMemo } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { AppMode, Product } from '@/src/data/recipes';
import { PRODUCTS } from '@/src/data/recipes';
import { safeImpact } from '@/utils/haptics';
import * as Haptics from 'expo-haptics';

interface PairingPickerModalProps {
  visible: boolean;
  mode: AppMode;
  accentColor: string;
  onSelect: (product: Product) => void;
  onClose: () => void;
}

export function PairingPickerModal({
  visible,
  mode,
  accentColor,
  onSelect,
  onClose,
}: PairingPickerModalProps) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');

  const availableProducts = PRODUCTS[mode];

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return availableProducts;
    return availableProducts.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q) ||
        p.spiritType.toLowerCase().includes(q)
    );
  }, [query, availableProducts]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: Platform.OS === 'web' ? insets.top + 20 : 20, paddingBottom: insets.bottom }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Select a {mode === 'spirits' ? 'Spirit' : 'THC'} Pairing</Text>
          <Pressable onPress={onClose} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel="Close pairing picker">
            <Feather name="x" size={24} color="#FFFFFF" />
          </Pressable>
        </View>

        <View style={styles.searchWrap}>
          <Feather name="search" size={18} color="rgba(255,255,255,0.4)" style={styles.searchIcon} />
          <TextInput
            style={[styles.searchInput, { borderColor: 'rgba(255,255,255,0.1)' }]}
            placeholder="Search known products..."
            placeholderTextColor="rgba(255,255,255,0.4)"
            value={query}
            onChangeText={setQuery}
            autoFocus
            testID="pairing-search-input"
          />
        </View>

        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [
                styles.item,
                { backgroundColor: pressed ? 'rgba(255,255,255,0.1)' : 'transparent' }
              ]}
              onPress={() => {
                safeImpact(Haptics.ImpactFeedbackStyle.Light);
                onSelect(item);
              }}
              testID={`pairing-product-${item.id}`}
            >
              <Text style={styles.itemEmoji}>{item.emoji}</Text>
              <View style={styles.itemInfo}>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemBrand}>{item.brand} • {item.spiritType}</Text>
              </View>
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>No products found matching "{query}"</Text>
            </View>
          }
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#12121A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  title: {
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 20,
    color: '#FFFFFF',
  },
  closeBtn: {
    padding: 4,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  searchIcon: {
    position: 'absolute',
    left: 36,
    zIndex: 1,
  },
  searchInput: {
    flex: 1,
    height: 44,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderRadius: 22,
    paddingLeft: 44,
    paddingRight: 16,
    color: '#FFFFFF',
    fontFamily: 'DMSans_400Regular',
    fontSize: 15,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingBottom: 24,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
  },
  itemEmoji: {
    fontSize: 28,
    marginRight: 12,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 16,
    color: '#FFFFFF',
    marginBottom: 2,
  },
  itemBrand: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
  },
  emptyWrap: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 14,
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
  },
});
