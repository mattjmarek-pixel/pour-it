import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';

import type { AppMode, Product, Recipe } from '@/src/data/recipes';
import { MODE_COLORS } from '@/constants/colors';
import { ScanView } from '@/components/ScanView';
import { ProductGrid } from '@/components/ProductGrid';
import { RecipeList } from '@/components/RecipeList';
import { AIPanel } from '@/components/AIPanel';
import { useMode } from '@/context/ModeContext';

type ViewState = 'scan' | 'products' | 'recipes';

interface ModeScreenProps {
  mode: AppMode;
}

export function ModeScreen({ mode }: ModeScreenProps) {
  const [view, setView] = useState<ViewState>('scan');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [aiVisible, setAiVisible] = useState(false);
  const [aiRecipe, setAiRecipe] = useState<Recipe | null>(null);
  const { pendingProduct, setPendingProduct } = useMode();

  const accentColor = MODE_COLORS[mode];

  // When the user confirms "Switch to X mode" in the cross-category warning,
  // the matched product is handed over via context. Safety: only consume it
  // if it actually belongs to THIS mode.
  useEffect(() => {
    if (pendingProduct && pendingProduct.mode === mode) {
      setSelectedProduct(pendingProduct.product);
      setSelectedCategory(null);
      setView('recipes');
      setPendingProduct(null);
    }
  }, [pendingProduct, mode, setPendingProduct]);

  const handleProductFound = (product: Product) => {
    setSelectedProduct(product);
    setView('recipes');
  };

  const handleBrowseManually = () => {
    setSelectedCategory(null);
    setView('products');
  };

  const handleProductSelected = (product: Product) => {
    setSelectedProduct(product);
    setView('recipes');
  };

  const handleBack = () => {
    if (view === 'recipes') {
      setView(selectedCategory ? 'products' : 'scan');
    } else {
      setView('scan');
      setSelectedCategory(null);
    }
  };

  const handleCustomizeAI = (recipe: Recipe) => {
    setAiRecipe(recipe);
    setAiVisible(true);
  };

  return (
    <View style={styles.container}>
      {view === 'scan' && (
        <ScanView
          mode={mode}
          accentColor={accentColor}
          onProductFound={handleProductFound}
          onBrowseManually={handleBrowseManually}
        />
      )}
      {view === 'products' && (
        <ProductGrid
          mode={mode}
          accentColor={accentColor}
          category={selectedCategory}
          onProductSelected={handleProductSelected}
          onBack={() => {
            setView('scan');
            setSelectedCategory(null);
          }}
        />
      )}
      {view === 'recipes' && selectedProduct && (
        <RecipeList
          mode={mode}
          accentColor={accentColor}
          product={selectedProduct}
          onBack={handleBack}
          onCustomizeAI={handleCustomizeAI}
        />
      )}

      <AIPanel
        visible={aiVisible}
        recipe={aiRecipe}
        accentColor={accentColor}
        onClose={() => setAiVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
});
