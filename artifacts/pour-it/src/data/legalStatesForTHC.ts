/**
 * US jurisdictions where recreational cannabis is legal.
 *
 * Last reviewed: August 2026. State laws change — update this list as needed.
 * Structured so medical-only states can be added later without touching the
 * gating logic (see `THC_LEGAL_STATUS`).
 */

export type ThcLegality = 'recreational' | 'medical' | 'illegal';

/**
 * Two-letter USPS abbreviations → legality.
 * Only 'recreational' entries unlock the THC tab today; the map exists so a
 * future policy change (e.g. allowing medical states) is a one-line edit in
 * `isThcLegalIn` rather than a data migration.
 */
export const THC_LEGAL_STATUS: Record<string, ThcLegality> = {
  AK: 'recreational',
  AZ: 'recreational',
  CA: 'recreational',
  CO: 'recreational',
  CT: 'recreational',
  DC: 'recreational',
  DE: 'recreational',
  IL: 'recreational',
  MA: 'recreational',
  MD: 'recreational',
  ME: 'recreational',
  MI: 'recreational',
  MN: 'recreational',
  MO: 'recreational',
  MT: 'recreational',
  NJ: 'recreational',
  NM: 'recreational',
  NV: 'recreational',
  NY: 'recreational',
  OH: 'recreational',
  OR: 'recreational',
  RI: 'recreational',
  VA: 'recreational',
  VT: 'recreational',
  WA: 'recreational',
};

/** True when THC features may be enabled for the given state abbreviation. */
export function isThcLegalIn(stateAbbr: string | null | undefined): boolean {
  if (!stateAbbr) return false; // fail closed
  return THC_LEGAL_STATUS[stateAbbr.toUpperCase()] === 'recreational';
}

/** Full state name (lowercased) → USPS abbreviation, for reverse-geocode results. */
export const STATE_NAME_TO_ABBR: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', 'district of columbia': 'DC',
  florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL',
  indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA',
  maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI',
  minnesota: 'MN', mississippi: 'MS', missouri: 'MO', montana: 'MT',
  nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC',
  'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR',
  pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT',
  vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV',
  wisconsin: 'WI', wyoming: 'WY',
};

/** All selectable US states + DC for the manual fallback picker. */
export const US_STATES: { abbr: string; name: string }[] = Object.entries(
  STATE_NAME_TO_ABBR
)
  .map(([name, abbr]) => ({
    abbr,
    name: name.replace(/\b\w/g, (c) => c.toUpperCase()).replace(' Of ', ' of '),
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

/**
 * Normalize an expo-location reverse-geocode `region` value to a USPS
 * abbreviation. Handles both "California" and "CA" forms. Returns null when
 * unrecognized (callers must treat null as NOT legal — fail closed).
 */
export function normalizeRegionToAbbr(
  region: string | null | undefined
): string | null {
  if (!region) return null;
  const trimmed = region.trim();
  if (/^[A-Za-z]{2}$/.test(trimmed)) {
    const abbr = trimmed.toUpperCase();
    return abbr in THC_LEGAL_STATUS || Object.values(STATE_NAME_TO_ABBR).includes(abbr)
      ? abbr
      : null;
  }
  return STATE_NAME_TO_ABBR[trimmed.toLowerCase()] ?? null;
}
