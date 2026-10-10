import {
  migrateSavedRecipe,
  migrateRecipe,
  parseLegacyIngredient,
} from '../services/savedRecipesMigration';

describe('parseLegacyIngredient', () => {
  it('parses a measured string', () => {
    expect(parseLegacyIngredient('2 oz Svedka Vodka')).toEqual({
      amount: '2',
      unit: 'oz',
      name: 'Svedka Vodka',
    });
  });

  it('handles unmeasured garnish strings', () => {
    expect(parseLegacyIngredient('Lime wedge')).toEqual({
      amount: '',
      unit: '',
      name: 'Lime wedge',
    });
  });

  it('passes through already-structured objects', () => {
    expect(parseLegacyIngredient({ amount: '1', unit: 'oz', name: 'lime juice' })).toEqual({
      amount: '1',
      unit: 'oz',
      name: 'lime juice',
    });
  });

  it('returns null for empty/invalid inputs', () => {
    expect(parseLegacyIngredient('')).toBeNull();
    expect(parseLegacyIngredient(null)).toBeNull();
    expect(parseLegacyIngredient({})).toBeNull();
  });
});

describe('migrateRecipe', () => {
  it('migrates legacy recipe (name + difficulty + string ingredients) into new shape', () => {
    const legacy = {
      id: 'svedka-1',
      name: 'Golden Sunset Mule',
      difficulty: 'easy',
      time: '5 min',
      tags: ['refreshing'],
      ingredients: ['2 oz Svedka Vodka', 'Lime wheel'],
      steps: ['Pour over ice.'],
      description: 'A crisp twist.',
    };
    const migrated = migrateRecipe(legacy);
    expect(migrated).toBeTruthy();
    expect(migrated?.title).toBe('Golden Sunset Mule');
    expect(migrated?.tier).toBe('original');
    expect(migrated?.ingredients).toEqual([
      { amount: '2', unit: 'oz', name: 'Svedka Vodka' },
      { amount: '', unit: '', name: 'Lime wheel' },
    ]);
    expect(migrated?.steps).toEqual(['Pour over ice.']);
    expect(migrated?.tags).toEqual(['refreshing']);
  });

  it('keeps a valid new-shape recipe untouched', () => {
    const modern = {
      id: 'r1',
      title: 'New Recipe',
      description: 'Tasty',
      tier: 'classic',
      ingredients: [{ amount: '1', unit: 'oz', name: 'gin' }],
      steps: ['Stir.'],
      tags: ['classic'],
    };
    const migrated = migrateRecipe(modern);
    expect(migrated?.title).toBe('New Recipe');
    expect(migrated?.tier).toBe('classic');
  });

  it('rejects recipes without an id', () => {
    expect(migrateRecipe({ name: 'No ID' })).toBeNull();
  });
});

describe('migrateSavedRecipe', () => {
  it('migrates a legacy saved-recipe blob end-to-end', () => {
    const legacy = {
      recipe: {
        id: 'svedka-1',
        name: 'Old Recipe',
        difficulty: 'easy',
        ingredients: ['2 oz vodka'],
        steps: ['Shake'],
        tags: ['classic'],
        description: 'desc',
      },
      product: { id: 'svedka', name: 'Svedka', brand: 'Svedka', emoji: '🍸', category: 'Vodka' },
      mode: 'spirits',
      savedAt: 1700000000000,
    };
    const migrated = migrateSavedRecipe(legacy);
    expect(migrated).toBeTruthy();
    expect(migrated?.recipe.title).toBe('Old Recipe');
    expect(migrated?.recipe.tier).toBe('original');
    expect(migrated?.product.spiritType).toBe('');
    expect(migrated?.product.flavorNotes).toEqual([]);
    expect(migrated?.mode).toBe('spirits');
  });

  it('rejects entries with invalid mode', () => {
    const bad = {
      recipe: { id: 'r1', name: 'x' },
      product: { id: 'p1' },
      mode: 'invalid',
    };
    expect(migrateSavedRecipe(bad)).toBeNull();
  });
});
