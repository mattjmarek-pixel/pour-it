import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/EmptyState';
import { SkeletonCard } from '@/components/SkeletonCard';
import type { AppMode, Product } from '@/src/data/recipes';
import { PRODUCTS } from '@/src/data/recipes';
import { safeImpact } from '@/utils/haptics';

interface ProductCardProps {
  product: Product;
  accentColor: string;
  index: number;
  onSelect: (product: Product) => void;
}

function ProductCard({ product, accentColor, index, onSelect }: ProductCardProps) {
  const anim = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 350,
      delay: index * 60,
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <Animated.View
      style={[
        styles.cardWrapper,
        {
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }, { scale }],
        },
      ]}
    >
      <Pressable
        style={({ pressed }) => [
          styles.card,
          { borderColor: pressed ? accentColor : 'rgba(255,255,255,0.10)' },
        ]}
        onPress={() => {
          safeImpact(Haptics.ImpactFeedbackStyle.Light);
          onSelect(product);
        }}
        onPressIn={() => {
          Animated.spring(scale, { toValue: 0.96, useNativeDriver: true }).start();
        }}
        onPressOut={() => {
          Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();
        }}
      >
        <Text style={styles.emoji}>{product.emoji}</Text>
        <Text style={[styles.productName, { color: accentColor }]} numberOfLines={2}>
          {product.name}
        </Text>
        <Text style={styles.brand} numberOfLines={1}>
          {product.brand}
        </Text>
        <Text style={styles.recipesCount}>{product.recipes.length} recipes</Text>
      </Pressable>
    </Animated.View>
  );
}

interface ProductGridProps {
  mode: AppMode;
  accentColor: string;
  category: string | null;
  onProductSelected: (product: Product) => void;
  onBack: () => void;
}

const SKELETON_KEYS = ['s0', 's1', 's2', 's3', 's4', 's5'];

export function ProductGrid({ mode, accentColor, category, onProductSelected, onBack }: ProductGridProps) {
  const insets = useSafeAreaInsets();
  const [isLoading, setIsLoading] = useState(true);
  const products = PRODUCTS[mode].filter((p) => !category || p.category === category);

  useEffect(() => {
    setIsLoading(true);
    const t = setTimeout(() => setIsLoading(false), 350);
    return () => clearTimeout(t);
  }, [mode, category]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 0) }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={onBack}>
          <Feather name="chevron-left" size={22} color="rgba(255,255,255,0.7)" />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title} numberOfLines={1}>
            {category ?? 'All Products'}
          </Text>
          <Text style={styles.subtitle}>
            {isLoading ? 'Loading...' : `${products.length} options`}
          </Text>
        </View>
      </View>

      {isLoading ? (
        <FlatList
          data={SKELETON_KEYS}
          keyExtractor={(k) => k}
          numColumns={2}
          contentContainerStyle={styles.grid}
          renderItem={() => <SkeletonCard />}
          showsVerticalScrollIndicator={false}
        />
      ) : products.length === 0 ? (
        <EmptyState
          icon="✨"
          title="Nothing here yet"
          subtitle="Try a different category"
          accentColor={accentColor}
          actionLabel="Go back"
          onAction={onBack}
        />
      ) : (
        <FlatList
          data={products}
          keyExtractor={(item) => item.id}
          numColumns={2}
          contentContainerStyle={styles.grid}
          renderItem={({ item, index }) => (
            <ProductCard
              product={item}
              accentColor={accentColor}
              index={index}
              onSelect={onProductSelected}
            />
          )}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    gap: 12,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 22,
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
  },
  grid: {
    padding: 16,
    gap: 14,
    paddingBottom: 120,
  },
  cardWrapper: {
    flex: 1,
    marginHorizontal: 6,
    marginBottom: 2,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
    minHeight: 140,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  emoji: {
    fontSize: 38,
    marginBottom: 4,
  },
  productName: {
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 14,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  brand: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
  },
  recipesCount: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 11,
    color: 'rgba(255,255,255,0.3)',
    marginTop: 2,
  },
});
