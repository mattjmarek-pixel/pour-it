import { Router } from "express";

import { isThcLegalState, normalizeStateAbbr } from "../data/thcLegalStates";
import { signLocationToken } from "../utils/locationToken";

const router = Router();

interface VerifyLocationBody {
  state?: unknown;
}

/**
 * Issue a signed location-verification token for THC features.
 *
 * The client reports a state (from GPS reverse-geocoding or user
 * self-report); the server independently cross-checks it against the
 * server-side legal list and only signs a token when it is genuinely legal.
 * A raw client-supplied state is NEVER accepted directly by the THC
 * endpoints — only this signed token is.
 */
router.post("/verify-thc-location", (req, res) => {
  const { state } = (req.body ?? {}) as VerifyLocationBody;

  const abbr = normalizeStateAbbr(state);
  if (!abbr) {
    res.status(400).json({ error: "state (two-letter USPS abbreviation) is required" });
    return;
  }

  if (!isThcLegalState(abbr)) {
    req.log.info({ state: abbr }, "THC location verification: state not legal");
    res.json({ legal: false, stateAbbr: abbr });
    return;
  }

  res.json({ legal: true, stateAbbr: abbr, locationToken: signLocationToken(abbr) });
});

export default router;
