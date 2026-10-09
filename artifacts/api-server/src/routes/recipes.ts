import Anthropic from "@anthropic-ai/sdk";
import { beginAiCall } from "./aiGuards";
import { Router } from "express";
import {
  catalogModeToProductCategory,
  isAppMode,
  isCategoryCompatible,
  type AppMode,
  type ProductCategory,
} from "@workspace/category-policy";

import { resolveCatalogProduct } from "../data/catalog";
import { verifyCategoryToken } from "../utils/categoryToken";
import { verifyLocationToken } from "../utils/locationToken";
import { getClientIp } from "../utils/clientIp";

const router = Router();
interface GenerateRequestBody {
  productId?: unknown; productName?: unknown; spiritType?: unknown; flavorNotes?: unknown;
  category?: unknown; existingRecipeTitles?: unknown; verificationToken?: unknown; locationToken?: unknown;
  pairingProductId?: unknown; pairingProductName?: unknown; pairingVerificationToken?: unknown;
}
interface GeneratedIngredient { amount: string; unit: string; name: string }
interface GeneratedRecipe { title: string; description: string; ingredients: GeneratedIngredient[]; steps: string[]; tags: string[] }
type QualityResponse = GeneratedRecipe | { status: "no_strong_pairing"; message: string };

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
function isRecipe(value: unknown): value is GeneratedRecipe {
  if (typeof value !== "object" || value === null) return false;
  const o = value as Record<string, unknown>;
  return typeof o.title === "string" && typeof o.description === "string" &&
    Array.isArray(o.ingredients) && o.ingredients.every((ingredient) => {
      if (typeof ingredient !== "object" || ingredient === null) return false;
      const i = ingredient as Record<string, unknown>;
      return typeof i.amount === "string" && typeof i.unit === "string" && typeof i.name === "string";
    }) && isStringArray(o.steps) && isStringArray(o.tags);
}
function isQualityResponse(value: unknown): value is QualityResponse {
  if (isRecipe(value)) return true;
  return typeof value === "object" && value !== null &&
    (value as Record<string, unknown>).status === "no_strong_pairing" &&
    typeof (value as Record<string, unknown>).message === "string";
}

export function buildRecipeSystemPrompt(
  category: AppMode,
  existingRecipeTitles: string[],
  qualityGateEnabled: boolean,
): string {
  const thcSafety = category === "thc"
    ? `\nTHC CONTENT SAFETY:
- Recipe content is limited to flavor pairing and mixing/preparation instructions.
- Never provide or imply THC dosing, potency, expected effects, amount to use, milligrams, effect-based servings, onset or duration, or redosing guidance.
- Never combine THC with alcohol or suggest adding alcoholic ingredients.
- Do not put a numeric quantity on a THC-containing ingredient; identify it generically and tell the user to follow the product label.`
    : "";
  const responseSchema = qualityGateEnabled
    ? `Assess whether a strong pairing exists, then return ONLY valid JSON: either {"status":"no_strong_pairing","message":string} for a rare weak pairing, or {"title":string,"description":string,"ingredients":[{"amount":string,"unit":string,"name":string}],"steps":[string],"tags":[string]}.`
    : `Return ONLY valid JSON: {"title":string,"description":string,"ingredients":[{"amount":string,"unit":string,"name":string}],"steps":[string],"tags":[string]}.`;
  return `You are an expert mixologist and drinks consultant. ${responseSchema}
Rules:
- Recipes must be achievable with home bar tools using real purchasable ingredients.
- Steps must be clear and numbered. Tags are flavor-profile words.
- Do NOT replicate: ${existingRecipeTitles.join(", ") || "(none)"}.
- Category context: ${category}; mocktails use zero-alcohol ingredients only.${thcSafety}`;
}

router.options("/generate", (_req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
  res.sendStatus(204);
});

