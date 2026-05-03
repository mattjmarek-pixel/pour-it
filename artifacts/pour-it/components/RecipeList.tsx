import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useRef, useState } from 'react';
import {
  Animated,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { AppMode, Recipe, Product } from '@/src/data/recipes';
import { useSavedRecipes } from '@/context/SavedRecipesContext';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: '#10B981',
  medium: '#F59E0B',
  hard: '#EF4444',
};

interface RecipeCardProps {
  recipe: Recipe;
  product: Product;
  mode: AppMode;
  accentColor: string;
  isExpanded: boolean;
  onToggle: () => void;
  onCustomizeAI: (recipe: Recipe) => void;
}

function RecipeCard({ recipe, product, mode, accentColor, isExpanded, onToggle, onCustomizeAI }: RecipeCardProps) {
  const { saveRecipe, unsaveRecipe, isRecipeSaved } = useSavedRecipes();
  const saved = isRecipeSaved(recipe.id);
  const scale = useRef(new Animated.Value(1)).current;

  const toggle = () => {
    Haptics.selectionAsync();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    onToggle();
  };

  return (
    <Animated.View
      style={[
        styles.card,
        {
          borderColor: isExpanded ? accentColor : 'rgba(255,255,255,0.10)',
          transform: [{ scale }],
        },
      ]}
    >
      <Pressable
        onPress={toggle}
        onPressIn={() => Animated.spring(scale, { toValue: 0.98, useNativeDriver: true }).start()}
        onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start()}
        accessibilityLabel={`${recipe.name}, ${recipe.difficulty}, ${recipe.time}. ${isExpanded ? 'Tap to collapse' : 'Tap to expand'}`}
        accessibilityRole="button"
        accessible
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <Text style={styles.recipeName}>{recipe.name}</Text>
            <View style={styles.metaRow}>
              <View style={[styles.badge, { backgroundColor: `${DIFFICULTY_COLORS[recipe.difficulty]}22` }]}>
                <Text style={[styles.badgeText, { color: DIFFICULTY_COLORS[recipe.difficulty] }]}>
                  {recipe.difficulty}
                </Text>
              </View>
              <View style={styles.timePill}>
                <Feather name="clock" size={11} color="rgba(255,255,255,0.4)" />
                <Text style={styles.timeText}>{recipe.time}</Text>
              </View>
            </View>
            <View style={styles.tags}>
              {recipe.tags.slice(0, 3).map((tag) => (
                <View key={tag} style={[styles.tag, { backgroundColor: `${accentColor}18` }]}>
                  <Text style={[styles.tagText, { color: accentColor }]}>{tag}</Text>
                </View>
              ))}
            </View>
          </View>
          <View style={styles.cardActions}>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                saved ? unsaveRecipe(recipe.id) : saveRecipe(recipe, product, mode);
              }}
              style={styles.heartBtn}
              accessibilityLabel={saved ? 'Remove from saved' : 'Save recipe'}
              accessibilityRole="button"
              accessibilityHint={saved ? 'Removes this recipe from your saved list' : 'Saves this recipe to your collection'}
            >
              <Feather
                name="heart"
                size={20}
                color={saved ? '#EF4444' : 'rgba(255,255,255,0.35)'}
              />
            </Pressable>
            <Feather
              name={isExpanded ? 'chevron-up' : 'chevron-down'}
              size={18}
              color="rgba(255,255,255,0.4)"
            />
          </View>
        </View>

        <Text style={styles.description}>{recipe.description}</Text>
      </Pressable>

      {isExpanded && (
        <View style={[styles.expandedContent, { borderTopColor: `${accentColor}30` }]}>
          <Text style={[styles.sectionTitle, { color: accentColor }]}>Ingredients</Text>
          {recipe.ingredients.map((ing, i) => (
            <View key={i} style={styles.ingredient}>
              <View style={[styles.dot, { backgroundColor: accentColor }]} />
              <Text style={styles.ingredientText}>{ing}</Text>
            </View>
          ))}

          <Text style={[styles.sectionTitle, { color: accentColor, marginTop: 16 }]}>Steps</Text>
          {recipe.steps.map((step, i) => (
            <View key={i} style={styles.step}>
              <Text style={[styles.stepNum, { color: accentColor }]}>{i + 1}</Text>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}

          <Pressable
            style={[styles.aiBtn, { backgroundColor: accentColor }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onCustomizeAI(recipe);
            }}
            accessibilityLabel="Customize this recipe with AI"
            accessibilityRole="button"
          >
            <Feather name="zap" size={15} color="#0A0A0F" />
            <Text style={styles.aiBtnText}>Customize with AI</Text>
          </Pressable>
        </View>
      )}
    </Animated.View>
  );
}

interface RecipeListProps {
  mode: AppMode;
  accentColor: string;
  product: Product;
  onBack: () => void;
  onCustomizeAI: (recipe: Recipe) => void;
}

export function RecipeList({ mode, accentColor, product, onBack, onCustomizeAI }: RecipeListProps) {
  const insets = useSafeAreaInsets();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 0) }]}>
      <View style={styles.header}>
        <Pressable
          style={styles.backBtn}
          onPress={onBack}
          accessibilityLabel="Go back to products"
          accessibilityRole="button"
        >
          <Feather name="chevron-left" size={22} color="rgba(255,255,255,0.7)" />
        </Pressable>
        <View style={styles.headerInfo}>
          <Text style={styles.emoji}>{product.emoji}</Text>
          <View>
            <Text style={styles.productName}>{product.name}</Text>
            <Text style={[styles.changeProduct, { color: accentColor }]}>Change product</Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {product.recipes.map((recipe) => (
          <RecipeCard
            key={recipe.id}
            recipe={recipe}
            product={product}
            mode={mode}
            accentColor={accentColor}
            isExpanded={expandedId === recipe.id}
            onToggle={() => setExpandedId(expandedId === recipe.id ? null : recipe.id)}
            onCustomizeAI={onCustomizeAI}
          />
        ))}
      </ScrollView>
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
    gap: 14,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  emoji: {
    fontSize: 30,
  },
  productName: {
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 18,
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  changeProduct: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 12,
    marginTop: 2,
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    gap: 14,
    paddingBottom: 130,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  cardHeaderLeft: {
    flex: 1,
    gap: 6,
  },
  cardActions: {
    alignItems: 'flex-end',
    paddingLeft: 10,
    gap: 4,
  },
  heartBtn: {
    padding: 4,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recipeName: {
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 18,
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 100,
  },
  badgeText: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 11,
    textTransform: 'capitalize',
  },
  timePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timeText: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 100,
  },
  tagText: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 11,
  },
  description: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    lineHeight: 19,
  },
  expandedContent: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
  },
  sectionTitle: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  ingredient: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 6,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginTop: 7,
  },
  ingredientText: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 14,
    color: 'rgba(255,255,255,0.75)',
    flex: 1,
  },
  step: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 10,
  },
  stepNum: {
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 18,
    lineHeight: 22,
    minWidth: 20,
  },
  stepText: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    flex: 1,
    lineHeight: 20,
  },
  aiBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 100,
    paddingVertical: 13,
    marginTop: 20,
    minHeight: 44,
  },
  aiBtnText: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 14,
    color: '#0A0A0F',
  },
});
