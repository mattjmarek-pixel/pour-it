import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Product } from '@/src/data/recipes';
import {
  getMyBarIdentity,
  getMyBarItems,
  upsertMyBarProduct,
} from '@/src/services/myBarStorage';

const storage = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn((key: string) => Promise.resolve(storage.get(key) ?? null)),
  setItem: jest.fn((key: string, value: string) => {
    storage.set(key, value);
    return Promise.resolve();
  }),
}));

const bottle: Pick<Product, 'name' | 'brand' | 'category'> = {
  name: 'Svedka Vodka',
  brand: 'Svedka',
  category: 'Vodka',
};

describe('My Bar local storage', () => {
  beforeEach(() => {
    storage.clear();
    jest.clearAllMocks();
  });

  it('uses normalized product identity instead of transient AI product IDs', () => {
    expect(getMyBarIdentity(bottle)).toBe('svedka|svedka vodka|vodka');
    expect(
      getMyBarIdentity({
        name: '  SVEDKA   VODKA ',
        brand: 'SVEDKA',
        category: 'vodka',
      })
    ).toBe('svedka|svedka vodka|vodka');
  });

  it('stores successful scans newest first', async () => {
    await upsertMyBarProduct(bottle, 'spirits', 100);
    await upsertMyBarProduct(
      { name: 'Cann Social Tonic', brand: 'Cann', category: 'Tonics' },
      'thc',
      200
    );

    const items = await getMyBarItems();
    expect(items.map((item) => item.name)).toEqual(['Cann Social Tonic', 'Svedka Vodka']);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('my_bar:v1', expect.any(String));
  });

  it('updates last scanned rather than duplicating a product', async () => {
    await upsertMyBarProduct(bottle, 'spirits', 100);
    await upsertMyBarProduct(bottle, 'spirits', 300);

    const items = await getMyBarItems();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      name: 'Svedka Vodka',
      mode: 'spirits',
      lastScannedAt: 300,
    });
  });

  it('returns an empty list for missing or malformed local data', async () => {
    expect(await getMyBarItems()).toEqual([]);
    storage.set('my_bar:v1', 'not-json');
    expect(await getMyBarItems()).toEqual([]);
  });
});