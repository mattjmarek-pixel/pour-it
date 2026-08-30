import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Recipe } from '@/src/data/recipes';

const CACHE_VERSION = 'v1';
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface CachedRecipe {
  recipe: Recipe;
  cachedAt: number;
}

function cacheKey(productId: string, mode: string, pairingId?: string): string {
  return `ai_recipe:${CACHE_VERSION}:${mode}:${productId}${pairingId ? `:${pairingId}` : ''}`;
}

export async function getCachedAIRecipe(productId: string, mode: string, pairingId?: string): Promise<Recipe | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(productId, mode, pairingId));
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedRecipe;
    if (Date.now() - cached.cachedAt > TTL_MS) {
      await AsyncStorage.removeItem(cacheKey(productId, mode, pairingId));
      return null;
    }
    return cached.recipe;
  } catch {
    return null;
  }
}

export async function setCachedAIRecipe(productId: string, mode: string, recipe: Recipe, pairingId?: string): Promise<void> {
  try {
    const cached: CachedRecipe = { recipe, cachedAt: Date.now() };
    await AsyncStorage.setItem(cacheKey(productId, mode, pairingId), JSON.stringify(cached));
  } catch {}
}
