export type CatalogMode = "spirits" | "thc" | "mocktails";

interface CatalogEntry {
  name: string;
  mode: CatalogMode;
}

/**
 * Server-side product catalog used to enforce category/mode integrity.
 * Mirrors artifacts/pour-it/src/data/recipes.ts (PRODUCTS). If products are
 * added or moved between modes in the mobile catalog, update this map too.
 */
export const CATALOG: Record<string, CatalogEntry> = {
  svedka: { name: "Svedka Vodka", mode: "spirits" },
  captain: { name: "Captain Morgan", mode: "spirits" },
  tanqueray: { name: "Tanqueray Gin", mode: "spirits" },
  cuervo: { name: "Jose Cuervo", mode: "spirits" },
  bulleit: { name: "Bulleit Bourbon", mode: "spirits" },
  bacardi: { name: "Bacardi Rum", mode: "spirits" },
  "grey-goose": { name: "Grey Goose Vodka", mode: "spirits" },
  hendricks: { name: "Hendrick's Gin", mode: "spirits" },
  diplomatico: { name: "Diplomático Reserva", mode: "spirits" },
  "don-julio": { name: "Don Julio Blanco", mode: "spirits" },
  makers: { name: "Maker's Mark", mode: "spirits" },
  "monkey-shoulder": { name: "Monkey Shoulder", mode: "spirits" },
  wynk: { name: "Wynk Seltzer", mode: "thc" },
  cann: { name: "Cann Social Tonic", mode: "thc" },
  "delta9-syrup": { name: "Delta 9 Syrup", mode: "thc" },
  kiva: { name: "Kiva Camino Drops", mode: "thc" },
  keef: { name: "Keef Sparkling", mode: "thc" },
  olala: { name: "Olala Soda", mode: "thc" },
  "cycling-frog": { name: "Cycling Frog THC Seltzer", mode: "thc" },
  artet: { name: "Artet Cannabis Aperitif", mode: "thc" },
  wunder: { name: "Wunder Higher Vibes", mode: "thc" },
  pamos: { name: "Pamos THC Sparkling", mode: "thc" },
  sunmed: { name: "Sunmed CBD Drops", mode: "thc" },
  "mad-lilly": { name: "Mad Lilly Syrups", mode: "thc" },
  seedlip: { name: "Seedlip Spice 94", mode: "mocktails" },
  fevertree: { name: "Fever-Tree Mixers", mode: "mocktails" },
  lyres: { name: "Lyre's Spirits", mode: "mocktails" },
  monin: { name: "Monin Syrup", mode: "mocktails" },
  "fresh-juices": { name: "Fresh Pressed Juices", mode: "mocktails" },
  sparkling: { name: "Sparkling Water", mode: "mocktails" },
  ritual: { name: "Ritual Zero Proof Whiskey", mode: "mocktails" },
  aplos: { name: "Aplós Arise", mode: "mocktails" },
  "free-spirits": { name: "Free Spirits Bourbon", mode: "mocktails" },
  ghia: { name: "Ghia Apéritif", mode: "mocktails" },
  proxies: { name: "Proxies Wine Alternative", mode: "mocktails" },
  kin: { name: "Kin Euphorics", mode: "mocktails" },
};

/**
 * Aggressive normalization so spacing/punctuation/diacritic tweaks
 * ("Wynk-Seltzer!", "wynk  seltzer") cannot evade the safety check.
 */
export function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const NAME_INDEX: Record<string, CatalogEntry> = Object.fromEntries(
  Object.values(CATALOG).map((entry) => [normalizeName(entry.name), entry])
);

export function lookupCatalogById(productId: string): CatalogEntry | null {
  return CATALOG[productId] ?? null;
}

/**
 * Fuzzy, safety-oriented lookup: exact normalized match, or the normalized
 * catalog name contained inside the normalized input (catches
 * "Wynk Seltzer 4-pack Black Cherry" style variations).
 */
export function lookupCatalogByName(productName: string): CatalogEntry | null {
  const normalized = normalizeName(productName);
  if (!normalized) return null;
  const exact = NAME_INDEX[normalized];
  if (exact) return exact;
  for (const [key, entry] of Object.entries(NAME_INDEX)) {
    if (key.length >= 6 && normalized.includes(key)) return entry;
  }
  return null;
}
