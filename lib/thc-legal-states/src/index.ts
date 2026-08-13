/**
 * ============================================================================
 * ⚖️  LEGAL / COMPLIANCE — CANONICAL THC LEGAL-STATES LIST
 * ============================================================================
 *
 * This is the SINGLE SOURCE OF TRUTH for which US jurisdictions have legal
 * recreational cannabis. Both the mobile app's THC gate
 * (`artifacts/pour-it/src/data/legalStatesForTHC.ts`) and the server's
 * enforcement boundary (`artifacts/api-server/src/data/thcLegalStates.ts`)
 * derive from this array. Do NOT re-hardcode state lists anywhere else.
 *
 * This list has real legal/compliance weight: the app shows THC content and
 * the server signs location tokens based on membership here. It must be kept
 * accurate.
 *
 * LAST VERIFIED: August 2026 (24 recreational-legal states + DC). See
 * `THC_LIST_LAST_VERIFIED` below — update it whenever the list is re-checked,
 * even if no states changed.
 *
 * WHERE TO CHECK FOR UPDATES:
 *   - Each state's official cannabis regulatory agency site (primary source)
 *   - NCSL cannabis overview: https://www.ncsl.org/civil-and-criminal-justice/cannabis-overview
 *   - Verify against a primary source before editing — news reports often
 *     announce bills that have not yet taken effect.
 *
 * STATUS CAN CHANGE ANY TIME via legislation or ballot measure. States close
 * to flipping should be monitored — as of the August 2026 review,
 * Pennsylvania had active legalization legislation under consideration;
 * Florida and Hawaii have had recurring near-miss efforts. Ballot-measure
 * states can also flip in November elections.
 *
 * WHEN UPDATING: change ONLY this file's data and the LAST VERIFIED date;
 * both apps pick the change up automatically. A test in each app's suite
 * asserts the derived lists match this canonical one.
 * ============================================================================
 */

/** Date this list was last verified against a primary source (ISO date). */
export const THC_LIST_LAST_VERIFIED = "2026-08-01";

/**
 * Two-letter USPS abbreviations of jurisdictions where recreational cannabis
 * is legal. Sorted alphabetically; keep it that way for readable diffs.
 */
export const THC_RECREATIONAL_LEGAL_ABBRS = [
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
] as const;

export type ThcRecreationalLegalAbbr =
  (typeof THC_RECREATIONAL_LEGAL_ABBRS)[number];
