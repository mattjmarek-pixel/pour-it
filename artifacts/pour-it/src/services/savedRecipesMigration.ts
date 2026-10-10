import type {
  Recipe,
  RecipeIngredient,
  RecipeTier,
  Product,
  AppMode,
} from '@/src/data/recipes';
import { PRODUCTS } from '@/src/data/recipes';

export interface SavedRecipeShape {
  recipe: Recipe;
  product: Product;
  mode: AppMode;
  savedAt: number;
}

const VALID_TIERS: ReadonlySet<RecipeTier> = new Set(['classic', 'signature', 'original', 'ai']);
const BUILT_IN_RECIPES = new Map(
  Object.values(PRODUCTS).flatMap(products =>
    products.flatMap(product => product.recipes.map(recipe => [recipe.id, recipe] as const))),
);

export function parseLegacyIngredient(raw: unknown): RecipeIngredient | null {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const m = trimmed.match(
      /^(\S+)\s+(oz|ml|cl|tsp|tbsp|cup|dash|dashes|drops?|dropper|cans?|scoops?)\s+(.+)$/i,
    );
    if (m) {
      return { amount: m[1], unit: m[2].toLowerCase(), name: m[3].trim() };
    }
    return { amount: '', unit: '', name: trimmed };
  }
  if (typeof raw === 'object') {
    const obj = raw as Partial<RecipeIngredient> & { name?: unknown };
    const name = typeof obj.name === 'string' ? obj.name.trim() : '';
    if (!name) return null;
    return {
      amount: typeof obj.amount === 'string' ? obj.amount : '',
      unit: typeof obj.unit === 'string' ? obj.unit : '',
      name,
    };
  }
  return null;
}

export function migrateRecipe(raw: unknown): Recipe | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || !r.id) return null;

  const builtIn = BUILT_IN_RECIPES.get(r.id);
  const title = builtIn?.title ||
    (typeof r.title === 'string' && r.title) ||
    (typeof r.name === 'string' && r.name) ||
    'Untitled';
  const description = typeof r.description === 'string' ? r.description : '';
  // Built-in identity wins over stale labels, including formerly AI-labeled
  // catalog recipes. Unmatched canonical/craft saves become original.
  const tier: RecipeTier = builtIn?.tier ?? (
    typeof r.tier === 'string' && VALID_TIERS.has(r.tier as RecipeTier)
      ? (r.tier as RecipeTier)
      : 'original');

  const ingredients: RecipeIngredient[] = Array.isArray(r.ingredients)
    ? (r.ingredients.map(parseLegacyIngredient).filter(Boolean) as RecipeIngredient[])
    : [];
  const steps: string[] = Array.isArray(r.steps)
    ? r.steps.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    : [];
  const tags: string[] = Array.isArray(r.tags)
    ? r.tags.filter((t): t is string => typeof t === 'string')
    : [];

  return { id: r.id, title, description, tier, ingredients, steps, tags };
}

export function migrateProduct(raw: unknown): Product | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.id !== 'string' || !p.id) return null;
  return {
    id: p.id,
    name: typeof p.name === 'string' ? p.name : '',
    brand: typeof p.brand === 'string' ? p.brand : '',
    emoji: typeof p.emoji === 'string' ? p.emoji : '🍹',
    category: typeof p.category === 'string' ? p.category : '',
    spiritType: typeof p.spiritType === 'string' ? p.spiritType : '',
    flavorNotes: Array.isArray(p.flavorNotes)
      ? p.flavorNotes.filter((n): n is string => typeof n === 'string')
      : [],
    barcodes: Array.isArray(p.barcodes)
      ? p.barcodes.filter((b): b is string => typeof b === 'string')
      : undefined,
    recipes: [],
  };
}

export function migrateSavedRecipe(raw: unknown): SavedRecipeShape | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  const recipe = migrateRecipe(s.recipe);
  const product = migrateProduct(s.product);
  const mode = s.mode;
  if (!recipe || !product) return null;
  if (mode !== 'spirits' && mode !== 'thc' && mode !== 'mocktails') return null;
  const savedAt = typeof s.savedAt === 'number' ? s.savedAt : Date.now();
  return { recipe, product, mode, savedAt };
}
