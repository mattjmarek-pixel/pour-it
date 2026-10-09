import { afterEach, beforeEach, expect, it, vi } from "vitest";
import request from "supertest";
import express from "express";
import app from "../app";
import { setIpGeoResolver } from "../utils/ipGeo";

const legalIp = "203.0.113.10";
const otherIp = "203.0.113.99";
const endpoints = [
  ["/api/identify-bottle", { imageBase64: "aGVsbG8=", mode: "thc" }],
  ["/api/recipes/generate", {
    productName: "Test THC Seltzer", spiritType: "thc seltzer", category: "thc",
  }],
] as const;
let restoreGeo: () => void;
beforeEach(() => {
  vi.stubEnv("CATEGORY_TOKEN_SECRET", "test-only-thc-acceptance-signing-key");
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("THC_ALLOW_SELF_REPORTED_STATE", "false");
  vi.stubEnv("TRUSTED_PROXY_IPS", "");
  restoreGeo = setIpGeoResolver(async ip => ({
    stateAbbr: ip === legalIp ? "CA" : "TX",
  }));
});
afterEach(() => {
  restoreGeo();
  vi.unstubAllEnvs();
});

it.each(endpoints)('no valid token blocks %s', async (path, body) => {
  for (const token of [undefined, "invalid.token"]) {
    const res = await request(app).post(path)
      .set("X-Forwarded-For", legalIp).send({ ...body, locationToken: token });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("location_restricted");
  }
});

it.each(endpoints)('token issued by API cannot be replayed from another IP on %s', async (path, body) => {
  const issued = await request(app).post("/api/verify-thc-location")
    .set("X-Forwarded-For", legalIp).send({ state: "CA" });
  expect(issued.status).toBe(200);
  expect(issued.body.legal).toBe(true);
  expect(issued.body.locationToken).toEqual(expect.any(String));
  const replay = await request(app).post(path)
    .set("X-Forwarded-For", otherIp)
    .send({ ...body, locationToken: issued.body.locationToken });
  expect(replay.status).toBe(403);
  expect(replay.body.reason).toBe("ip_mismatch");
});

it('untrusted socket peer cannot spoof a legal IP with X-Forwarded-For', async () => {
  // Supertest uses loopback (a trusted proxy). Override only the transport
  // address to simulate a direct untrusted peer; all application logic is real.
  const harness = express();
  harness.use((req, _res, next) => {
    Object.defineProperty(req.socket, "remoteAddress", { value: otherIp, configurable: true });
    next();
  });
  harness.use(app);
  const resolver = vi.fn(async (ip: string) => ({
    stateAbbr: ip === legalIp ? "CA" : "TX",
  }));
  const restore = setIpGeoResolver(resolver);
  try {
    const res = await request(harness).post("/api/verify-thc-location")
      .set("X-Forwarded-For", legalIp).send({ state: "CA" });
    expect(resolver).toHaveBeenCalledWith(otherIp);
    expect(resolver).not.toHaveBeenCalledWith(legalIp);
    expect(res.status).toBe(200);
    expect(res.body.legal).toBe(false);
    expect(res.body.stateAbbr).toBe("TX");
    expect(res.body.locationToken).toBeUndefined();
  } finally {
    restore();
  }
});
