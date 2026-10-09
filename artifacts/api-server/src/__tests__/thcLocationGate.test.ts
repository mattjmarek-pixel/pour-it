/**
 * Adversarial tests for the server-side THC geo-enforcement layer.
 *
 * Threat model: a technical user calls the API directly (bypassing the app's
 * UI gate) and tries to obtain or forge THC access from a non-legal state.
 * These tests cover the full attack chain:
 *   1. Issuance — the server derives the caller's state from their IP; a
 *      client CLAIMING a legal state while their IP resolves elsewhere gets
 *      no token (production behavior).
 *   2. Token integrity — forged/tampered/expired/cross-purpose tokens fail.
 *   3. Binding — a genuine token replayed from a different IP fails.
 *   4. Endpoint enforcement — both THC endpoints reject every failure mode
 *      with 403 and never process the request.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

// Token secret must exist BEFORE the app/utils are imported.
process.env["CATEGORY_TOKEN_SECRET"] = "test-secret-for-thc-location-gate";

import app from "../app";
import { setIpGeoResolver, isPrivateOrLocalIp } from "../utils/ipGeo";
import { signLocationToken, verifyLocationToken } from "../utils/locationToken";
import { signCategoryToken } from "../utils/categoryToken";

const THC_GENERATE_BODY = {
  productName: "Test THC Seltzer",
  spiritType: "thc seltzer",
  category: "thc",
};

// Public-looking test addresses (trust proxy makes X-Forwarded-For → req.ip).
const IP_LEGAL = "203.0.113.10"; // resolver maps → CA
const IP_ILLEGAL = "203.0.113.20"; // resolver maps → TX
const IP_UNKNOWN = "203.0.113.30"; // resolver fails
const IP_OTHER = "203.0.113.99"; // never used at issuance — for replay tests

/** Install a deterministic IP→state resolver for the duration of a test. */
function mockGeo(): () => void {
  return setIpGeoResolver(async (ip) => {
    if (ip === IP_LEGAL) return { stateAbbr: "CA" };
    if (ip === IP_ILLEGAL) return { stateAbbr: "TX" };
    return { stateAbbr: null, reason: "lookup_failed" };
  });
}

/** Run a block with NODE_ENV=production (dev fallback must be inert). */
async function inProduction(fn: () => Promise<void>): Promise<void> {
  const prev = process.env["NODE_ENV"];
  process.env["NODE_ENV"] = "production";
  try {
    await fn();
  } finally {
    if (prev === undefined) delete process.env["NODE_ENV"];
    else process.env["NODE_ENV"] = prev;
  }
}

/** Run a block with the explicit local-dev self-report opt-in enabled. */
async function withDevFallback(fn: () => Promise<void>): Promise<void> {
  process.env["THC_ALLOW_SELF_REPORTED_STATE"] = "true";
  try {
    await fn();
  } finally {
    delete process.env["THC_ALLOW_SELF_REPORTED_STATE"];
  }
}

/** Run a block with NODE_ENV forced to a specific value (or unset). */
async function withNodeEnv(value: string | undefined, fn: () => Promise<void>): Promise<void> {
  const prev = process.env["NODE_ENV"];
  if (value === undefined) delete process.env["NODE_ENV"];
  else process.env["NODE_ENV"] = value;
  try {
    await fn();
  } finally {
    if (prev === undefined) delete process.env["NODE_ENV"];
    else process.env["NODE_ENV"] = prev;
  }
}

const restores: Array<() => void> = [];
afterEach(() => {
  vi.useRealTimers();
  while (restores.length) restores.pop()!();
});

