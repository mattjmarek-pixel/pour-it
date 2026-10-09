import Anthropic from "@anthropic-ai/sdk";
import { Router } from "express";
import {
  catalogModeToProductCategory,
  isAppMode,
  isCategoryCompatible,
  type AppMode,
} from "@workspace/category-policy";

import { resolveCatalogProduct } from "../data/catalog";
import { verifyCategoryToken } from "../utils/categoryToken";
import { verifyLocationToken } from "../utils/locationToken";
import { getClientIp } from "../utils/clientIp";

const router = Router();

router.options("/claude-stream", (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
  res.sendStatus(204);
});

interface RecipeIngredientPayload {
  amount?: string;
  unit?: string;
  name?: string;
}

interface RecipePayload {
  title?: string;
  name?: string;
  description?: string;
  ingredients?: (string | RecipeIngredientPayload)[];
  steps?: string[];
}

export function buildCustomizationSystemPrompt(mode: AppMode): string {
  const modeSafety =
    mode === "thc"
      ? `THC CONTENT SAFETY:
- Recipe content is limited to flavor pairing and mixing/preparation instructions.
- Never provide or imply THC dosing, potency, expected effects, amount to use, milligrams, effect-based servings, onset or duration, or redosing guidance.
- Never combine THC with alcohol or suggest adding alcoholic ingredients.
- Do not put a numeric quantity on a THC-containing ingredient; identify it generically and tell the user to follow the product label.`
      : mode === "mocktails"
        ? "MOCKTAIL SAFETY: Use only zero-alcohol, non-THC ingredients."
        : "SPIRITS CONTEXT: Never add THC or cannabis ingredients.";

  return `You are a creative mixologist. Given a drink recipe and a user's customization request, suggest a personalized variation with a new name, modified ingredients, and numbered steps. Be specific and concise. Format your response with: **Recipe Name**, then Ingredients (bulleted list), then Steps (numbered), then a one-line description.

${modeSafety}`;
}

router.post("/claude-stream", async (req, res) => {
  const {
    recipe,
    prompt,
    mode,
    productId,
    productName,
    verificationToken,
    locationToken,
  } = req.body as {
    recipe?: RecipePayload;
    prompt?: unknown;
    mode?: unknown;
    productId?: unknown;
    productName?: unknown;
    verificationToken?: unknown;
    locationToken?: unknown;
  };

  if (
    !recipe ||
    typeof prompt !== "string" ||
    !prompt.trim() ||
    !isAppMode(mode) ||
    typeof productName !== "string" ||
    !productName ||
    (productId !== undefined && typeof productId !== "string") ||
    (verificationToken !== undefined && typeof verificationToken !== "string")
  ) {
    res.status(400).json({
      error: "recipe, prompt, mode, and productName are required",
    });
    return;
  }

  if (mode === "thc") {
    const location = verifyLocationToken(locationToken, getClientIp(req));
    if (!location.ok) {
      res.status(403).json({
        error: "location_restricted",
        reason: location.reason,
        message:
          "THC features require verified location in a state where recreational cannabis is legal.",
      });
      return;
    }
  }

  const catalogResolution = resolveCatalogProduct(
    typeof productId === "string" ? productId : undefined,
    productName
  );
  if (catalogResolution.conflict) {
    res.status(409).json({
      error: "category_mismatch",
      message: "The product ID and name refer to different catalog products.",
    });
    return;
  }
  const catalogEntry = catalogResolution.entry;
  if (catalogEntry) {
    const productCategory = catalogModeToProductCategory(catalogEntry.mode);
    if (!productCategory || !isCategoryCompatible(mode, productCategory)) {
      res.status(409).json({
        error: "category_mismatch",
        message: `${catalogEntry.name} is not compatible with ${mode} customization.`,
      });
      return;
    }
  } else {
    const verification =
      typeof verificationToken === "string"
        ? verifyCategoryToken(verificationToken, productName, mode)
        : ({ ok: false, reason: "invalid" } as const);
    if (!verification.ok) {
      res.status(409).json({
        error:
          verification.reason === "expired"
            ? "token_expired"
            : "category_mismatch",
        message: "Please re-scan the product before customizing it.",
      });
      return;
    }
  }

  const recipeTitle = recipe.title ?? recipe.name ?? "Untitled";
  const ingredientLines = (recipe.ingredients ?? []).map((ing) => {
    if (typeof ing === "string") return ing;
    const measure = [ing.amount ?? "", ing.unit ?? ""].filter(Boolean).join(" ").trim();
    return measure ? `${measure} ${ing.name ?? ""}`.trim() : (ing.name ?? "");
  });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  try {
    const client = new Anthropic({
      apiKey: process.env["AI_INTEGRATIONS_ANTHROPIC_API_KEY"] ?? "dummy",
      baseURL: process.env["AI_INTEGRATIONS_ANTHROPIC_BASE_URL"],
    });

    const recipeContext = `
Recipe: ${recipeTitle}
Description: ${recipe.description ?? ""}
Ingredients: ${ingredientLines.join(", ")}
Steps: ${(recipe.steps ?? []).join(" | ")}
    `.trim();

    const stream = client.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      system: buildCustomizationSystemPrompt(mode),
      messages: [
        {
          role: "user",
          content: `Here is my recipe:\n\n${recipeContext}\n\nCustomization request: ${prompt}`,
        },
      ],
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        res.write(`data: ${JSON.stringify({ content: event.delta.text })}\n\n`);
      }
    }

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    req.log.error({ err }, "Claude stream error");
    res.write(`data: ${JSON.stringify({ error: "AI service unavailable" })}\n\n`);
    res.end();
  }
});

export default router;
