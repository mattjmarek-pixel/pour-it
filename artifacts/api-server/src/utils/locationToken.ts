import { createHmac, timingSafeEqual } from "node:crypto";

import { isThcLegalState } from "../data/thcLegalStates";

/**
 * Signed "location verification token" — parallel to categoryToken.ts, but
 * for THC state legality. The server issues one (via /verify-thc-location)
 * only after cross-checking the reported state against the server-side legal
 * list, and every THC-related endpoint requires a valid one before doing any
 * work. Fail closed: missing/invalid/expired/illegal all reject.
 */

const TOKEN_TTL_MS = 45 * 60 * 1000; // 45 minutes — can't be replayed indefinitely

// Distinct purpose marker so a location token can never be confused with a
// category token (and vice versa), even though both are HMAC-SHA256.
const PURPOSE = "thc-location";

function getSecret(): string {
  const secret = process.env["CATEGORY_TOKEN_SECRET"];
  if (!secret) {
    throw new Error("CATEGORY_TOKEN_SECRET environment variable is not set");
  }
  return secret;
}

interface LocationTokenPayload {
  p: string; // purpose — must equal PURPOSE
  s: string; // verified USPS state abbreviation
  exp: number; // expiry epoch ms
}

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

function hmac(data: string): Buffer {
  return createHmac("sha256", getSecret()).update(`${PURPOSE}.${data}`).digest();
}

/**
 * Sign a location token for a state the server has ALREADY verified as legal.
 * Callers must check legality first; this throws if they didn't, as a
 * defense-in-depth guard against future misuse.
 */
export function signLocationToken(stateAbbr: string): string {
  if (!isThcLegalState(stateAbbr)) {
    throw new Error(`Refusing to sign location token for non-legal state: ${stateAbbr}`);
  }
  const payload: LocationTokenPayload = {
    p: PURPOSE,
    s: stateAbbr,
    exp: Date.now() + TOKEN_TTL_MS,
  };
  const encoded = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  return `${encoded}.${b64url(hmac(encoded))}`;
}

export type LocationTokenVerification =
  | { ok: true; stateAbbr: string }
  | { ok: false; reason: "missing" | "invalid" | "expired" | "not_legal" };

/**
 * Verify a location token. Also re-checks the embedded state against the
 * CURRENT legal list, so a token signed before a law change stops working as
 * soon as the list is updated (within its TTL window).
 */
export function verifyLocationToken(token: unknown): LocationTokenVerification {
  if (typeof token !== "string" || token.length === 0) {
    return { ok: false, reason: "missing" };
  }
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: "invalid" };
  const [encoded, sig] = parts;

  let expected: Buffer;
  let provided: Buffer;
  try {
    expected = hmac(encoded);
    provided = Buffer.from(sig, "base64url");
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return { ok: false, reason: "invalid" };
  }

  let payload: LocationTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (
    payload.p !== PURPOSE ||
    typeof payload.s !== "string" ||
    typeof payload.exp !== "number"
  ) {
    return { ok: false, reason: "invalid" };
  }

  if (Date.now() > payload.exp) return { ok: false, reason: "expired" };

  if (!isThcLegalState(payload.s)) return { ok: false, reason: "not_legal" };

  return { ok: true, stateAbbr: payload.s };
}
