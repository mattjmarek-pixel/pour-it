import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import {
  catalogModeToProductCategory,
  isAppMode,
  isCategoryCompatible,
  isProductCategory,
} from "@workspace/category-policy";

process.env.CATEGORY_TOKEN_SECRET = "category-compatibility-test-secret";

const create = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class Anthropic {
    messages = { create };
  },
}));

import app from "../app";
import { buildCustomizationSystemPrompt } from "../routes/claude";
import { buildRecipeSystemPrompt } from "../routes/recipes";
import { signCategoryToken, verifyCategoryToken } from "../utils/categoryToken";
import { signLocationToken } from "../utils/locationToken";

describe("shared category compatibility policy", () => {
  it.each(["spirits", "thc", "mocktails"])("allows mixers in %s mode", (mode) => {
    expect(isCategoryCompatible(mode, "mixer")).toBe(true);
  });

  it.each([
    ["spirits", "thc"], ["thc", "spirits"], ["mocktails", "spirits"], ["mocktails", "thc"],
  ])("rejects incompatible mode/product pair %s/%s", (mode, product) => {
    expect(isCategoryCompatible(mode, product)).toBe(false);
  });

  it("fails closed for unknown runtime values and maps catalog mocktails to mixers", () => {
    expect(isAppMode("wine")).toBe(false);
    expect(isProductCategory("mocktails")).toBe(false);
    expect(isCategoryCompatible("spirits", "mocktails")).toBe(false);
    expect(catalogModeToProductCategory("mocktails")).toBe("mixer");
  });
});

describe("category token product semantics", () => {
  it("binds a token to a verified product category, not exact app mode", () => {
    const mixer = signCategoryToken("Fresh Lime Juice", "mixer");
    expect(verifyCategoryToken(mixer, "Fresh Lime Juice", "spirits")).toEqual({ ok: true, productCategory: "mixer" });
    expect(verifyCategoryToken(mixer, "Fresh Lime Juice", "thc")).toEqual({ ok: true, productCategory: "mixer" });
    expect(verifyCategoryToken(mixer, "Fresh Lime Juice", "mocktails")).toEqual({ ok: true, productCategory: "mixer" });
    expect(verifyCategoryToken(mixer, "Other Juice", "spirits").ok).toBe(false);
    expect(verifyCategoryToken(signCategoryToken("Vodka", "spirits"), "Vodka", "thc").ok).toBe(false);
  });
});

describe("recipe quality and THC prompt safety", () => {
  it("returns distinct 200 no_strong_pairing for a compatible mixer base after catalog safety checks", async () => {
    create.mockResolvedValueOnce({ content: [{ type: "text", text: '{"status":"no_strong_pairing","message":"No especially natural pairing here."}' }] });
    const response = await request(app).post("/api/recipes/generate").send({
      productId: "fresh-juices", productName: "Fresh Pressed Juices", spiritType: "juice", category: "spirits",
    });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "no_strong_pairing",
      message: "We couldn't find a pairing we'd actually recommend for this in Spirits mode.",
    });
  });

  it("contains the explicit THC safety prohibition", () => {
    const prompt = buildRecipeSystemPrompt("thc", [], true);
    for (const phrase of ["THC dosing", "potency", "effects", "amount to use", "milligrams", "effect-based servings", "redosing", "Never combine THC with alcohol"]) {
      expect(prompt).toContain(phrase);
    }
  });

  it("only enables no_strong_pairing for mixer bases in spirits or THC", async () => {
    const weak = '{"status":"no_strong_pairing","message":"No especially natural pairing here."}';
    create.mockResolvedValueOnce({ content: [{ type: "text", text: weak }] });
    const mixerInSpirits = await request(app).post("/api/recipes/generate").send({
      productId: "fresh-juices", productName: "Fresh Pressed Juices", spiritType: "juice", category: "spirits",
      pairingProductId: "svedka", pairingProductName: "Svedka Vodka",
    });
    expect(mixerInSpirits.status).toBe(200);
    expect(mixerInSpirits.body.status).toBe("no_strong_pairing");
    const call = create.mock.calls.at(-1)?.[0] as { messages: Array<{ content: string }> };
    expect(call.messages[0]?.content).toContain("Mixer base: Fresh Pressed Juices");
    expect(call.messages[0]?.content).toContain("Optional spirits pairing product: Svedka Vodka");

    create.mockResolvedValueOnce({ content: [{ type: "text", text: weak }] });
    const mixerInThc = await request(app).post("/api/recipes/generate").send({
      productId: "fresh-juices", productName: "Fresh Pressed Juices", spiritType: "juice", category: "thc",
      pairingProductId: "wynk", pairingProductName: "Wynk Seltzer", locationToken: signLocationToken("IL"),
    });
    expect(mixerInThc.status).toBe(200);
    expect(mixerInThc.body.status).toBe("no_strong_pairing");

    create.mockResolvedValueOnce({ content: [{ type: "text", text: weak }] });
    const ordinarySpirit = await request(app).post("/api/recipes/generate").send({
      productId: "svedka", productName: "Svedka Vodka", spiritType: "vodka", category: "spirits",
    });
    expect(ordinarySpirit.status).toBe(502);

    create.mockResolvedValueOnce({ content: [{ type: "text", text: weak }] });
    const mixerInMocktails = await request(app).post("/api/recipes/generate").send({
      productId: "fresh-juices", productName: "Fresh Pressed Juices", spiritType: "juice", category: "mocktails",
    });
    expect(mixerInMocktails.status).toBe(502);
  });

  it("enforces pairing direction and active-mode category", async () => {
    const spiritBase = await request(app).post("/api/recipes/generate").send({
      productId: "svedka", productName: "Svedka Vodka", spiritType: "vodka", category: "spirits",
      pairingProductId: "fresh-juices", pairingProductName: "Fresh Pressed Juices",
    });
    expect(spiritBase.status).toBe(400);

    const wrongPairing = await request(app).post("/api/recipes/generate").send({
      productId: "fresh-juices", productName: "Fresh Pressed Juices", spiritType: "juice", category: "spirits",
      pairingProductId: "wynk", pairingProductName: "Wynk Seltzer",
    });
    expect(wrongPairing.status).toBe(409);

    const mocktailPairing = await request(app).post("/api/recipes/generate").send({
      productId: "fresh-juices", productName: "Fresh Pressed Juices", spiritType: "juice", category: "mocktails",
      pairingProductId: "svedka", pairingProductName: "Svedka Vodka",
    });
    expect(mocktailPairing.status).toBe(400);
  });
});