router.post("/generate", async (req, res) => {
  const body = (req.body ?? {}) as GenerateRequestBody;
  const { category } = body;
  if (!isAppMode(category)) {
    res.status(400).json({ error: 'category is required and must be one of "spirits", "thc", "mocktails"' }); return;
  }
  // This remains the first mode-specific safety gate and fails closed.
  if (category === "thc") {
    const loc = verifyLocationToken(body.locationToken, getClientIp(req));
    if (!loc.ok) {
      req.log.warn({ reason: loc.reason }, "Blocked THC recipe generation without valid location token");
      res.status(403).json({ error: "location_restricted", reason: loc.reason,
        message: "THC features require verified location in a state where recreational cannabis is legal." }); return;
    }
  }
  if (typeof body.productName !== "string" || !body.productName || typeof body.spiritType !== "string" || !body.spiritType) {
    res.status(400).json({ error: "productName, spiritType, and category are required" }); return;
  }
  if ((body.productId !== undefined && typeof body.productId !== "string") ||
    (body.verificationToken !== undefined && typeof body.verificationToken !== "string") ||
    !isStringArray(body.flavorNotes ?? []) || !isStringArray(body.existingRecipeTitles ?? [])) {
    res.status(400).json({ error: "Invalid recipe request" }); return;
  }
  const productName = body.productName;
  const productId = body.productId as string | undefined;
  const verificationToken = body.verificationToken as string | undefined;
  const flavorNotes = (body.flavorNotes ?? []) as string[];
  const existingRecipeTitles = (body.existingRecipeTitles ?? []) as string[];
  const catalogResolution = resolveCatalogProduct(productId, productName);
  if (catalogResolution.conflict) {
    res.status(409).json({
      error: "category_mismatch",
      message: "The product ID and name refer to different catalog products.",
    });
    return;
  }
  const catalogEntry = catalogResolution.entry;
  const verifiedProductName = catalogEntry?.name ?? productName;
  let baseCategory: ProductCategory;
  if (catalogEntry) {
    const catalogCategory = catalogModeToProductCategory(catalogEntry.mode);
    if (!catalogCategory || !isCategoryCompatible(category, catalogCategory)) {
      res.status(409).json({ error: "category_mismatch", detectedCategory: catalogCategory ?? "unknown", message: `${catalogEntry.name} is not compatible with ${category} recipes.` }); return;
    }
    baseCategory = catalogCategory;
  } else {
    const verification = verificationToken ? verifyCategoryToken(verificationToken, productName, category) : { ok: false as const, reason: "invalid" as const };
    if (!verification.ok) {
      res.status(409).json(verification.reason === "expired"
        ? { error: "token_expired", message: "Verification expired — please re-scan the product to continue." }
        : { error: "category_mismatch", message: `Cannot verify "${productName}" for ${category}; please re-scan the product.` });
      return;
    }
    baseCategory = verification.productCategory;
  }
  const hasPairingInput = body.pairingProductId !== undefined || body.pairingProductName !== undefined || body.pairingVerificationToken !== undefined;
  if (hasPairingInput) {
    if (category === "mocktails" || baseCategory !== "mixer" || typeof body.pairingProductName !== "string" || !body.pairingProductName ||
      (body.pairingProductId !== undefined && typeof body.pairingProductId !== "string") ||
      (body.pairingVerificationToken !== undefined && typeof body.pairingVerificationToken !== "string")) {
      res.status(400).json({ error: "Pairing is only allowed for a mixer base in spirits or THC mode." }); return;
    }
    const pairingResolution = resolveCatalogProduct(
      typeof body.pairingProductId === "string" ? body.pairingProductId : undefined,
      body.pairingProductName
    );
    if (pairingResolution.conflict) {
      res.status(409).json({
        error: "category_mismatch",
        message: "The pairing product ID and name refer to different catalog products.",
      });
      return;
    }
    const pairing = pairingResolution.entry;
    const pairingCategory = pairing ? catalogModeToProductCategory(pairing.mode) : null;
    const pairingVerification = !pairingCategory && typeof body.pairingVerificationToken === "string"
      ? verifyCategoryToken(body.pairingVerificationToken, body.pairingProductName, category)
      : null;
    if (pairingCategory ? pairingCategory !== category : !pairingVerification?.ok || pairingVerification.productCategory !== category) {
      res.status(409).json({ error: "category_mismatch", message: "The specified pairing must be a verified product for this mode." }); return;
    }
  }
  const qualityGateEnabled = baseCategory === "mixer" && (category === "spirits" || category === "thc");
  const verifiedPairingName =
    hasPairingInput && typeof body.pairingProductName === "string"
      ? resolveCatalogProduct(
          typeof body.pairingProductId === "string" ? body.pairingProductId : undefined,
          body.pairingProductName
        ).entry?.name ?? body.pairingProductName
      : undefined;
  const system = buildRecipeSystemPrompt(category, existingRecipeTitles, qualityGateEnabled);
  const baseLabel = qualityGateEnabled ? "Mixer base" : "Product";
  const user = `${baseLabel}: ${verifiedProductName}\nProduct type: ${body.spiritType}\nFlavor notes: ${flavorNotes.join(", ") || "(unspecified)"}${verifiedPairingName ? `\nOptional ${category} pairing product: ${verifiedPairingName}` : ""}\n${qualityGateEnabled ? "Generate a recipe only when it is a strong pairing." : "Generate one creative recipe."}`;
  const call = beginAiCall(req, res);
  if (!call) return;
  try {
    const client = new Anthropic({ apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY ?? "dummy", baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL });
    const response = await client.messages.create({ model: "claude-sonnet-4-6", max_tokens: 1500, system, messages: [{ role: "user", content: user }] }, { signal: call.signal, maxRetries: 0 });
    if (call.signal.aborted) return;
    const text = response.content[0]?.type === "text" ? response.content[0].text.trim() : "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) { res.status(502).json({ error: "Invalid AI response" }); return; }
    let parsed: unknown;
    try { parsed = JSON.parse(match[0]); } catch { res.status(502).json({ error: "Malformed AI response" }); return; }
    if ((!qualityGateEnabled && !isRecipe(parsed)) || (qualityGateEnabled && !isQualityResponse(parsed))) {
      res.status(502).json({ error: "AI response missing required fields" }); return;
    }
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (
      qualityGateEnabled &&
      typeof parsed === "object" &&
      parsed !== null &&
      (parsed as Record<string, unknown>).status === "no_strong_pairing"
    ) {
      const modeLabel = category === "spirits" ? "Spirits" : "THC";
      res.json({
        status: "no_strong_pairing",
        message: `We couldn't find a pairing we'd actually recommend for this in ${modeLabel} mode.`,
      });
      return;
    }
    res.json(parsed);
  } catch (err) {
    if (call.signal.aborted) return;
    req.log.error({ err }, "AI recipe generation failed"); res.status(503).json({ error: "AI service unavailable" });
  } finally {
    call.cleanup();
  }
});
export default router;
