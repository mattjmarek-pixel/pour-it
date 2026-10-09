import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import http from "node:http";
import type { Express } from "express";

const mocks = vi.hoisted(() => ({ create: vi.fn(), stream: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = mocks;
  },
}));
// Module isolation gives each case a fresh budget. Avoid spawning a new
// pino-pretty worker (and process-exit listener) on every isolated app import.
vi.mock("../lib/logger", async () => {
  const { default: pino } = await import("pino");
  return { logger: pino({ level: "silent" }) };
});

let app: Express;
const recipe = { title: "Drink", description: "Simple", ingredients: ["ice"], steps: ["Stir"] };
const customize = {
  recipe, prompt: "Less sweet", mode: "spirits",
  productId: "svedka", productName: "Svedka Vodka",
};
const identify = { imageBase64: "aGVsbG8=", mode: "spirits" };
const generate = {
  productId: "svedka", productName: "Svedka Vodka",
  spiritType: "vodka", category: "spirits",
};
beforeEach(async () => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.stubEnv("AI_DAILY_CALL_CAP", "2000");
  vi.stubEnv("CATEGORY_TOKEN_SECRET", "test-only-cost-guard-key");
  app = (await import("../app")).default;
  mocks.create.mockResolvedValue({ content: [{ type: "text", text: "{}" }] });
  mocks.stream.mockImplementation(() => ({
    abort: vi.fn(),
    async *[Symbol.asyncIterator]() {
      yield { type: "content_block_delta", delta: { type: "text_delta", text: "Variation" } };
    },
  }));
});
afterEach(() => vi.unstubAllEnvs());

