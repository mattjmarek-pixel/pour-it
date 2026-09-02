import { isCategoryCompatible, catalogModeToProductCategory } from '@workspace/category-policy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCachedAIRecipe, setCachedAIRecipe } from '../services/recipeCache';
import {
  buildFullCatalogHints,
  getCategoryMismatchMessage,
  isNoStrongPairingResponse,
} from '../services/mixerFlow';
import { PRODUCTS } from '../data/recipes';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

describe('Mixer Compatibility & Safety Logic', () => {
  it('identifies catalog modes to product categories correctly', () => {
    expect(catalogModeToProductCategory('mocktails')).toBe('mixer');
    expect(catalogModeToProductCategory('spirits')).toBe('spirits');
    expect(catalogModeToProductCategory('thc')).toBe('thc');
  });

  it('allows mixers in all modes (compatibility)', () => {
    expect(isCategoryCompatible('spirits', 'mixer')).toBe(true);
    expect(isCategoryCompatible('thc', 'mixer')).toBe(true);
    expect(isCategoryCompatible('mocktails', 'mixer')).toBe(true);
  });

  it('blocks incompatible categories (four mismatch cases)', () => {
    expect(isCategoryCompatible('thc', 'spirits')).toBe(false);
    expect(isCategoryCompatible('mocktails', 'spirits')).toBe(false);
    expect(isCategoryCompatible('spirits', 'thc')).toBe(false);
    expect(isCategoryCompatible('mocktails', 'thc')).toBe(false);
  });

  it('sends identification hints from every product mode', () => {
    const hints = buildFullCatalogHints(PRODUCTS);
    const ids = new Set(hints.map(({ id }) => id));

    expect(ids).toContain('svedka');
    expect(ids).toContain('wynk');
    expect(ids).toContain('fevertree');
    expect(hints).toHaveLength(
      PRODUCTS.spirits.length +
        PRODUCTS.thc.length +
        PRODUCTS.mocktails.length
    );
  });
});

describe('Cache Key Builder', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('builds a cache key with mode, product id, and optional pairing id', async () => {
    await getCachedAIRecipe('prod-1', 'spirits', 'pair-1');
    expect(AsyncStorage.getItem).toHaveBeenCalledWith('ai_recipe:v1:spirits:prod-1:pair-1');
    
    await getCachedAIRecipe('prod-1', 'thc');
    expect(AsyncStorage.getItem).toHaveBeenCalledWith('ai_recipe:v1:thc:prod-1');
  });
});

describe('Wrong-mode guidance', () => {
  it.each([
    ['spirits', 'thc', 'Svedka Vodka', 'an alcoholic product', 'Spirits'],
    ['spirits', 'mocktails', 'Svedka Vodka', 'an alcoholic product', 'Spirits'],
    ['thc', 'spirits', 'Wynk Seltzer', 'a THC product', 'THC'],
    ['thc', 'mocktails', 'Wynk Seltzer', 'a THC product', 'THC'],
  ] as const)(
    'blocks %s in %s and points to the correct mode',
    (detected, current, productName, description, correctMode) => {
      const message = getCategoryMismatchMessage(
        detected,
        current,
        productName
      );
      expect(message.body).toBe(
        `${productName} looks like ${description}. Switch to ${correctMode} mode to use it.`
      );
      expect(message.detail).toContain(`choose the ${correctMode} tab`);
    }
  );
});

describe('Mixer quality outcome', () => {
  it('recognizes the quality result as a successful non-safety response', () => {
    expect(
      isNoStrongPairingResponse({
        status: 'no_strong_pairing',
        message: "We couldn't find a pairing we'd actually recommend.",
      })
    ).toBe(true);
    expect(
      isNoStrongPairingResponse({
        error: 'category_mismatch',
        message: 'Blocked by the safety gate',
      })
    ).toBe(false);
  });
});
