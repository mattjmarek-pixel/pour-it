import { isThcLegalIn, normalizeRegionToAbbr } from '../data/legalStatesForTHC';

describe('normalizeRegionToAbbr', () => {
  it.each([
    ['California', 'CA'],
    ['california', 'CA'],
    ['  CaLiFoRnIa  ', 'CA'],
    ['CA', 'CA'],
    ['ca', 'CA'],
    [' ca ', 'CA'],
    ['Texas', 'TX'],
    ['tx', 'TX'],
    ['District of Columbia', 'DC'],
    [' new york ', 'NY'],
  ])('normalizes %j to %s without implying legality', (input, expected) => {
    expect(normalizeRegionToAbbr(input)).toBe(expected);
  });

  it.each([null, undefined, '', '   ', 'Ontario', 'ZZ', 'ON', 'USA', 'C', '123', 'C.A.'])
  ('rejects unknown or missing region %j', (input) => {
    expect(normalizeRegionToAbbr(input)).toBeNull();
    expect(isThcLegalIn(normalizeRegionToAbbr(input))).toBe(false);
  });
});

describe('isThcLegalIn', () => {
  it.each(['CA', 'ca', 'cA', 'NY', 'ny', 'DC', 'dc'])
  ('allows a recreational-legal abbreviation %j regardless of case', (input) => {
    expect(isThcLegalIn(input)).toBe(true);
  });

  it.each([null, undefined, '', ' ', 'TX', 'tx', 'FL', 'ZZ', 'Ontario', 'California', ' CA '])
  ('fails closed for non-legal or non-abbreviation input %j', (input) => {
    // Callers normalize geocoded names/whitespace before checking legality.
    expect(isThcLegalIn(input)).toBe(false);
  });
});
