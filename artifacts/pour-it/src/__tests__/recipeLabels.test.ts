import { PRODUCTS } from '../data/recipes';
import { migrateSavedRecipe } from '../services/savedRecipesMigration';

// Explicit product requirements, deliberately independent of catalog tiers.
const CLASSIC = [
  'Vodka Martini', 'Moscow Mule', 'Rum & Cola', 'Negroni', 'Clover Club',
  'Classic Margarita', 'Paloma', 'Tequila Sunrise', 'Old Fashioned', 'Whiskey Sour',
  'Mint Julep', 'Classic Daiquiri', 'Mojito', 'Pina Colada', 'Rum Old Fashioned',
  'Jungle Bird', "Tommy's Margarita", 'Manhattan', 'Paper Plane', 'Scotch Highball',
  'Penicillin', "Lyre's Dry Martini", "Lyre's Amaretto Sour", "Lyre's Espresso Martini",
  'Zero Proof Old Fashioned', 'Zero Proof Whiskey Sour', 'Zero Proof Manhattan',
  'Zero Proof Mint Julep', 'Seedlip Negroni', 'Virgin Mojito',
];
const SIGNATURE = [
  'Le Fizz', "Hendrick's Gin & Tonic", 'Seedlip Spice & Tonic', 'Ghia Spritz',
];
const recipes = Object.values(PRODUCTS).flatMap(products => products.flatMap(p => p.recipes));
const titleKey = (title: string) => title === 'Piña Colada' ? 'Pina Colada' : title;

describe('built-in recipe label assignments', () => {
  it('contains every required CLASSIC and SIGNATURE title, including both duplicated classics', () => {
    const titles = recipes.map(r => titleKey(r.title));
    for (const title of [...CLASSIC, ...SIGNATURE]) expect(titles).toContain(title);
    for (const title of ['Vodka Martini', 'Paloma']) {
      expect(titles.filter(t => t === title)).toHaveLength(2);
    }
  });
  it.each(recipes.map(r => [r.title, r] as const))('assigns the required tier to %s', (_title, recipe) => {
    const title = titleKey(recipe.title);
    const expected = CLASSIC.includes(title) ? 'classic' : SIGNATURE.includes(title) ? 'signature' : 'original';
    expect(recipe.tier).toBe(expected);
  });
  it('has no built-in AI creations and makes every THC recipe original', () => {
    expect(recipes.some(r => r.tier === 'ai')).toBe(false);
    for (const product of PRODUCTS.thc) for (const recipe of product.recipes) {
      expect(recipe.tier).toBe('original');
    }
  });
});

