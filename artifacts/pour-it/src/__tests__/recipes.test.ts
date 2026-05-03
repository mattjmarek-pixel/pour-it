import { PRODUCTS, CATEGORIES } from '../data/recipes';
import type { AppMode } from '../data/recipes';

const MODES: AppMode[] = ['spirits', 'thc', 'mocktails'];

describe('PRODUCTS data integrity', () => {
  it('contains all 3 modes', () => {
    expect(Object.keys(PRODUCTS).sort()).toEqual(['mocktails', 'spirits', 'thc']);
  });

  it.each(MODES)('%s has exactly 6 products', (mode) => {
    expect(PRODUCTS[mode]).toHaveLength(6);
  });

  it.each(MODES)('%s products each have exactly 3 recipes', (mode) => {
    for (const product of PRODUCTS[mode]) {
      expect(product.recipes).toHaveLength(3);
    }
  });

  it('all product IDs are unique within each mode', () => {
    for (const mode of MODES) {
      const ids = PRODUCTS[mode].map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('no recipe has an empty name', () => {
    for (const mode of MODES) {
      for (const product of PRODUCTS[mode]) {
        for (const recipe of product.recipes) {
          expect(recipe.name.trim().length).toBeGreaterThan(0);
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

  it('all difficulty values are valid', () => {
    const valid = new Set(['easy', 'medium', 'hard']);
    for (const mode of MODES) {
      for (const product of PRODUCTS[mode]) {
        for (const recipe of product.recipes) {
          expect(valid.has(recipe.difficulty)).toBe(true);
        }
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
