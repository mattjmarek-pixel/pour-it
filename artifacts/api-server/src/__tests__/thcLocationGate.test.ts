/**
 * Adversarial tests for the server-side THC geo-enforcement layer.
 *
 * Goal: if the location-token system silently breaks (or a future change
 * weakens a fail-closed path), these tests catch it. No enforcement logic is
 * modified here — coverage only.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";

// Token secret must exist BEFORE the app/utils are imported.
process.env["CATEGORY_TOKEN_SECRET"] = "test-secret-for-thc-location-gate";

import app from "../app";
import { signLocationToken, verifyLocationToken } from "../utils/locationToken";
import { signCategoryToken } from "../utils/categoryToken";

const THC_GENERATE_BODY = {
  productName: "Test THC Seltzer",
  spiritType: "thc seltzer",
  category: "thc",
};

afterEach(() => {
  vi.useRealTimers();
});

describe("POST /api/verify-thc-location (token issuance)", () => {
  it("returns legal: true and a token for a legal state", async () => {
    const res = await request(app)
      .post("/api/verify-thc-location")
      .send({ state: "IL" });
    expect(res.status).toBe(200);
    expect(res.body.legal).toBe(true);
    expect(res.body.stateAbbr).toBe("IL");
    expect(typeof res.body.locationToken).toBe("string");
    expect(res.body.locationToken.length).toBeGreaterThan(0);
  });

  it("normalizes lowercase/whitespace input", async () => {
    const res = await request(app)
      .post("/api/verify-thc-location")
      .send({ state: " ca " });
    expect(res.status).toBe(200);
    expect(res.body.legal).toBe(true);
    expect(res.body.stateAbbr).toBe("CA");
  });

  it("returns legal: false and NO token for a non-legal state", async () => {
    const res = await request(app)
      .post("/api/verify-thc-location")
      .send({ state: "TX" });
    expect(res.status).toBe(200);
    expect(res.body.legal).toBe(false);
    expect(res.body.locationToken).toBeUndefined();
  });

  it("returns 400 for a missing state", async () => {
    const res = await request(app).post("/api/verify-thc-location").send({});
    expect(res.status).toBe(400);
    expect(res.body.locationToken).toBeUndefined();
  });

  it.each([
    ["number", 42],
    ["object", { abbr: "IL" }],
    ["full state name", "Illinois"],
    ["three letters", "ILL"],
    ["empty string", ""],
    ["injection-ish", "IL'; DROP TABLE states;--"],
  ])("returns 400 for invalid state parameter (%s)", async (_label, state) => {
    const res = await request(app)
      .post("/api/verify-thc-location")
      .send({ state });
    expect(res.status).toBe(400);
    expect(res.body.locationToken).toBeUndefined();
  });
});

describe("signLocationToken guard", () => {
  it("throws when asked to sign a non-legal state", () => {
    expect(() => signLocationToken("TX")).toThrow(/non-legal state/);
  });

  it("throws for garbage state values", () => {
    expect(() => signLocationToken("ZZ")).toThrow();
    expect(() => signLocationToken("")).toThrow();
  });
});

describe("verifyLocationToken unit behavior", () => {
  it("accepts a genuine token and returns its state", () => {
    const token = signLocationToken("CO");
    expect(verifyLocationToken(token)).toEqual({ ok: true, stateAbbr: "CO" });
  });

  it("rejects missing/empty tokens", () => {
    expect(verifyLocationToken(undefined).ok).toBe(false);
    expect(verifyLocationToken("").ok).toBe(false);
    expect(verifyLocationToken(null).ok).toBe(false);
  });

  it("rejects garbage tokens", () => {
    for (const bad of ["garbage", "a.b.c", "..", "onlyonepart.", ".onlysig"]) {
      expect(verifyLocationToken(bad).ok).toBe(false);
    }
  });

  it("rejects a tampered token (payload changed, signature kept)", () => {
    const token = signLocationToken("CA");
    const parts = token.split(".");
    expect(parts).toHaveLength(2);
    const [encoded, sig] = parts as [string, string];
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    // Attacker tries to swap in a different (still legal) state or extend expiry.
    payload.exp = Date.now() + 1000 * 60 * 60 * 24 * 365;
    const tampered = `${Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")}.${sig}`;
    const result = verifyLocationToken(tampered);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid");
  });

  it("rejects an expired token (valid signature, past 45-min TTL)", () => {
    const token = signLocationToken("NY");
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 46 * 60 * 1000);
    const result = verifyLocationToken(token);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("expired");
  });

  it("still accepts a token just inside the TTL", () => {
    const token = signLocationToken("NY");
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 44 * 60 * 1000);
    expect(verifyLocationToken(token).ok).toBe(true);
  });

  it("rejects a category token used as a location token (purpose separation)", () => {
    const categoryToken = signCategoryToken("Test THC Seltzer", "thc");
    const result = verifyLocationToken(categoryToken);
    expect(result.ok).toBe(false);
  });

  it("rejects a hand-forged location-shaped payload signed as a category token", () => {
    // Even if an attacker gets the category signer to sign something, the
    // HMAC domain prefix means it can never verify as a location token.
    const categoryToken = signCategoryToken('{"p":"thc-location","s":"CA"}', "thc");
    expect(verifyLocationToken(categoryToken).ok).toBe(false);
  });
});

describe("THC endpoint enforcement: POST /api/recipes/generate", () => {
  it("rejects THC generation with no location token (403, fail closed)", async () => {
    const res = await request(app).post("/api/recipes/generate").send(THC_GENERATE_BODY);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("location_restricted");
    expect(res.body.reason).toBe("missing");
  });

  it("rejects a malformed token", async () => {
    const res = await request(app)
      .post("/api/recipes/generate")
      .send({ ...THC_GENERATE_BODY, locationToken: "not-a-real-token" });
    expect(res.status).toBe(403);
  });

  it("rejects a category token passed as the location token", async () => {
    const categoryToken = signCategoryToken(THC_GENERATE_BODY.productName, "thc");
    const res = await request(app)
      .post("/api/recipes/generate")
      .send({ ...THC_GENERATE_BODY, locationToken: categoryToken });
    expect(res.status).toBe(403);
  });

  it("rejects an expired token", async () => {
    const token = signLocationToken("WA");
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 46 * 60 * 1000);
    const res = await request(app)
      .post("/api/recipes/generate")
      .send({ ...THC_GENERATE_BODY, locationToken: token });
    expect(res.status).toBe(403);
    expect(res.body.reason).toBe("expired");
  });

  it("passes the geo check with a valid token (then hits the category-token rule, 409 — proving the geo layer let it through)", async () => {
    const token = signLocationToken("MI");
    const res = await request(app)
      .post("/api/recipes/generate")
      .send({ ...THC_GENERATE_BODY, locationToken: token });
    // 409 = existing non-catalog category verification (unchanged layer),
    // NOT 403 — the location gate passed.
    expect(res.status).toBe(409);
  });

  it("does not require a location token for spirits or mocktails", async () => {
    for (const category of ["spirits", "mocktails"]) {
      const res = await request(app).post("/api/recipes/generate").send({
        productName: "Unknown Product",
        spiritType: "vodka",
        category,
      });
      // 409 (category-token rule) — but never 403 location_restricted.
      expect(res.status).not.toBe(403);
    }
  });
});

describe("THC endpoint enforcement: POST /api/identify-bottle", () => {
  it("rejects THC identification with no location token (403)", async () => {
    const res = await request(app)
      .post("/api/identify-bottle")
      .send({ imageBase64: "aGVsbG8=", mode: "thc" });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("location_restricted");
  });

  it("rejects a tampered token on identify", async () => {
    const token = signLocationToken("OR");
    const [encoded] = token.split(".");
    const res = await request(app)
      .post("/api/identify-bottle")
      .send({ imageBase64: "aGVsbG8=", mode: "thc", locationToken: `${encoded}.AAAA` });
    expect(res.status).toBe(403);
  });
});
