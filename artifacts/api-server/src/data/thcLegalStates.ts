/**
 * Server-side source of truth for where recreational THC products are legal.
 *
 * SECURITY: /verify-thc-location signs a location token ONLY if the reported
 * state is in this list — the server never takes the client's word that a
 * state is legal. Keep this in lockstep with the mobile app's
 * `src/data/legalStatesForTHC.ts` (the client list is UX; this list is the
 * enforcement boundary).
 *
 * Current as of August 2026: 24 recreational-legal states + DC.
 */
export const THC_LEGAL_STATE_ABBRS = new Set<string>([
  "AK",
  "AZ",
  "CA",
  "CO",
  "CT",
  "DC",
  "DE",
  "IL",
  "MA",
  "MD",
  "ME",
  "MI",
  "MN",
  "MO",
  "MT",
  "NJ",
  "NM",
  "NV",
  "NY",
  "OH",
  "OR",
  "RI",
  "VA",
  "VT",
  "WA",
]);

const VALID_ABBR = /^[A-Z]{2}$/;

/** Normalize client input to a two-letter USPS abbreviation, or null. */
export function normalizeStateAbbr(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const abbr = input.trim().toUpperCase();
  return VALID_ABBR.test(abbr) ? abbr : null;
}

export function isThcLegalState(abbr: string | null): boolean {
  return abbr !== null && THC_LEGAL_STATE_ABBRS.has(abbr);
}
