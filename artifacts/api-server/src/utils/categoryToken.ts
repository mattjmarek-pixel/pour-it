import { createHmac, timingSafeEqual } from "node:crypto";

import { normalizeName } from "../data/catalog";

const TOKEN_TTL_MS = 5 * 60 * 1000;

function getSecret(): string {
  const secret = process.env["CATEGORY_TOKEN_SECRET"];
  if (!secret) {
    throw new Error("CATEGORY_TOKEN_SECRET environment variable is not set");
  }
  return secret;
}

interface TokenPayload {
  n: string; // normalized product name
  c: string; // verified category
  exp: number; // expiry epoch ms
}

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

function hmac(data: string): Buffer {
  return createHmac("sha256", getSecret()).update(data).digest();
}

/**
 * Issue a short-lived signed token binding a (normalized) product name to the
 * category the server verified during AI-vision identification. Lets
 * /recipes/generate enforce category integrity for products that are not in
 * the static catalog.
 */
export function signCategoryToken(productName: string, category: string): string {
  const payload: TokenPayload = {
    n: normalizeName(productName),
    c: category,
    exp: Date.now() + TOKEN_TTL_MS,
  };
  const encoded = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  return `${encoded}.${b64url(hmac(encoded))}`;
}

export type TokenVerification =
  | { ok: true }
  | { ok: false; reason: "invalid" | "expired" | "mismatch" };

export function verifyCategoryToken(
  token: string,
  productName: string,
  category: string
): TokenVerification {
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

  let payload: TokenPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (
    typeof payload.n !== "string" ||
    typeof payload.c !== "string" ||
    typeof payload.exp !== "number"
  ) {
    return { ok: false, reason: "invalid" };
  }

  if (Date.now() > payload.exp) return { ok: false, reason: "expired" };

  if (payload.n !== normalizeName(productName) || payload.c !== category) {
    return { ok: false, reason: "mismatch" };
  }

  return { ok: true };
}