describe("POST /api/verify-thc-location — issuance is IP-derived, not client-claimed", () => {
  it("ATTACK CHAIN: caller in an illegal state claiming a legal state gets NO token", async () => {
    restores.push(mockGeo());
    await inProduction(async () => {
      // Attacker is in TX (per IP) but posts {"state":"CA"}.
      const res = await request(app)
        .post("/api/verify-thc-location")
        .set("X-Forwarded-For", IP_ILLEGAL)
        .send({ state: "CA" });
      expect(res.status).toBe(200);
      expect(res.body.legal).toBe(false);
      expect(res.body.stateAbbr).toBe("TX"); // server-derived state won
      expect(res.body.locationToken).toBeUndefined();
    });
  });

  it("issues a token when the IP-derived state is legal (client claim irrelevant)", async () => {
    restores.push(mockGeo());
    await inProduction(async () => {
      const res = await request(app)
        .post("/api/verify-thc-location")
        .set("X-Forwarded-For", IP_LEGAL)
        .send({ state: "TX" }); // even a bogus claim doesn't matter
      expect(res.status).toBe(200);
      expect(res.body.legal).toBe(true);
      expect(res.body.stateAbbr).toBe("CA");
      expect(typeof res.body.locationToken).toBe("string");
    });
  });

  it("fails closed in production when the IP cannot be resolved", async () => {
    restores.push(mockGeo());
    await inProduction(async () => {
      const res = await request(app)
        .post("/api/verify-thc-location")
        .set("X-Forwarded-For", IP_UNKNOWN)
        .send({ state: "CA" });
      expect(res.status).toBe(403);
      expect(res.body.error).toBe("location_unverifiable");
      expect(res.body.locationToken).toBeUndefined();
    });
  });

  it("fails closed in production for private/local IPs (no dev fallback)", async () => {
    restores.push(mockGeo());
    await inProduction(async () => {
      const res = await request(app)
        .post("/api/verify-thc-location")
        .set("X-Forwarded-For", "192.168.1.50")
        .send({ state: "CA" });
      expect(res.status).toBe(403);
      expect(res.body.locationToken).toBeUndefined();
    });
  });

  it("FAILS CLOSED by default when the IP is unverifiable — even with NODE_ENV unset or non-production and a legal claimed state", async () => {
    restores.push(mockGeo());
    for (const env of [undefined, "test", "development", "staging", "weird-value"]) {
      await withNodeEnv(env, async () => {
        const res = await request(app)
          .post("/api/verify-thc-location")
          .send({ state: "CA" }); // supertest default 127.0.0.1 → unverifiable
        expect(res.status).toBe(403);
        expect(res.body.error).toBe("location_unverifiable");
        expect(res.body.locationToken).toBeUndefined();
      });
    }
  });

  it("the opt-in flag alone cannot bypass production fail-closed behavior", async () => {
    restores.push(mockGeo());
    await withDevFallback(() =>
      inProduction(async () => {
        const res = await request(app)
          .post("/api/verify-thc-location")
          .send({ state: "CA" });
        expect(res.status).toBe(403);
        expect(res.body.locationToken).toBeUndefined();
      }),
    );
  });

  it("DEV ONLY (explicit opt-in): private IP + claimed state works outside production", async () => {
    restores.push(mockGeo());
    await withDevFallback(async () => {
      const res = await request(app)
        .post("/api/verify-thc-location")
        .send({ state: "IL" }); // supertest default 127.0.0.1 → private
      expect(res.status).toBe(200);
      expect(res.body.legal).toBe(true);
      expect(res.body.stateAbbr).toBe("IL");
    });
  });

  it("DEV fallback still refuses non-legal claimed states", async () => {
    restores.push(mockGeo());
    await withDevFallback(async () => {
      const res = await request(app)
        .post("/api/verify-thc-location")
        .send({ state: "TX" });
      expect(res.status).toBe(200);
      expect(res.body.legal).toBe(false);
      expect(res.body.locationToken).toBeUndefined();
    });
  });

  it("returns 400 when unresolvable and no usable state given (dev opt-in)", async () => {
    restores.push(mockGeo());
    await withDevFallback(async () => {
      const res = await request(app).post("/api/verify-thc-location").send({});
      expect(res.status).toBe(400);
      expect(res.body.locationToken).toBeUndefined();
    });
  });

  it.each([
    ["number", 42],
    ["object", { abbr: "IL" }],
    ["full state name", "Illinois"],
    ["three letters", "ILL"],
    ["empty string", ""],
    ["injection-ish", "IL'; DROP TABLE states;--"],
  ])("returns 400 for invalid state parameter (%s, dev opt-in path)", async (_label, state) => {
    restores.push(mockGeo());
    await withDevFallback(async () => {
      const res = await request(app)
        .post("/api/verify-thc-location")
        .send({ state });
      expect(res.status).toBe(400);
      expect(res.body.locationToken).toBeUndefined();
    });
  });
});