describe("catalog precedence during identification", () => {
  it("allows a known mixer when vision mislabels its category", async () => {
    create.mockResolvedValueOnce({
      content: [{
        type: "text",
        text: JSON.stringify({
          category: "thc",
          confidence: "high",
          productId: "fevertree",
          name: "Fever-Tree Mixers",
          brand: "Fever-Tree",
          recipes: [],
        }),
      }],
    });

    const response = await request(app).post("/api/identify-bottle").send({
      imageBase64: "aGVsbG8=",
      mode: "spirits",
      products: [{
        id: "fevertree",
        name: "Fever-Tree Mixers",
        brand: "Fever-Tree",
        category: "Mixers",
      }],
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "matched",
      productId: "fevertree",
    });
  });
});

describe("THC AI customization enforcement", () => {
  it("rejects THC customization without a location token", async () => {
    const response = await request(app).post("/api/claude-stream").send({
      recipe: { title: "THC Cooler", ingredients: [], steps: [] },
      prompt: "Make it tropical",
      mode: "thc",
      productId: "wynk",
      productName: "Wynk Seltzer",
    });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("location_restricted");
  });

  it("rejects a THC catalog product disguised as a Spirits customization", async () => {
    const response = await request(app).post("/api/claude-stream").send({
      recipe: { title: "Disguised THC Cooler", ingredients: [], steps: [] },
      prompt: "Add citrus",
      mode: "spirits",
      productId: "wynk",
      productName: "Wynk Seltzer",
    });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("category_mismatch");
  });

  it("rejects conflicting catalog IDs and names during customization", async () => {
    const response = await request(app).post("/api/claude-stream").send({
      recipe: { title: "Disguised THC Cooler", ingredients: [], steps: [] },
      prompt: "Add citrus",
      mode: "spirits",
      productId: "svedka",
      productName: "Wynk Seltzer",
    });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("category_mismatch");
  });

  it("uses the same explicit THC content prohibitions for customization", () => {
    const prompt = buildCustomizationSystemPrompt("thc");
    for (const phrase of [
      "THC dosing",
      "potency",
      "expected effects",
      "amount to use",
      "milligrams",
      "effect-based servings",
      "redosing",
      "Never combine THC with alcohol",
    ]) {
      expect(prompt).toContain(phrase);
    }
  });
});

describe("catalog identity consistency", () => {
  it("rejects a compatible base ID paired with an incompatible known name", async () => {
    const response = await request(app).post("/api/recipes/generate").send({
      category: "spirits",
      productId: "svedka",
      productName: "Wynk Seltzer",
      spiritType: "vodka",
      flavorNotes: [],
      existingRecipeTitles: [],
    });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("category_mismatch");
  });

  it("rejects conflicting catalog identity in a mixer pairing", async () => {
    const response = await request(app).post("/api/recipes/generate").send({
      category: "spirits",
      productId: "fevertree",
      productName: "Fever-Tree Mixers",
      spiritType: "premium tonic",
      flavorNotes: ["quinine"],
      existingRecipeTitles: [],
      pairingProductId: "svedka",
      pairingProductName: "Wynk Seltzer",
    });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("category_mismatch");
  });
});