describe('recipe ingredient corrections', () => {
  it('uses only explicitly non-alcoholic bitters in Mocktails', () => {
    for (const product of PRODUCTS.mocktails) for (const recipe of product.recipes) {
      for (const ingredient of recipe.ingredients) if (/bitters/i.test(ingredient.name)) {
        expect(ingredient.name.toLowerCase()).toContain('non-alcoholic');
      }
    }
  });
  it('never measures rose water or orange flower water in oz', () => {
    for (const recipe of recipes) for (const ingredient of recipe.ingredients) {
      if (/rose water|orange flower water/i.test(ingredient.name)) {
        expect(ingredient.unit.toLowerCase()).not.toBe('oz');
      }
    }
  });
  it.each([
    ['Piña Colada', 'Bacardi Superior', '2', 'oz'],
    ['Raspberry Rose Sparkle', 'rose water', '2', 'dashes'],
    ['Raspberry Rose Sparkle', 'simple syrup', '0.5', 'oz'],
    ['Zero Proof Old Fashioned', 'non-alcoholic aromatic bitters', '2', 'dashes'],
    ['Zero Proof Manhattan', 'non-alcoholic aromatic bitters', '2', 'dashes'],
    ['Seedlip Negroni', "Lyre's Aperitif Rosso (non-alcoholic sweet vermouth)", '1', 'oz'],
    ['Sunrise Refresher', 'fresh ginger juice', '0.25', 'oz'],
    ['Passion Fruit Fizz', 'Monin Passion Fruit Syrup', '0.75', 'oz'],
    ['Hibiscus Rose Cooler', 'Monin Hibiscus Syrup', '0.75', 'oz'],
    ['Hibiscus Rose Cooler', 'Monin Rose Syrup', '0.25', 'oz'],
    ['Hibiscus Rose Cooler', 'fresh lime juice', '0.5', 'oz'],
    ['Elderflower Fizz', 'elderflower cordial', '0.5', 'oz'],
    ['Elderflower Fizz', 'fresh lemon juice', '0.5', 'oz'],
    ['Italian Mineral Spritz', 'Sprig fresh rosemary', '', ''],
    ['Ghia Spritz', 'Rosemary sprig and orange zest', '', ''],
  ])('%s includes corrected %s', (title, name, amount, unit) => {
    expect(recipes.find(r => r.title === title)?.ingredients).toContainEqual({ name, amount, unit });
  });
  it.each([
    ['Raspberry Rose Sparkle', 'Muddle raspberries with simple syrup in glass.'],
    ['Hibiscus Rose Cooler', 'Combine syrups and fresh lime juice in glass over ice.'],
    ['Elderflower Fizz', 'Add elderflower cordial and fresh lemon juice.'],
    ['Italian Mineral Spritz', 'Squeeze lemon, add rosemary.'],
    ['Ghia Spritz', 'Garnish with rosemary sprig and orange zest.'],
    ['Mint Julep', 'Garnish with mint sprig.'],
    ['Kin Evening Spritz', 'Fill a wine glass with ice.'],
  ])('%s has the corrected step', (title, step) => {
    expect(recipes.find(r => r.title === title)?.steps).toContain(step);
  });
});

describe('saved tier migration without recipe loss', () => {
  const saved = (id: string, tier: string) => ({
    recipe: { id, title: 'Old title', tier, description: 'My description',
      ingredients: [{ name: 'My ingredient', amount: '1', unit: 'oz' }],
      steps: ['My step'], tags: ['My tag'] },
    product: { id: 'saved-product', name: 'My product' }, mode: 'spirits', savedAt: 12345,
  });
  it.each(['canonical', 'craft', 'ai'])('refreshes matching built-in titles/tiers from old %s saves without losing content', tier => {
    const inputs = recipes.map(recipe => saved(recipe.id, tier));
    const results = inputs.map(migrateSavedRecipe).filter(Boolean);
    expect(results).toHaveLength(inputs.length);
    results.forEach((result, index) => {
      expect(result?.recipe).toEqual({
        ...inputs[index].recipe, title: recipes[index].title, tier: recipes[index].tier,
      });
      expect(result?.savedAt).toBe(12345);
      expect(result?.product.id).toBe('saved-product');
    });
  });
  it.each(['canonical', 'craft'])('retains unmatched %s saves as original', tier => {
    const input = saved('not-in-catalog', tier);
    expect(migrateSavedRecipe(input)?.recipe).toEqual({ ...input.recipe, tier: 'original' });
  });
  it('retains unmatched live AI creations as ai with their title and content', () => {
    const input = saved('ai-custom-recipe', 'ai');
    expect(migrateSavedRecipe(input)?.recipe).toEqual(input.recipe);
  });
  it.each(['classic', 'signature', 'original'])('preserves unmatched new-tier %s saves', tier => {
    const input = saved('custom-recipe', tier);
    expect(migrateSavedRecipe(input)?.recipe).toEqual(input.recipe);
  });
  it('keeps a mixed saved collection intact and is idempotent', () => {
    const inputs = [
      saved(recipes[0].id, 'canonical'), saved(recipes[1].id, 'ai'),
      saved('custom-canonical', 'canonical'), saved('custom-craft', 'craft'),
      saved('ai-custom', 'ai'),
    ];
    const migrated = inputs.map(migrateSavedRecipe).filter(Boolean);
    expect(migrated).toHaveLength(inputs.length);
    expect(migrated.map(s => s?.recipe.id)).toEqual(inputs.map(s => s.recipe.id));
    expect(migrated.map(migrateSavedRecipe)).toEqual(migrated);
  });
});
