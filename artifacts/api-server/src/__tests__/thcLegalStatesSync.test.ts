/**
 * Guards the single-source-of-truth invariant for the THC legal-states list.
 *
 * The server's enforcement set must be exactly the canonical list in
 * `@workspace/thc-legal-states`. If someone re-hardcodes states in the server
 * module (bypassing the shared package), this fails before it ships.
 * The mobile app has a mirror-image test in its own suite.
 */
import { describe, expect, it } from "vitest";
import { THC_RECREATIONAL_LEGAL_ABBRS } from "@workspace/thc-legal-states";
import { THC_LEGAL_STATE_ABBRS, isThcLegalState } from "../data/thcLegalStates";

describe("server THC legal list stays in sync with the canonical list", () => {
  it("matches the canonical list exactly (no extras, no omissions)", () => {
    expect([...THC_LEGAL_STATE_ABBRS].sort()).toEqual(
      [...THC_RECREATIONAL_LEGAL_ABBRS].sort()
    );
  });

  it("canonical list has no duplicates and only valid USPS abbreviations", () => {
    const unique = new Set(THC_RECREATIONAL_LEGAL_ABBRS);
    expect(unique.size).toBe(THC_RECREATIONAL_LEGAL_ABBRS.length);
    for (const abbr of THC_RECREATIONAL_LEGAL_ABBRS) {
      expect(abbr).toMatch(/^[A-Z]{2}$/);
    }
  });

  it("every canonical state passes the server legality check", () => {
    for (const abbr of THC_RECREATIONAL_LEGAL_ABBRS) {
      expect(isThcLegalState(abbr)).toBe(true);
    }
  });
});
