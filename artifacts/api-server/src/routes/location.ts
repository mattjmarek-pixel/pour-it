import { Router } from "express";

import { isThcLegalState, normalizeStateAbbr } from "../data/thcLegalStates";
import { getClientIp } from "../utils/clientIp";
import { resolveStateFromIp } from "../utils/ipGeo";
import { signLocationToken } from "../utils/locationToken";

const router = Router();

interface VerifyLocationBody {
  state?: unknown;
}

/**
 * Issue a signed location-verification token for THC features.
 *
 * SECURITY MODEL — the client's self-reported state is NEVER the authority:
 * 1. The server independently resolves the caller's US state from their
 *    request IP (server-side geolocation).
 * 2. Only that server-derived state is checked against the legal list; a
 *    token is signed only when it is genuinely legal, and the token is BOUND
 *    to the caller's IP (rejected if replayed from elsewhere).
 * 3. The client-reported state (GPS reverse-geocode or self-report) is used
 *    only as a cross-check signal: if it disagrees with the IP-derived state
 *    we log it, but the IP-derived state always wins.
 * 4. If the IP cannot be resolved to a US state, issuance FAILS CLOSED by
 *    default — including when NODE_ENV is unset or unknown. The only
 *    exception is an explicit, opt-in local-dev fallback (private/dev
 *    addresses can't be geolocated) requiring BOTH
 *    THC_ALLOW_SELF_REPORTED_STATE=true AND NODE_ENV !== "production".
 */
router.post("/verify-thc-location", async (req, res) => {
  const { state } = (req.body ?? {}) as VerifyLocationBody;
  const claimedAbbr = normalizeStateAbbr(state);
  const clientIp = getClientIp(req);

  const ipResult = await resolveStateFromIp(clientIp);
  let verifiedAbbr = ipResult.stateAbbr;

  if (!verifiedAbbr) {
    // Self-report fallback is OPT-IN for local development only: it requires
    // BOTH an explicit flag AND a non-production NODE_ENV. Unset or unknown
    // environments FAIL CLOSED by default — the gate never fails open because
    // configuration is missing.
    const devFallbackEnabled =
      process.env["THC_ALLOW_SELF_REPORTED_STATE"] === "true" &&
      process.env["NODE_ENV"] !== "production";
    if (!devFallbackEnabled) {
      // FAIL CLOSED: without an independently verified location, no token.
      req.log.warn(
        { clientIp, reason: ipResult.reason },
        "THC location verification failed closed: could not resolve state from IP",
      );
      res.status(403).json({
        error: "location_unverifiable",
        message:
          "Your location could not be independently verified, so THC features are unavailable.",
      });
      return;
    }
    // DEV-ONLY fallback (explicitly opted in): private/local addresses can't
    // be geolocated. Never active in production or by default.
    if (!claimedAbbr) {
      res.status(400).json({ error: "state (two-letter USPS abbreviation) is required" });
      return;
    }
    req.log.warn(
      { clientIp, claimedAbbr, reason: ipResult.reason },
      "DEV-ONLY: accepting client-reported state because IP is not geolocatable outside production",
    );
    verifiedAbbr = claimedAbbr;
  } else if (claimedAbbr && claimedAbbr !== verifiedAbbr) {
    // Cross-check signal only — the server-derived state always wins.
    req.log.warn(
      { clientIp, claimedAbbr, verifiedAbbr },
      "Client-reported state disagrees with IP-derived state; using IP-derived state",
    );
  }

  if (!isThcLegalState(verifiedAbbr)) {
    req.log.info({ state: verifiedAbbr }, "THC location verification: state not legal");
    res.json({ legal: false, stateAbbr: verifiedAbbr });
    return;
  }

  res.json({
    legal: true,
    stateAbbr: verifiedAbbr,
    locationToken: signLocationToken(verifiedAbbr, clientIp),
  });
});

export default router;
