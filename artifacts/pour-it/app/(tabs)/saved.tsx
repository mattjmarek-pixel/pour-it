import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AIPanel } from "@/components/AIPanel";
import { EmptyState } from "@/components/EmptyState";
import { MODE_COLORS } from "@/constants/colors";
import { useSavedRecipes } from "@/context/SavedRecipesContext";
import type { Recipe } from "@/src/data/recipes";
import { safeImpact } from "@/utils/haptics";

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: "#10B981",
  medium: "#F59E0B",
  hard: "#EF4444",
};

const MODE_LABELS: Record<string, string> = {
  spirits: "Spirits",
  thc: "THC",
  mocktails: "Mocktails",
};

export default function SavedScreen() {
  const insets = useSafeAreaInsets();
  const { savedRecipes, unsaveRecipe } = useSavedRecipes();
  const [aiVisible, setAiVisible] = useState(false);
  const [aiRecipe, setAiRecipe] = useState<Recipe | null>(null);
  const [aiAccent, setAiAccent] = useState("#D4A843");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 16);

  if (savedRecipes.length === 0) {
    return (
      <View style={[styles.container, { paddingTop: topPad }]}>
        <Text style={styles.screenTitle}>Saved Recipes</Text>
        <EmptyState
          icon="🍷"
          title="No saved recipes"
          subtitle="Scan or browse to discover drinks you love"
        />
      </View>
    );
  }

  const groupedByMode = {
    spirits: savedRecipes.filter((s) => s.mode === "spirits"),
    thc: savedRecipes.filter((s) => s.mode === "thc"),
    mocktails: savedRecipes.filter((s) => s.mode === "mocktails"),
  };

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <Text style={styles.screenTitle}>Saved Recipes</Text>
      <Text style={styles.screenSubtitle}>{savedRecipes.length} saved</Text>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 100) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {(["spirits", "thc", "mocktails"] as const).map((mode) => {
          const items = groupedByMode[mode];
          if (items.length === 0) return null;
          const accent = MODE_COLORS[mode];

          return (
            <View key={mode} style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={[styles.accentDot, { backgroundColor: accent }]} />
                <Text style={[styles.sectionTitle, { color: accent }]}>
                  {MODE_LABELS[mode]}
                </Text>
                <Text style={styles.sectionCount}>{items.length}</Text>
              </View>

              {items.map(({ recipe, product }) => {
                const isExpanded = expandedId === recipe.id;
                return (
                  <Pressable
                    key={recipe.id}
                    style={[
                      styles.card,
                      { borderColor: isExpanded ? accent : "rgba(255,255,255,0.10)" },
                    ]}
                    onPress={() =>
                      setExpandedId(isExpanded ? null : recipe.id)
                    }
                  >
                    <View style={styles.cardTop}>
                      <View style={styles.cardInfo}>
                        <Text style={styles.emoji}>{product.emoji}</Text>
                        <View style={styles.cardText}>
                          <Text style={styles.recipeName} numberOfLines={1}>
                            {recipe.name}
                          </Text>
                          <Text style={styles.productName} numberOfLines={1}>
                            {product.name}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.cardRight}>
                        <Pressable
                          onPress={() => {
                            safeImpact(Haptics.ImpactFeedbackStyle.Light);
                            unsaveRecipe(recipe.id);
                          }}
                          style={styles.unsaveBtn}
                        >
                          <Feather name="heart" size={17} color="#EF4444" />
                        </Pressable>
                        <View
                          style={[
                            styles.diffBadge,
                            {
                              backgroundColor: `${DIFFICULTY_COLORS[recipe.difficulty]}22`,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.diffText,
                              { color: DIFFICULTY_COLORS[recipe.difficulty] },
                            ]}
                          >
                            {recipe.difficulty}
                          </Text>
                        </View>
                      </View>
                    </View>

                    {isExpanded && (
                      <View style={[styles.expandedArea, { borderTopColor: `${accent}30` }]}>
                        <View style={styles.tags}>
                          {recipe.tags.map((tag) => (
                            <View
                              key={tag}
                              style={[
                                styles.tag,
                                { backgroundColor: `${accent}18` },
                              ]}
                            >
                              <Text style={[styles.tagText, { color: accent }]}>
                                {tag}
                              </Text>
                            </View>
                          ))}
                        </View>
                        <Text style={styles.description}>{recipe.description}</Text>
                        <Pressable
                          style={[styles.aiBtn, { backgroundColor: accent }]}
                          onPress={() => {
                            safeImpact(Haptics.ImpactFeedbackStyle.Medium);
                            setAiRecipe(recipe);
                            setAiAccent(accent);
                            setAiVisible(true);
                          }}
                        >
                          <Feather name="zap" size={13} color="#0A0A0F" />
                          <Text style={styles.aiBtnText}>Customize with AI</Text>
                        </Pressable>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          );
        })}
      </ScrollView>

      <AIPanel
        visible={aiVisible}
        recipe={aiRecipe}
        accentColor={aiAccent}
        onClose={() => setAiVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0A0A0F",
    paddingHorizontal: 20,
  },
  screenTitle: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 30,
    color: "#FFFFFF",
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  screenSubtitle: {
    fontFamily: "DMSans_400Regular",
    fontSize: 14,
    color: "rgba(255,255,255,0.35)",
    marginBottom: 20,
  },
  scroll: { flex: 1 },
  scrollContent: { gap: 24 },
  section: { gap: 10 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  accentDot: { width: 8, height: 8, borderRadius: 4 },
  sectionTitle: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 1,
    flex: 1,
  },
  sectionCount: {
    fontFamily: "DMSans_400Regular",
    fontSize: 12,
    color: "rgba(255,255,255,0.3)",
  },
  card: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  emoji: { fontSize: 26 },
  cardText: { flex: 1 },
  recipeName: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 16,
    color: "#FFFFFF",
    letterSpacing: -0.2,
  },
  productName: {
    fontFamily: "DMSans_400Regular",
    fontSize: 12,
    color: "rgba(255,255,255,0.4)",
    marginTop: 2,
  },
  cardRight: {
    alignItems: "flex-end",
    gap: 6,
  },
  unsaveBtn: {
    padding: 4,
  },
  diffBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 100,
  },
  diffText: {
    fontFamily: "DMSans_500Medium",
    fontSize: 10,
    textTransform: "capitalize",
  },
  expandedArea: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    gap: 10,
  },
  tags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 100,
  },
  tagText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 11,
  },
  description: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
    color: "rgba(255,255,255,0.5)",
    lineHeight: 19,
  },
  aiBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 100,
    paddingVertical: 11,
    marginTop: 4,
  },
  aiBtnText: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 13,
    color: "#0A0A0F",
  },
});
