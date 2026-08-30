export const APP_MODES = ["spirits", "thc", "mocktails"] as const;
export const PRODUCT_CATEGORIES = ["spirits", "thc", "mixer"] as const;

export type AppMode = (typeof APP_MODES)[number];
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export function isAppMode(value: unknown): value is AppMode {
  return typeof value === "string" && (APP_MODES as readonly string[]).includes(value);
}

export function isProductCategory(value: unknown): value is ProductCategory {
  return typeof value === "string" && (PRODUCT_CATEGORIES as readonly string[]).includes(value);
}

/** Returns false for every unknown value: callers must never default a category. */
export function isCategoryCompatible(
  mode: unknown,
  productCategory: unknown,
): mode is AppMode {
  if (!isAppMode(mode) || !isProductCategory(productCategory)) return false;
  return productCategory === "mixer" || productCategory === mode;
}

/** Catalog mocktail entries are safe non-alcoholic beverage/mixer products. */
export function catalogModeToProductCategory(mode: unknown): ProductCategory | null {
  if (!isAppMode(mode)) return null;
  return mode === "mocktails" ? "mixer" : mode;
}