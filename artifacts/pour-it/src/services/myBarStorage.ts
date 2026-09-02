import AsyncStorage from '@react-native-async-storage/async-storage';

import type { AppMode, Product } from '@/src/data/recipes';

const STORAGE_VERSION = 'v1';
const STORAGE_KEY = `my_bar:${STORAGE_VERSION}`;

export interface MyBarItem {
  identity: string;
  name: string;
  brand: string;
  category: string;
  mode: AppMode;
  lastScannedAt: number;
}

let writeQueue: Promise<void> = Promise.resolve();

function normalizeIdentityPart(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function getMyBarIdentity(product: Pick<Product, 'name' | 'brand' | 'category'>): string {
  return [
    normalizeIdentityPart(product.brand),
    normalizeIdentityPart(product.name),
    normalizeIdentityPart(product.category),
  ].join('|');
}

export async function getMyBarItems(): Promise<MyBarItem[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return (parsed as MyBarItem[])
      .filter(
        (item) =>
          typeof item?.identity === 'string' &&
          typeof item?.name === 'string' &&
          typeof item?.brand === 'string' &&
          typeof item?.category === 'string' &&
          (item?.mode === 'spirits' || item?.mode === 'thc' || item?.mode === 'mocktails') &&
          typeof item?.lastScannedAt === 'number'
      )
      .sort((a, b) => b.lastScannedAt - a.lastScannedAt);
  } catch {
    return [];
  }
}

export function upsertMyBarProduct(
  product: Pick<Product, 'name' | 'brand' | 'category'>,
  mode: AppMode,
  scannedAt = Date.now()
): Promise<void> {
  writeQueue = writeQueue.then(async () => {
    try {
      const identity = getMyBarIdentity(product);
      const existing = await getMyBarItems();
      const nextItem: MyBarItem = {
        identity,
        name: product.name,
        brand: product.brand,
        category: product.category,
        mode,
        lastScannedAt: scannedAt,
      };
      const next = [
        nextItem,
        ...existing.filter((item) => item.identity !== identity),
      ].sort((a, b) => b.lastScannedAt - a.lastScannedAt);

      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // My Bar is optional local history; storage failures must not block scanning.
    }
  });

  return writeQueue;
}

// Device-only today. This storage boundary can later migrate local records into
// account-based sync without coupling My Bar to scanning or safety enforcement.