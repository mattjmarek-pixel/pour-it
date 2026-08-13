import { THC_RECREATIONAL_LEGAL_ABBRS } from '@workspace/thc-legal-states';

/**
 * US jurisdictions where recreational cannabis is legal (client-side UX gate;
 * the server enforces independently from the same canonical list).
 *
 * The DATA lives in the shared `@workspace/thc-legal-states` package — edit
 * the list THERE, never here. See that file's compliance header for the
 * last-verified date and where to check for updates.
 *
 * Structured so medical-only states can be added later without touching the
 * gating logic (see `THC_LEGAL_STATUS`).
 */

export type ThcLegality = 'recreational' | 'medical' | 'illegal';

/**
 * Two-letter USPS abbreviations → legality, derived from the canonical list.
 * Only 'recreational' entries unlock the THC tab today; the map exists so a
 * future policy change (e.g. allowing medical states) is a one-line edit in
 * `isThcLegalIn` rather than a data migration.
 */
export const THC_LEGAL_STATUS: Record<string, ThcLegality> =
  Object.fromEntries(
    THC_RECREATIONAL_LEGAL_ABBRS.map((abbr) => [abbr, 'recreational'] as const)
  );

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