describe("customization input caps", () => {
  it.each([
    ["prompt", { prompt: "x".repeat(301) }],
    ["productName", { productName: "x".repeat(121) }],
    ["title", { recipe: { ...recipe, title: "x".repeat(501) } }],
    ["name", { recipe: { ...recipe, name: "x".repeat(501) } }],
    ["description", { recipe: { ...recipe, description: "x".repeat(501) } }],
    ["ingredient count", { recipe: { ...recipe, ingredients: Array(31).fill("ice") } }],
    ["ingredient text", { recipe: { ...recipe, ingredients: ["x".repeat(201)] } }],
    ["ingredient object text", { recipe: { ...recipe, ingredients: [{ name: "x".repeat(201) }] } }],
    ["ingredient combined text", { recipe: { ...recipe, ingredients: [{
      amount: "a".repeat(100), unit: "u".repeat(100), name: "ice",
    }] } }],
    ["step count", { recipe: { ...recipe, steps: Array(31).fill("Stir") } }],
    ["step text", { recipe: { ...recipe, steps: ["x".repeat(501)] } }],
  ])("rejects oversized %s before Anthropic", async (_name, override) => {
    const res = await request(app).post("/api/claude-stream").send({ ...customize, ...override });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at most/);
    expect(mocks.stream).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("accepts exact limits and requests only 1200 output tokens with retries disabled", async () => {
    const name = "x".repeat(120);
    const { signCategoryToken } = await import("../utils/categoryToken");
    const res = await request(app).post("/api/claude-stream").send({
      ...customize, productId: undefined, productName: name,
      verificationToken: signCategoryToken(name, "spirits"),
      prompt: "p".repeat(300),
      recipe: { title: "t".repeat(500), name: "n".repeat(500), description: "d".repeat(500),
        ingredients: Array(30).fill("i".repeat(200)), steps: Array(30).fill("s".repeat(500)) },
    });
    expect(res.status).toBe(200);
    expect(res.text).toContain("[DONE]");
    expect(mocks.stream).toHaveBeenCalledWith(
      expect.objectContaining({ max_tokens: 1200 }),
      expect.objectContaining({ signal: expect.any(AbortSignal), maxRetries: 0 }),
    );
    expect(mocks.stream.mock.calls[0][1].signal.aborted).toBe(false);
  });
});

describe("body limits", () => {
  it.each(["json", "form"])("rejects a non-identify %s body above 100kb", async type => {
    const res = await request(app).post("/api/claude-stream")
      .type(type).send({ ...customize, prompt: "x".repeat(103 * 1024) });
    expect(res.status).toBe(413);
    expect(mocks.stream).not.toHaveBeenCalled();
  });
  it("allows an identify JSON body above 100kb with its separate limit", async () => {
    const res = await request(app).post("/api/identify-bottle")
      .send({ ...identify, imageBase64: "A".repeat(150 * 1024) });
    expect(res.status).toBe(200);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.create.mock.calls[0][1].signal.aborted).toBe(false);
  });
  it("rejects an identify body above 8mb without an AI call", async () => {
    const res = await request(app).post("/api/identify-bottle")
      .send({ ...identify, imageBase64: "A".repeat(8 * 1024 * 1024) });
    expect(res.status).toBe(413);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("does not extend the image allowance to other paths under identify", async () => {
    const res = await request(app).post("/api/identify-bottle/other")
      .send({ imageBase64: "A".repeat(150 * 1024) });
    expect(res.status).toBe(413);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

describe("shared daily budget", () => {
  it("shares one budget across all three endpoints and returns 503 before another call", async () => {
    vi.stubEnv("AI_DAILY_CALL_CAP", "3");
    await request(app).post("/api/identify-bottle").send(identify);
    await request(app).post("/api/recipes/generate").send(generate);
    await request(app).post("/api/claude-stream").send(customize);
    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(mocks.stream).toHaveBeenCalledTimes(1);
    for (const [path, body] of [
      ["/api/identify-bottle", identify], ["/api/recipes/generate", generate],
      ["/api/claude-stream", customize],
    ] as const) {
      const res = await request(app).post(path).send(body);
      expect(res.status).toBe(503);
      expect(res.body).toEqual({ error: "ai_capacity_reached" });
      expect(res.headers["content-type"]).toMatch(/application\/json/);
    }
    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(mocks.stream).toHaveBeenCalledTimes(1);
  });
  it("reserves before an in-flight call and counts provider failures", async () => {
    vi.stubEnv("AI_DAILY_CALL_CAP", "1");
    let reject!: (error: Error) => void;
    let started!: () => void;
    const ready = new Promise<void>(done => { started = done; });
    mocks.create.mockImplementation(() => new Promise((_resolve, fail) => { reject = fail; started(); }));
    const first = request(app).post("/api/identify-bottle").send(identify).then(res => res);
    await ready;
    try {
      const second = await request(app).post("/api/claude-stream").send(customize);
      expect(second.status).toBe(503);
      expect(mocks.stream).not.toHaveBeenCalled();
    } finally {
      reject(new Error("Provider failed"));
      await first;
    }
    const third = await request(app).post("/api/identify-bottle").send(identify);
    expect(third.status).toBe(503);
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
  it.each(["", "-1", "1.5", "Infinity", "NaN", "oops", "9007199254740992"])(
    "invalid limit %j falls back to 2000, never unlimited", async value => {
      vi.stubEnv("AI_DAILY_CALL_CAP", value);
      const { createDailyAiBudget, readDailyCallCap } = await import("../routes/aiGuards");
      expect(readDailyCallCap()).toBe(2000);
      const budget = createDailyAiBudget();
      for (let i = 0; i < 2000; i++) expect(budget.reserve()).toBe(true);
      expect(budget.reserve()).toBe(false);
    },
  );
  it("defaults missing/unreadable limits, denies unreadable day state, supports zero, and resets at UTC midnight", async () => {
    const { createDailyAiBudget, readDailyCallCap } = await import("../routes/aiGuards");
    delete process.env.AI_DAILY_CALL_CAP;
    expect(readDailyCallCap()).toBe(2000);
    const fallback = createDailyAiBudget(() => { throw new Error("Unavailable"); });
    for (let i = 0; i < 2000; i++) expect(fallback.reserve()).toBe(true);
    expect(fallback.reserve()).toBe(false);
    expect(createDailyAiBudget(() => 1, () => NaN).reserve()).toBe(false);
    expect(createDailyAiBudget(() => 0).reserve()).toBe(false);
    let time = Date.parse("2026-10-09T23:59:59.999Z");
    const budget = createDailyAiBudget(() => 1, () => time);
    expect(budget.reserve()).toBe(true);
    expect(budget.reserve()).toBe(false);
    time += 1;
    expect(budget.reserve()).toBe(true);
    expect(budget.reserve()).toBe(false);
  });
});

describe("real client disconnects", () => {
  it.each([
    ["/api/claude-stream", customize, "stream"],
    ["/api/identify-bottle", identify, "create"],
    ["/api/recipes/generate", generate, "create"],
  ] as const)("aborts Anthropic when the client abandons %s", async (path, body, method) => {
    let started!: () => void;
    let stopped!: () => void;
    const ready = new Promise<void>(done => { started = done; });
    const aborted = new Promise<void>(done => { stopped = done; });
    const abortStream = vi.fn();
    let signal!: AbortSignal;
    if (method === "stream") {
      mocks.stream.mockImplementation((_params, options) => {
        signal = options.signal;
        let finish!: () => void;
        const pending = new Promise<void>(done => { finish = done; });
        abortStream.mockImplementation(() => { finish(); stopped(); });
        started();
        return { abort: abortStream, async *[Symbol.asyncIterator]() { await pending; } };
      });
    } else {
      mocks.create.mockImplementation((_params, options) => {
        signal = options.signal;
        started();
        return new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => { stopped(); reject(new Error("Aborted")); }, { once: true });
        });
      });
    }
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>(done => server.once("listening", done));
    const address = server.address() as { port: number };
    const client = http.request({ host: "127.0.0.1", port: address.port, method: "POST",
      path, headers: { "Content-Type": "application/json" } });
    client.on("error", () => {});
    try {
      client.end(JSON.stringify(body));
      await ready;
      // A normally completed upload must NOT prematurely abort generation.
      expect(signal.aborted).toBe(false);
      client.destroy();
      await aborted;
      expect(signal.aborted).toBe(true);
      if (method === "stream") expect(abortStream).toHaveBeenCalledTimes(1);
      expect(mocks[method].mock.calls[0][1].maxRetries).toBe(0);
    } finally {
      client.destroy();
      server.closeAllConnections();
      await new Promise<void>(done => server.close(() => done()));
    }
  });
});
