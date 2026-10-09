import Anthropic from "@anthropic-ai/sdk";
import { Router } from "express";
import {
  catalogModeToProductCategory,
  isAppMode,
  isCategoryCompatible,
  isProductCategory,
  type ProductCategory,
} from "@workspace/category-policy";

import { lookupCatalogById, lookupCatalogByName } from "../data/catalog";
import { signCategoryToken } from "../utils/categoryToken";
import { verifyLocationToken } from "../utils/locationToken";
import { getClientIp } from "../utils/clientIp";

const router = Router();

interface ProductHint { id: string; name: string; brand: string; category: string }
interface AIRecipeIngredient { amount: string; unit: string; name: string }
interface AIRecipe {
  title: string; description: string; ingredients: AIRecipeIngredient[]; steps: string[]; tags: string[];
}
type IdentifyResponse =
  | { status: "not_a_drink" } | { status: "uncertain" }
  | { status: "category_mismatch"; detectedCategory: string; label: string }
  | { status: "matched"; productId: string }
  | { status: "ai"; product: { name: string; brand: string; category: string; recipes: AIRecipe[] }; verificationToken: string }
  | { status: "not_found" };

function stripFences(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}
function isIngredient(value: unknown): value is AIRecipeIngredient {
  if (typeof value !== "object" || value === null) return false;
  const o = value as Record<string, unknown>;
  return typeof o.amount === "string" && typeof o.unit === "string" && typeof o.name === "string";
}
function isRecipe(value: unknown): value is AIRecipe {
  if (typeof value !== "object" || value === null) return false;
  const o = value as Record<string, unknown>;
  return typeof o.title === "string" && typeof o.description === "string" &&
    Array.isArray(o.ingredients) && o.ingredients.every(isIngredient) &&
    Array.isArray(o.steps) && o.steps.every((v) => typeof v === "string") &&
    Array.isArray(o.tags) && o.tags.every((v) => typeof v === "string");
}
type Classification = {
  category: ProductCategory | "non_beverage" | "uncertain"; confidence: "high" | "low";
  productId: string | null; name: string | null; brand: string | null; recipes: unknown[];
};
function isClassification(value: unknown): value is Classification {
  if (typeof value !== "object" || value === null) return false;
  const o = value as Record<string, unknown>;
  return (isProductCategory(o.category) || o.category === "non_beverage" || o.category === "uncertain") &&
    (o.confidence === "high" || o.confidence === "low") &&
    (typeof o.productId === "string" || o.productId === null) &&
    (typeof o.name === "string" || o.name === null) && (typeof o.brand === "string" || o.brand === null) &&
    Array.isArray(o.recipes);
}

