import Anthropic from "@anthropic-ai/sdk";
import { Router } from "express";

import { lookupCatalogById, lookupCatalogByName } from "../data/catalog";
import { signCategoryToken } from "../utils/categoryToken";
import { verifyLocationToken } from "../utils/locationToken";

const router = Router();

interface ProductHint {
  id: string;
  name: string;
  brand: string;
  category: string;
}

interface AIRecipeIngredient {
  amount: string;
  unit: string;
  name: string;
}

interface AIRecipe {
  title: string;
  description: string;
  ingredients: AIRecipeIngredient[];
  steps: string[];
  tags: string[];
}

type IdentifyResponse =
  | { status: "not_a_drink" }
  | { status: "uncertain" }
  | { status: "category_mismatch"; detectedCategory: string; label: string }
  | { status: "matched"; productId: string }
  | {
      status: "ai";
      product: {
        name: string;
        brand: string;
        category: string;
        recipes: AIRecipe[];
      };
      verificationToken: string;
    }
  | { status: "not_found" };

const VALID_CATEGORIES = new Set(["spirits", "thc", "mocktails"]);

function stripFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function isIngredient(v: unknown): v is AIRecipeIngredient {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o["amount"] === "string" &&
    typeof o["unit"] === "string" &&
    typeof o["name"] === "string"
  );
}

function isRecipe(v: unknown): v is AIRecipe {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o["title"] === "string" &&
    typeof o["description"] === "string" &&
    Array.isArray(o["ingredients"]) &&
    o["ingredients"].every(isIngredient) &&
    Array.isArray(o["steps"]) &&
    o["steps"].every((s) => typeof s === "string") &&
    Array.isArray(o["tags"]) &&
    o["tags"].every((t) => typeof t === "string")
  );
}