describe("X-Forwarded-For spoofing resistance", () => {
  it("ATTACK CHAIN: spoofed multi-hop XFF cannot mint a token — only the proxy-appended (last) entry counts", async () => {
    restores.push(mockGeo());
    await inProduction(async () => {
      // Attacker in TX prepends a legal-state IP; the trusted proxy appends
      // their REAL address last. The gate must use the last entry.
      const res = await request(app)
        .post("/api/verify-thc-location")
        .set("X-Forwarded-For", `${IP_LEGAL}, ${IP_ILLEGAL}`)
        .send({ state: "CA" });
      expect(res.status).toBe(200);
      expect(res.body.legal).toBe(false);
      expect(res.body.stateAbbr).toBe("TX");
      expect(res.body.locationToken).toBeUndefined();
    });
  });

  it("spoofed multi-hop XFF cannot satisfy IP binding on THC endpoints", async () => {
    const token = signLocationToken("WA", IP_LEGAL);
    const res = await request(app)
      .post("/api/recipes/generate")
      // Attacker prepends the bound IP; proxy appends their real one last.
      .set("X-Forwarded-For", `${IP_LEGAL}, ${IP_OTHER}`)
      .send({ ...THC_GENERATE_BODY, locationToken: token });
    expect(res.status).toBe(403);
    expect(res.body.reason).toBe("ip_mismatch");
  });

  it("getClientIp ignores X-Forwarded-For unless the TCP peer is a trusted proxy hop", async () => {
    const { getClientIp } = await import("../utils/clientIp");
    const fakeReq = (remoteAddress: string, xff?: string) =>
      ({
        socket: { remoteAddress },
        headers: xff ? { "x-forwarded-for": xff } : {},
      }) as unknown as import("express").Request;

    // Direct public connection: header is caller-controlled → ignored.
    expect(getClientIp(fakeReq(IP_ILLEGAL, IP_LEGAL))).toBe(IP_ILLEGAL);
    expect(getClientIp(fakeReq(IP_ILLEGAL, `${IP_LEGAL}, ${IP_LEGAL}`))).toBe(IP_ILLEGAL);
    // Via trusted (loopback) proxy: last (proxy-appended) entry wins.
    expect(getClientIp(fakeReq("127.0.0.1", `${IP_LEGAL}, ${IP_ILLEGAL}`))).toBe(IP_ILLEGAL);
    expect(getClientIp(fakeReq("127.0.0.1", IP_LEGAL))).toBe(IP_LEGAL);
    // No header via proxy: fall back to peer (private → geo fails closed).
    expect(getClientIp(fakeReq("127.0.0.1"))).toBe("127.0.0.1");
  });

  it("ATTACK CHAIN: an untrusted RFC1918/ULA peer with a forged XFF is NOT treated as the proxy", async () => {
    const { getClientIp, isTrustedProxyPeer } = await import("../utils/clientIp");
    const fakeReq = (remoteAddress: string, xff?: string) =>
      ({
        socket: { remoteAddress },
        headers: xff ? { "x-forwarded-for": xff } : {},
      }) as unknown as import("express").Request;

    // Private address space is not an identity for the platform proxy.
    for (const peer of ["10.1.2.3", "192.168.7.7", "172.16.0.9", "fd00::9", "::ffff:10.0.0.4"]) {
      expect(isTrustedProxyPeer(peer)).toBe(false);
      // Forged legal-state XFF from such a peer must be ignored → client IP
      // is the (non-geolocatable) peer itself, so issuance fails closed in
      // production and IP-bound tokens for the forged address never match.
      expect(getClientIp(fakeReq(peer, IP_LEGAL))).toBe(peer.replace(/^::ffff:/, ""));
    }
    // Loopback (the platform proxy hop) is trusted; env allowlist extends it.
    expect(isTrustedProxyPeer("127.0.0.1")).toBe(true);
    expect(isTrustedProxyPeer("::1")).toBe(true);
    process.env["TRUSTED_PROXY_IPS"] = "10.9.8.7, 100.64.0.0/10";
    try {
      expect(isTrustedProxyPeer("10.9.8.7")).toBe(true);
      expect(isTrustedProxyPeer("100.64.12.34")).toBe(true);
      expect(isTrustedProxyPeer("10.9.8.6")).toBe(false);
    } finally {
      delete process.env["TRUSTED_PROXY_IPS"];
    }
  });
});

