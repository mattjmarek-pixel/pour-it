import { PRODUCTS, CATEGORIES } from '../data/recipes';
import type { AppMode, RecipeTier } from '../data/recipes';

const MODES: AppMode[] = ['spirits', 'thc', 'mocktails'];
const VALID_TIERS: RecipeTier[] = ['classic', 'signature', 'original', 'ai'];

describe('PRODUCTS data integrity', () => {
  it('contains all 3 modes', () => {
    expect(Object.keys(PRODUCTS).sort()).toEqual(['mocktails', 'spirits', 'thc']);
  });

  it.each(MODES)('%s has exactly 12 products', (mode) => {
    expect(PRODUCTS[mode]).toHaveLength(12);
  });

  it.each(MODES)('%s products each have at least 2 recipes', (mode) => {
    for (const product of PRODUCTS[mode]) {
      expect(product.recipes.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('all product IDs are unique within each mode', () => {
    for (const mode of MODES) {
      const ids = PRODUCTS[mode].map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('every product has spiritType and flavorNotes populated', () => {
    for (const mode of MODES) {
      for (const product of PRODUCTS[mode]) {
        expect(product.spiritType.trim().length).toBeGreaterThan(0);
        expect(product.flavorNotes.length).toBeGreaterThan(0);
      }
    }
  });

  it('no recipe has an empty title', () => {
    for (const mode of MODES) {
      for (const product of PRODUCTS[mode]) {
        for (const recipe of product.recipes) {
          expect(recipe.title.trim().length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('no recipe has an empty ingredients array', () => {
    for (const mode of MODES) {
      for (const product of PRODUCTS[mode]) {
        for (const recipe of product.recipes) {
          expect(recipe.ingredients.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('every ingredient has a non-empty name', () => {
    for (const mode of MODES) {
      for (const product of PRODUCTS[mode]) {
        for (const recipe of product.recipes) {
          for (const ing of recipe.ingredients) {
            expect(ing.name.trim().length).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it('no recipe has an empty steps array', () => {
    for (const mode of MODES) {
      for (const product of PRODUCTS[mode]) {
        for (const recipe of product.recipes) {
          expect(recipe.steps.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('all recipe IDs are globally unique', () => {
    const allIds: string[] = [];
    for (const mode of MODES) {
      for (const product of PRODUCTS[mode]) {
        for (const recipe of product.recipes) {
          allIds.push(recipe.id);
        }
      }
    }
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it('all tier values are valid', () => {
    const valid = new Set<RecipeTier>(VALID_TIERS);
    for (const mode of MODES) {
      for (const product of PRODUCTS[mode]) {
        for (const recipe of product.recipes) {
          expect(valid.has(recipe.tier)).toBe(true);
        }
      }
    }
  });

  it('every product has at least one built-in recipe', () => {
    for (const mode of MODES) {
      for (const product of PRODUCTS[mode]) {
        expect(product.recipes.length).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

describe('CATEGORIES data integrity', () => {
  it.each(MODES)('%s has at least one category', (mode) => {
    expect(CATEGORIES[mode].length).toBeGreaterThan(0);
  });

  it.each(MODES)(
    'all %s product categories exist in CATEGORIES',
    (mode) => {
      const cats = new Set(CATEGORIES[mode]);
      for (const product of PRODUCTS[mode]) {
        expect(cats.has(product.category)).toBe(true);
      }
    },
  );
});