router.post("/identify-bottle", async (req, res) => {
  const { imageBase64, products, mode, locationToken } = req.body as {
    imageBase64?: string;
    products?: ProductHint[];
    mode?: string;
    locationToken?: string;
  };

  if (!imageBase64) {
    res.status(400).json({ error: "imageBase64 is required" });
    return;
  }

  if (!mode || !VALID_CATEGORIES.has(mode)) {
    res.status(400).json({
      error: 'mode is required and must be one of "spirits", "thc", "mocktails"',
    });
    return;
  }

  // SERVER-SIDE THC GEO-ENFORCEMENT — parallel to the category-token layer.
  // THC identification requires a server-signed location token proving the
  // user's state was verified as legal. Missing/invalid/expired/illegal all
  // fail closed, so bypassing the app's UI gate and calling this endpoint
  // directly does not grant THC access.
  if (mode === "thc") {
    const loc = verifyLocationToken(locationToken);
    if (!loc.ok) {
      req.log.warn({ reason: loc.reason }, "Blocked THC identify without valid location token");
      res.status(403).json({
        error: "location_restricted",
        reason: loc.reason,
        message:
          "THC features require verified location in a state where recreational cannabis is legal.",
      });
      return;
    }
  }

  const hints = products ?? [];

  try {
    const client = new Anthropic({
      apiKey: process.env["AI_INTEGRATIONS_ANTHROPIC_API_KEY"] ?? "dummy",
      baseURL: process.env["AI_INTEGRATIONS_ANTHROPIC_BASE_URL"],
    });

    const productList = hints
      .map((p) => `- ${p.id}: ${p.name} by ${p.brand} (${p.category})`)
      .join("\n");

    const prompt = `You are identifying a beverage from a photo for a drink-recipe app. Classification comes FIRST and gates everything else.

STAGE 1 — CATEGORY CLASSIFICATION (always do this first):
Classify the item in the image into exactly one category:
- "spirits": alcoholic spirits/liquor (vodka, rum, gin, tequila, whiskey, etc.)
- "thc": cannabis-infused beverages or drinkable cannabis products (THC/CBD seltzers, tonics, syrups, drops)
- "mocktails": non-alcoholic, non-cannabis drink products (zero-proof spirits, mixers, sodas, juices, sparkling water)
- "non_beverage": anything NOT meant for safe human drinking — household cleaner, bleach, medicine, motor oil, paint, solvents, cosmetics, food, or any non-drink object
- "uncertain": you cannot confidently tell what the item is or which category it belongs to

Also report "confidence": "high" or "low". If the label is unreadable, the product is ambiguous (e.g. cannot tell if a seltzer contains THC), or you are guessing — use "low" confidence or "uncertain". NEVER guess a category to be helpful.

STAGE 2 — IDENTIFICATION (ONLY if Stage 1 category is "${mode}" with high confidence):
The app is currently in "${mode}" mode. Only if the item's category is exactly "${mode}" AND confidence is high:
a) If it matches one of these known products, return its exact productId:
${productList || "(none provided)"}
b) Otherwise provide "name", "brand", and exactly 3 drink recipes featuring it.

If the category is NOT "${mode}", still report the category and, if clearly readable, the product's name (for display in a warning) — but do NOT provide recipes and do NOT provide a productId.

Respond with ONLY valid JSON (no markdown, no commentary) in this exact shape:
{
  "category": "spirits" | "thc" | "mocktails" | "non_beverage" | "uncertain",
  "confidence": "high" | "low",
  "productId": string | null,
  "name": string | null,
  "brand": string | null,
  "recipes": [
    {
      "title": string,
      "description": string,
      "ingredients": [{ "amount": string, "unit": string, "name": string }],
      "steps": [string],
      "tags": [string]
    }
  ]
}

Rules:
- "category" and "confidence" must ALWAYS be set.
- If category is "non_beverage" or "uncertain": productId null, recipes [].
- If category !== "${mode}": productId null, recipes []. "name" may be set for display only.
- If category === "${mode}" with high confidence and a known product matches: set productId, recipes may be [].
- If category === "${mode}" with high confidence and no match: name, brand, and exactly 3 recipes.`;

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 3000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/jpeg",
                data: imageBase64,
              },
            },
            { type: "text", text: prompt },
          ],
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    const raw = textBlock && textBlock.type === "text" ? textBlock.text : "";

    let parsed: {
      category?: string;
      confidence?: string;
      productId?: string | null;
      name?: string | null;
      brand?: string | null;
      recipes?: unknown;
    };
    try {
      parsed = JSON.parse(stripFences(raw));
    } catch {
      req.log.warn({ raw }, "Failed to parse identify-bottle response");
      const out: IdentifyResponse = { status: "uncertain" };
      res.json(out);
      return;
    }

    const category = typeof parsed.category === "string" ? parsed.category : "";
    const confidence =
      typeof parsed.confidence === "string" ? parsed.confidence : "low";

    // Hard gate 1: non-consumable items are always blocked.
    if (category === "non_beverage") {
      const out: IdentifyResponse = { status: "not_a_drink" };
      res.json(out);
      return;
    }

    // Hard gate 2: uncertain or low-confidence classifications never proceed.
    // Uncertain blocks — it must not default to the active mode.
    if (
      category === "uncertain" ||
      confidence !== "high" ||
      !VALID_CATEGORIES.has(category)
    ) {
      const out: IdentifyResponse = { status: "uncertain" };
      res.json(out);
      return;
    }

    // Hard gate 3: category mismatch — server-side enforcement regardless of
    // whatever payload the model produced. No identification or recipes leave
    // the server in this branch.
    if (category !== mode) {
      const out: IdentifyResponse = {
        status: "category_mismatch",
        detectedCategory: category,
        label: typeof parsed.name === "string" ? parsed.name : "",
      };
      res.json(out);
      return;
    }

    // Hard gate 4 (deterministic, does not trust the model's classification):
    // if the identified name or productId maps to a KNOWN catalog product of
    // a different mode, block — even if the model claimed the category is
    // fine. The static catalog outranks the vision model.
    const knownEntry =
      (parsed.productId ? lookupCatalogById(parsed.productId) : null) ??
      (typeof parsed.name === "string" ? lookupCatalogByName(parsed.name) : null);
    if (knownEntry && knownEntry.mode !== mode) {
      req.log.warn(
        { name: parsed.name, productId: parsed.productId, mode, actualMode: knownEntry.mode },
        "Blocked cross-category identification via catalog cross-check"
      );
      const out: IdentifyResponse = {
        status: "category_mismatch",
        detectedCategory: knownEntry.mode,
        label: knownEntry.name,
      };
      res.json(out);
      return;
    }

    // Category verified === mode with high confidence from here on.
    const candidate = parsed.productId ?? null;
    if (candidate && hints.some((p) => p.id === candidate)) {
      const out: IdentifyResponse = { status: "matched", productId: candidate };
      res.json(out);
      return;
    }

    const recipes = Array.isArray(parsed.recipes)
      ? parsed.recipes.filter(isRecipe)
      : [];

    if (parsed.name && recipes.length >= 3) {
      // Non-catalog product verified as matching the requested mode: issue a
      // short-lived signed token so /recipes/generate can later prove this
      // name+category pairing was server-verified (not client-asserted).
      const out: IdentifyResponse = {
        status: "ai",
        product: {
          name: parsed.name,
          brand: parsed.brand ?? parsed.name,
          category: mode,
          recipes: recipes.slice(0, 3),
        },
        verificationToken: signCategoryToken(parsed.name, mode),
      };
      res.json(out);
      return;
    }

    const out: IdentifyResponse = { status: "not_found" };
    res.json(out);
  } catch (err) {
    req.log.error({ err }, "Identify bottle error");
    const out: IdentifyResponse = { status: "not_found" };
    res.json(out);
  }
});

export default router;
