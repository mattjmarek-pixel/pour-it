import Anthropic from "@anthropic-ai/sdk";
import { Router } from "express";

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
  | { status: "matched"; productId: string }
  | {
      status: "ai";
      product: {
        name: string;
        brand: string;
        category: string;
        recipes: AIRecipe[];
      };
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
  const { imageBase64, products } = req.body as {
    imageBase64?: string;
    products?: ProductHint[];
  };

  if (!imageBase64) {
    res.status(400).json({ error: "imageBase64 is required" });
    return;
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

    const prompt = `You are identifying a beverage from a photo for a drink-recipe app.

STEP 1 — SAFETY: Decide whether the item in the image is a safe, human-consumable beverage (alcohol, cannabis-infused drinks, mocktails, sodas, juices, water, etc.). If the item is NOT meant for human consumption — for example household cleaner, bleach, medicine, motor oil, paint, solvents, cosmetics, or any non-beverage object — set "isDrink" to false and stop.

STEP 2 — MATCH: If it is a safe drink, check whether it matches one of these known products:
${productList || "(none provided)"}
If it matches, return its exact productId.

STEP 3 — GENERATE: If it is a safe drink but does NOT match any known product, generate the product's name, brand, the best-fit category (exactly one of: "spirits", "thc", "mocktails"), and exactly 3 cocktail/drink recipes that feature it.

Respond with ONLY valid JSON (no markdown, no commentary) in this exact shape:
{
  "isDrink": boolean,
  "productId": string | null,
  "name": string | null,
  "brand": string | null,
  "category": "spirits" | "thc" | "mocktails" | null,
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
- If "isDrink" is false: set every other field to null and "recipes" to [].
- If it matches a known product: set "productId" and you may set "recipes" to [].
- If it is a drink with no match: set "productId" to null and provide "name", "brand", "category", and exactly 3 recipes.
- If you genuinely cannot identify any beverage in the image: set "isDrink" to true only if you are confident it is a drink; otherwise set "name" to null with "recipes" [].`;

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
      isDrink?: boolean;
      productId?: string | null;
      name?: string | null;
      brand?: string | null;
      category?: string | null;
      recipes?: unknown;
    };
    try {
      parsed = JSON.parse(stripFences(raw));
    } catch {
      req.log.warn({ raw }, "Failed to parse identify-bottle response");
      const out: IdentifyResponse = { status: "not_found" };
      res.json(out);
      return;
    }

    if (parsed.isDrink === false) {
      const out: IdentifyResponse = { status: "not_a_drink" };
      res.json(out);
      return;
    }

    const candidate = parsed.productId ?? null;
    if (candidate && hints.some((p) => p.id === candidate)) {
      const out: IdentifyResponse = { status: "matched", productId: candidate };
      res.json(out);
      return;
    }

    const recipes = Array.isArray(parsed.recipes)
      ? parsed.recipes.filter(isRecipe)
      : [];
    const category =
      parsed.category && VALID_CATEGORIES.has(parsed.category)
        ? parsed.category
        : null;

    if (parsed.name && category && recipes.length >= 3) {
      const out: IdentifyResponse = {
        status: "ai",
        product: {
          name: parsed.name,
          brand: parsed.brand ?? parsed.name,
          category,
          recipes: recipes.slice(0, 3),
        },
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
