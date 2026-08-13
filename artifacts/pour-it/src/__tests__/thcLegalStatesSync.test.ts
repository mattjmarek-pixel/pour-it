/**
 * Guards the single-source-of-truth invariant for the THC legal-states list.
 *
 * The mobile gate's legality map must be exactly the canonical list in
 * `@workspace/thc-legal-states`. If someone re-hardcodes states in the mobile
 * module (bypassing the shared package), this fails before it ships.
 * The server has a mirror-image test in its own suite.
 */
import { THC_RECREATIONAL_LEGAL_ABBRS } from '@workspace/thc-legal-states';
import {
  THC_LEGAL_STATUS,
  isThcLegalIn,
  STATE_NAME_TO_ABBR,
} from '../data/legalStatesForTHC';

describe('mobile THC legal list stays in sync with the canonical list', () => {
  it('matches the canonical list exactly (no extras, no omissions)', () => {
    expect(Object.keys(THC_LEGAL_STATUS).sort()).toEqual(
      [...THC_RECREATIONAL_LEGAL_ABBRS].sort()
    );
  });

  it('every canonical entry is recreational and unlocks the gate', () => {
    for (const abbr of THC_RECREATIONAL_LEGAL_ABBRS) {
      expect(THC_LEGAL_STATUS[abbr]).toBe('recreational');
      expect(isThcLegalIn(abbr)).toBe(true);
    }
  });

  it('every canonical abbreviation is a real US state/DC abbreviation', () => {
    const known = new Set(Object.values(STATE_NAME_TO_ABBR));
    for (const abbr of THC_RECREATIONAL_LEGAL_ABBRS) {
      expect(known.has(abbr)).toBe(true);
    }
  });
});