router.post("/identify-bottle", async (req, res) => {
  const { imageBase64, products, mode, locationToken } = req.body as {
    imageBase64?: string; products?: ProductHint[]; mode?: unknown; locationToken?: string;
  };
  if (!imageBase64) { res.status(400).json({ error: "imageBase64 is required" }); return; }
  if (!isAppMode(mode)) {
    res.status(400).json({ error: 'mode is required and must be one of "spirits", "thc", "mocktails"' }); return;
  }
  // Keep this first THC-specific route gate fail-closed.
  if (mode === "thc") {
    const loc = verifyLocationToken(locationToken, getClientIp(req));
    if (!loc.ok) {
      req.log.warn({ reason: loc.reason }, "Blocked THC identify without valid location token");
      res.status(403).json({ error: "location_restricted", reason: loc.reason,
        message: "THC features require verified location in a state where recreational cannabis is legal." }); return;
    }
  }
  const productList = (products ?? []).map((p) => `- ${p.id}: ${p.name} by ${p.brand} (${p.category})`).join("\n");
  const thcRecipeSafety = mode === "thc"
    ? `\nTHC CONTENT SAFETY: Recipe content is limited to flavor pairing and preparation. Never provide or imply THC dose, potency, effects, amount to use, milligrams, effect-based servings, onset or duration, or redosing guidance. Never combine THC with alcohol. Do not put a numeric quantity on a THC-containing ingredient; tell the user to follow the product label.`
    : "";
  const prompt = `You are identifying a beverage from a photo for a drink-recipe app. Classification comes FIRST.
Classify exactly one: "spirits" (alcoholic liquor), "thc" (drinkable cannabis products), "mixer" (safe drinkable non-alcoholic liquids only: juice, soda, water, syrup, brine, broth, zero-proof beverages), "non_beverage", or "uncertain".
Never classify powders, spices, pastes, or non-liquid pantry items as mixer; classify them non_beverage or uncertain. Use non_beverage for anything not safely meant for human drinking. Report confidence "high" or "low"; unreadable or ambiguous labels are low/uncertain.
Mode is "${mode}". Compatibility is mixer in all modes, spirits only in spirits, thc only in thc. Only identify or provide recipes for a compatible category with high confidence.
Known products:\n${productList || "(none provided)"}
Return ONLY JSON: {"category":"spirits"|"thc"|"mixer"|"non_beverage"|"uncertain","confidence":"high"|"low","productId":string|null,"name":string|null,"brand":string|null,"recipes":[{"title":string,"description":string,"ingredients":[{"amount":string,"unit":string,"name":string}],"steps":[string],"tags":[string]}]}.
For non_beverage, uncertain, low confidence, incompatible categories, or mixer categories, set recipes []. Mixer recipes are evaluated later by a separate quality gate. For compatible high-confidence unknown spirits or THC products give exactly 3 recipes.${thcRecipeSafety}`;
  try {
    const client = new Anthropic({ apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY ?? "dummy", baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL });
    const response = await client.messages.create({ model: "claude-sonnet-4-6", max_tokens: 3000, messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: imageBase64 } }, { type: "text", text: prompt }] }] });

    const block = response.content.find((b) => b.type === "text");
    const raw = block?.type === "text" ? block.text : "";
    let parsed: unknown;
    try { parsed = JSON.parse(stripFences(raw)); } catch {
      req.log.warn({ raw }, "Failed to parse identify-bottle response"); res.json({ status: "uncertain" } satisfies IdentifyResponse); return;
    }
    if (!isClassification(parsed)) {
      req.log.warn({ raw }, "Invalid identify-bottle response shape"); res.json({ status: "uncertain" } satisfies IdentifyResponse); return;
    }
    const known = (parsed.productId ? lookupCatalogById(parsed.productId) : null) ?? (parsed.name ? lookupCatalogByName(parsed.name) : null);
    const knownCategory = known ? catalogModeToProductCategory(known.mode) : null;

    // Resolve known catalog identity before trusting the model's category or
    // confidence. Unknown products continue through the same fail-closed AI
    // classification gates below.
    if (!known) {
      if (parsed.category === "non_beverage") {
        res.json({ status: "not_a_drink" } satisfies IdentifyResponse);
        return;
      }
      if (parsed.category === "uncertain" || parsed.confidence !== "high" || !isProductCategory(parsed.category)) {
        res.json({ status: "uncertain" } satisfies IdentifyResponse);
        return;
      }
    }

    const effectiveCategory = knownCategory ?? (
      isProductCategory(parsed.category) ? parsed.category : null
    );
    if (!effectiveCategory) {
      res.json({ status: "uncertain" } satisfies IdentifyResponse);
      return;
    }
    if (!isCategoryCompatible(mode, effectiveCategory)) {
      res.json({
        status: "category_mismatch",
        detectedCategory: effectiveCategory,
        label: known?.name ?? parsed.name ?? "",
      } satisfies IdentifyResponse);
      return;
    }
    if (known && (!knownCategory || !isCategoryCompatible(mode, knownCategory))) {
      req.log.warn({ name: parsed.name, productId: parsed.productId, mode, actualMode: known.mode }, "Blocked catalog category mismatch");
      res.json({ status: "category_mismatch", detectedCategory: knownCategory ?? "unknown", label: known.name } satisfies IdentifyResponse); return;
    }
    if (parsed.productId && (products ?? []).some((p) => p.id === parsed.productId)) {
      res.json({ status: "matched", productId: parsed.productId } satisfies IdentifyResponse); return;
    }
    const recipes = parsed.recipes.filter(isRecipe);
    const productCategory = effectiveCategory;
    if (parsed.name && (productCategory === "mixer" || recipes.length >= 3)) {
      res.json({
        status: "ai",
        product: {
          name: parsed.name,
          brand: parsed.brand ?? parsed.name,
          category: productCategory,
          recipes: productCategory === "mixer" ? [] : recipes.slice(0, 3),
        },
        verificationToken: signCategoryToken(parsed.name, productCategory),
      } satisfies IdentifyResponse);
      return;
    }
    res.json({ status: "not_found" } satisfies IdentifyResponse);
  } catch (err) {
    req.log.error({ err }, "Identify bottle error"); res.json({ status: "not_found" } satisfies IdentifyResponse);
  }
});
export default router;
