import { THC_RECREATIONAL_LEGAL_ABBRS } from "@workspace/thc-legal-states";

/**
 * Server-side THC legality check — the enforcement boundary.
 *
 * SECURITY: /verify-thc-location signs a location token ONLY if the reported
 * state is in this set — the server never takes the client's word that a
 * state is legal.
 *
 * The DATA lives in the shared `@workspace/thc-legal-states` package (single
 * canonical list, also used by the mobile app). Edit the list THERE, never
 * here — see that file's compliance header for verification sources.
 */
export const THC_LEGAL_STATE_ABBRS = new Set<string>(
  THC_RECREATIONAL_LEGAL_ABBRS
);

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