describe("private IP detection", () => {
  it("classifies loopback/private/link-local as private", () => {
    for (const ip of ["127.0.0.1", "::1", "10.0.0.5", "192.168.0.1", "172.16.9.9", "169.254.1.1", "::ffff:127.0.0.1", "fe80::1"]) {
      expect(isPrivateOrLocalIp(ip)).toBe(true);
    }
    expect(isPrivateOrLocalIp("")).toBe(true);
    expect(isPrivateOrLocalIp(undefined)).toBe(true);
  });

  it("classifies public addresses as public", () => {
    for (const ip of ["8.8.8.8", "203.0.113.10", "::ffff:8.8.8.8"]) {
      expect(isPrivateOrLocalIp(ip)).toBe(false);
    }
  });
});

describe("signLocationToken guard", () => {
  it("throws when asked to sign a non-legal state", () => {
    expect(() => signLocationToken("TX", IP_LEGAL)).toThrow(/non-legal state/);
  });

  it("throws for garbage state values", () => {
    expect(() => signLocationToken("ZZ", IP_LEGAL)).toThrow();
    expect(() => signLocationToken("", IP_LEGAL)).toThrow();
  });

  it("throws when no client IP is provided to bind to", () => {
    expect(() => signLocationToken("CA", "")).toThrow(/client IP/);
  });
});

