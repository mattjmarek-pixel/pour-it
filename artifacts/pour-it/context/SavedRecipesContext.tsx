import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Recipe, Product, AppMode } from '@/src/data/recipes';
import { migrateSavedRecipe } from '@/src/services/savedRecipesMigration';

export interface SavedRecipe {
  recipe: Recipe;
  product: Product;
  mode: AppMode;
  savedAt: number;
}

interface SavedRecipesContextValue {
  savedRecipes: SavedRecipe[];
  saveRecipe: (recipe: Recipe, product: Product, mode: AppMode) => void;
  unsaveRecipe: (recipeId: string) => void;
  isRecipeSaved: (recipeId: string) => boolean;
}

const SavedRecipesContext = createContext<SavedRecipesContextValue>({
  savedRecipes: [],
  saveRecipe: () => {},
  unsaveRecipe: () => {},
  isRecipeSaved: () => false,
});

const STORAGE_KEY = '@pourit_saved_recipes';

export function SavedRecipesProvider({ children }: { children: React.ReactNode }) {
  const [savedRecipes, setSavedRecipes] = useState<SavedRecipe[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((data) => {
      if (!data) return;
      try {
        const parsed: unknown = JSON.parse(data);
        if (!Array.isArray(parsed)) return;
        const migrated = parsed
          .map(migrateSavedRecipe)
          .filter((s): s is SavedRecipe => s !== null);
        setSavedRecipes(migrated);
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(migrated)).catch(() => {});
      } catch {}
    });
  }, []);

  const persist = (recipes: SavedRecipe[]) => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(recipes));
  };

  const saveRecipe = (recipe: Recipe, product: Product, mode: AppMode) => {
    const newSaved: SavedRecipe = { recipe, product, mode, savedAt: Date.now() };
    setSavedRecipes((prev) => {
      const updated = [newSaved, ...prev.filter((s) => s.recipe.id !== recipe.id)];
      persist(updated);
      return updated;
    });
  };

  const unsaveRecipe = (recipeId: string) => {
    setSavedRecipes((prev) => {
      const updated = prev.filter((s) => s.recipe.id !== recipeId);
      persist(updated);
      return updated;
    });
  };

  const isRecipeSaved = (recipeId: string) =>
    savedRecipes.some((s) => s.recipe.id === recipeId);

  return (
    <SavedRecipesContext.Provider value={{ savedRecipes, saveRecipe, unsaveRecipe, isRecipeSaved }}>
      {children}
    </SavedRecipesContext.Provider>
  );
}

export function useSavedRecipes() {
  return useContext(SavedRecipesContext);
}
