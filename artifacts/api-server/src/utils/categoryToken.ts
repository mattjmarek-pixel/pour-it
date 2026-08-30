import { createHmac, timingSafeEqual } from "node:crypto";

import { normalizeName } from "../data/catalog";
import {
  isCategoryCompatible,
  isProductCategory,
  type AppMode,
  type ProductCategory,
} from "@workspace/category-policy";

const TOKEN_TTL_MS = 5 * 60 * 1000;
const PURPOSE = "category-verification";

function getSecret(): string {
  const secret = process.env["CATEGORY_TOKEN_SECRET"];
  if (!secret) {
    throw new Error("CATEGORY_TOKEN_SECRET environment variable is not set");
  }
  return secret;
}

interface TokenPayload {
  p: string; // purpose — prevents cross-purpose token reuse
  n: string; // normalized product name
  c: ProductCategory; // verified product category
  exp: number; // expiry epoch ms
}

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

function hmac(data: string): Buffer {
  return createHmac("sha256", getSecret()).update(`${PURPOSE}.${data}`).digest();
}

/**
 * Issue a short-lived signed token binding a (normalized) product name to the
 * category the server verified during AI-vision identification. Lets
 * /recipes/generate enforce category integrity for products that are not in
 * the static catalog.
 */
export function signCategoryToken(productName: string, category: ProductCategory): string {
  if (!isProductCategory(category)) {
    throw new Error(`Refusing to sign unknown product category: ${String(category)}`);
  }
  const payload: TokenPayload = {
    p: PURPOSE,
    n: normalizeName(productName),
    c: category,
    exp: Date.now() + TOKEN_TTL_MS,
  };
  const encoded = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  return `${encoded}.${b64url(hmac(encoded))}`;
}

export type TokenVerification =
  | { ok: true; productCategory: ProductCategory }
  | { ok: false; reason: "invalid" | "expired" | "mismatch" };

export function verifyCategoryToken(
  token: string,
  productName: string,
  mode: AppMode
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
    payload.p !== PURPOSE ||
    typeof payload.n !== "string" ||
    !isProductCategory(payload.c) ||
    typeof payload.exp !== "number"
  ) {
    return { ok: false, reason: "invalid" };
  }

  if (Date.now() > payload.exp) return { ok: false, reason: "expired" };

  if (payload.n !== normalizeName(productName) || !isCategoryCompatible(mode, payload.c)) {
    return { ok: false, reason: "mismatch" };
  }

  return { ok: true, productCategory: payload.c };
}