describe("verifyLocationToken unit behavior", () => {
  it("accepts a genuine token from the IP it was issued to", () => {
    const token = signLocationToken("CO", IP_LEGAL);
    expect(verifyLocationToken(token, IP_LEGAL)).toEqual({ ok: true, stateAbbr: "CO" });
  });

  it("rejects a genuine token replayed from a different IP", () => {
    const token = signLocationToken("CO", IP_LEGAL);
    const result = verifyLocationToken(token, IP_OTHER);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("ip_mismatch");
  });

  it("rejects when the verifying request has no IP at all", () => {
    const token = signLocationToken("CO", IP_LEGAL);
    expect(verifyLocationToken(token, undefined).ok).toBe(false);
  });

  it("rejects missing/empty tokens", () => {
    expect(verifyLocationToken(undefined, IP_LEGAL).ok).toBe(false);
    expect(verifyLocationToken("", IP_LEGAL).ok).toBe(false);
    expect(verifyLocationToken(null, IP_LEGAL).ok).toBe(false);
  });

  it("rejects garbage tokens", () => {
    for (const bad of ["garbage", "a.b.c", "..", "onlyonepart.", ".onlysig"]) {
      expect(verifyLocationToken(bad, IP_LEGAL).ok).toBe(false);
    }
  });

  it("rejects a tampered token (payload changed, signature kept)", () => {
    const token = signLocationToken("CA", IP_LEGAL);
    const parts = token.split(".");
    expect(parts).toHaveLength(2);
    const [encoded, sig] = parts as [string, string];
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    // Attacker tries to extend expiry (or would swap in another IP hash).
    payload.exp = Date.now() + 1000 * 60 * 60 * 24 * 365;
    const tampered = `${Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")}.${sig}`;
    const result = verifyLocationToken(tampered, IP_LEGAL);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid");
  });

  it("rejects a legacy-shaped token without IP binding (no downgrade path)", () => {
    // Hand-build a payload missing `ih` and sign nothing — must be invalid
    // even before the signature check would fail.
    const payload = { p: "thc-location", s: "CA", exp: Date.now() + 60_000 };
    const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    expect(verifyLocationToken(`${encoded}.AAAA`, IP_LEGAL).ok).toBe(false);
  });

  it("rejects an expired token (valid signature, past 45-min TTL)", () => {
    const token = signLocationToken("NY", IP_LEGAL);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 46 * 60 * 1000);
    const result = verifyLocationToken(token, IP_LEGAL);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("expired");
  });

  it("still accepts a token just inside the TTL", () => {
    const token = signLocationToken("NY", IP_LEGAL);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 44 * 60 * 1000);
    expect(verifyLocationToken(token, IP_LEGAL).ok).toBe(true);
  });

  it("rejects a category token used as a location token (purpose separation)", () => {
    const categoryToken = signCategoryToken("Test THC Seltzer", "thc");
    expect(verifyLocationToken(categoryToken, IP_LEGAL).ok).toBe(false);
  });

  it("rejects a hand-forged location-shaped payload signed as a category token", () => {
    const categoryToken = signCategoryToken('{"p":"thc-location","s":"CA"}', "thc");
    expect(verifyLocationToken(categoryToken, IP_LEGAL).ok).toBe(false);
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
    const token = signLocationToken("WA", IP_LEGAL);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 46 * 60 * 1000);
    const res = await request(app)
      .post("/api/recipes/generate")
      .set("X-Forwarded-For", IP_LEGAL)
      .send({ ...THC_GENERATE_BODY, locationToken: token });
    expect(res.status).toBe(403);
    expect(res.body.reason).toBe("expired");
  });

  it("ATTACK CHAIN: rejects a genuine token replayed from a different IP (403 ip_mismatch)", async () => {
    const token = signLocationToken("WA", IP_LEGAL);
    const res = await request(app)
      .post("/api/recipes/generate")
      .set("X-Forwarded-For", IP_OTHER)
      .send({ ...THC_GENERATE_BODY, locationToken: token });
    expect(res.status).toBe(403);
    expect(res.body.reason).toBe("ip_mismatch");
  });

  it("passes the geo check with a valid token from the bound IP (then hits the category-token rule, 409 — proving the geo layer let it through)", async () => {
    const token = signLocationToken("MI", IP_LEGAL);
    const res = await request(app)
      .post("/api/recipes/generate")
      .set("X-Forwarded-For", IP_LEGAL)
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
    const token = signLocationToken("OR", IP_LEGAL);
    const [encoded] = token.split(".");
    const res = await request(app)
      .post("/api/identify-bottle")
      .set("X-Forwarded-For", IP_LEGAL)
      .send({ imageBase64: "aGVsbG8=", mode: "thc", locationToken: `${encoded}.AAAA` });
    expect(res.status).toBe(403);
  });

  it("ATTACK CHAIN: rejects a token replayed from a different IP on identify", async () => {
    const token = signLocationToken("OR", IP_LEGAL);
    const res = await request(app)
      .post("/api/identify-bottle")
      .set("X-Forwarded-For", IP_OTHER)
      .send({ imageBase64: "aGVsbG8=", mode: "thc", locationToken: token });
    expect(res.status).toBe(403);
    expect(res.body.reason).toBe("ip_mismatch");
  });

  it("END-TO-END ATTACK CHAIN (production): illegal-state caller cannot mint a token by claiming a legal state, and THC endpoints stay closed", async () => {
    restores.push(mockGeo());
    await inProduction(async () => {
      // Step 1: attacker in TX claims CA.
      const mint = await request(app)
        .post("/api/verify-thc-location")
        .set("X-Forwarded-For", IP_ILLEGAL)
        .send({ state: "CA" });
      expect(mint.body.locationToken).toBeUndefined();

      // Step 2: with no token, both THC endpoints refuse.
      const gen = await request(app)
        .post("/api/recipes/generate")
        .set("X-Forwarded-For", IP_ILLEGAL)
        .send(THC_GENERATE_BODY);
      expect(gen.status).toBe(403);

      const idf = await request(app)
        .post("/api/identify-bottle")
        .set("X-Forwarded-For", IP_ILLEGAL)
        .send({ imageBase64: "aGVsbG8=", mode: "thc" });
      expect(idf.status).toBe(403);
    });
  });
});
