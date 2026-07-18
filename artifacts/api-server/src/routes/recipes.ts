import Anthropic from "@anthropic-ai/sdk";
import { Router } from "express";

import { lookupCatalogById, lookupCatalogByName } from "../data/catalog";

const router = Router();

interface GenerateRequestBody {
  productId?: string;
  productName?: string;
  spiritType?: string;
  flavorNotes?: string[];
  category?: "spirits" | "thc" | "mocktails";
  existingRecipeTitles?: string[];
}

interface GeneratedIngredient {
  amount: string;
  unit: string;
  name: string;
}

interface GeneratedRecipe {
  title: string;
  description: string;
  ingredients: GeneratedIngredient[];
  steps: string[];
  tags: string[];
}

router.options("/generate", (_req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
  res.sendStatus(204);
});

router.post("/generate", async (req, res) => {
  const {
    productId,
    productName,
    spiritType,
    flavorNotes = [],
    category,
    existingRecipeTitles = [],
  } = (req.body ?? {}) as GenerateRequestBody;

  if (!productName || !spiritType || !category) {
    res.status(400).json({
      error: "productName, spiritType, and category are required",
    });
    return;
  }

  // SERVER-SIDE CATEGORY ENFORCEMENT — does not trust the client.
  // If this product is in the known catalog (by id or exact name), its
  // catalog mode must match the requested category, or we refuse to
  // generate. A THC product can never receive a spirits recipe here even
  // if the client is buggy or bypassed.
  const catalogEntry =
    (productId ? lookupCatalogById(productId) : null) ??
    lookupCatalogByName(productName);
  if (catalogEntry && catalogEntry.mode !== category) {
    req.log.warn(
      { productId, productName, requestedCategory: category, actualMode: catalogEntry.mode },
      "Blocked cross-category recipe generation"
    );
    res.status(409).json({
      error: "category_mismatch",
      detectedCategory: catalogEntry.mode,
      message: `${catalogEntry.name} is a ${catalogEntry.mode} product; refusing to generate ${category} recipes for it.`,
    });
    return;
  }

  const systemPrompt = `You are an expert mixologist and drinks consultant. Generate one creative cocktail recipe.
Return ONLY valid JSON matching this exact schema, no other text:
{
  "title": string,
  "description": string (one sentence, evocative),
  "ingredients": [{ "amount": string, "unit": string, "name": string }],
  "steps": string[],
  "tags": string[]
}
Rules:
- The recipe must be achievable with home bar tools
- Ingredients must be real and purchasable
- Steps must be clear and numbered
- Tags should include flavor profile words (e.g. 'citrusy', 'smoky', 'refreshing')
- Do NOT replicate these existing recipes: ${existingRecipeTitles.join(", ") || "(none)"}
- Category context: ${category} (for mocktails, use zero-alcohol ingredients only; for THC, the base product is a cannabis beverage)`;

  const userPrompt = `Product: ${productName}
Spirit type: ${spiritType}
Flavor notes: ${flavorNotes.join(", ") || "(unspecified)"}

Generate one creative recipe that showcases this product.`;

  try {
    const client = new Anthropic({
      apiKey: process.env["AI_INTEGRATIONS_ANTHROPIC_API_KEY"] ?? "dummy",
      baseURL: process.env["AI_INTEGRATIONS_ANTHROPIC_BASE_URL"],
    });

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const text =
      response.content[0]?.type === "text" ? response.content[0].text.trim() : "";

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      req.log.warn({ text }, "AI recipe response did not contain JSON");
      res.status(502).json({ error: "Invalid AI response" });
      return;
    }

    let parsed: GeneratedRecipe;
    try {
      parsed = JSON.parse(jsonMatch[0]) as GeneratedRecipe;
    } catch (parseErr) {
      req.log.warn({ parseErr, text }, "Failed to parse AI recipe JSON");
      res.status(502).json({ error: "Malformed AI response" });
      return;
    }

    if (
      !parsed.title ||
      !parsed.description ||
      !Array.isArray(parsed.ingredients) ||
      !Array.isArray(parsed.steps) ||
      !Array.isArray(parsed.tags)
    ) {
      res.status(502).json({ error: "AI response missing required fields" });
      return;
    }

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.json(parsed);
  } catch (err) {
    req.log.error({ err }, "AI recipe generation failed");
    res.status(503).json({ error: "AI service unavailable" });
  }
});

export default router;
