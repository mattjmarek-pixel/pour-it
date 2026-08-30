import type { AppMode } from '@/src/data/recipes';
import type { ProductCategory } from '@workspace/category-policy';

export type SafetyProductCategory = Exclude<ProductCategory, 'mixer'>;

const MODE_LABELS: Record<AppMode, string> = {
  spirits: 'Spirits',
  thc: 'THC',
  mocktails: 'Mocktails',
};

export function getCategoryMismatchMessage(
  detectedCategory: SafetyProductCategory,
  currentMode: AppMode,
  productName?: string
): { body: string; detail: string } {
  const item = productName || 'This item';
  const detectedDescription =
    detectedCategory === 'spirits' ? 'an alcoholic product' : 'a THC product';
  const correctMode = detectedCategory === 'spirits' ? 'Spirits' : 'THC';

  return {
    body: `${item} looks like ${detectedDescription}. Switch to ${correctMode} mode to use it.`,
    detail: `You're currently in ${MODE_LABELS[currentMode]} mode. Dismiss this message, then choose the ${correctMode} tab.`,
  };
}

export interface NoStrongPairingResponse {
  status: 'no_strong_pairing';
  message: string;
}

export function isNoStrongPairingResponse(
  value: unknown
): value is NoStrongPairingResponse {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.status === 'no_strong_pairing' &&
    typeof candidate.message === 'string'
  );
}