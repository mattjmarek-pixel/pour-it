import type { Request, Response } from "express";

const DEFAULT_DAILY_CALL_CAP = 2000;
export function readDailyCallCap(): number {
  try {
    const value = process.env.AI_DAILY_CALL_CAP;
    if (value === undefined || !/^\d+$/.test(value)) return DEFAULT_DAILY_CALL_CAP;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : DEFAULT_DAILY_CALL_CAP;
  } catch {
    return DEFAULT_DAILY_CALL_CAP;
  }
}

// Per server instance, in memory: an interim safety net, NOT exact billing
// control. Restarts reset it; replicas each have their own independent budget.
export function createDailyAiBudget(
  readLimit = readDailyCallCap,
  now = () => Date.now(),
) {
  let day: string | null = null;
  let count = 0;
  return {
    reserve(): boolean {
      try {
        const today = new Date(now()).toISOString().slice(0, 10);
        if (!Number.isSafeInteger(count) || count < 0) return false;
        if (day !== today) { day = today; count = 0; }
        let limit: number;
        try { limit = readLimit(); } catch { limit = DEFAULT_DAILY_CALL_CAP; }
        if (!Number.isSafeInteger(limit) || limit < 0) limit = DEFAULT_DAILY_CALL_CAP;
        if (count >= limit) return false;
        // Synchronous reservation BEFORE calling Anthropic, including failures.
        count += 1;
        return true;
      } catch {
        // Unknown counter/day state must never grant unlimited access.
        return false;
      }
    },
  };
}
const dailyBudget = createDailyAiBudget();

export function beginAiCall(req: Request, res: Response) {
  if (req.aborted || res.destroyed) return null;
  if (!dailyBudget.reserve()) {
    res.status(503).json({ error: "ai_capacity_reached" });
    return null;
  }
  const controller = new AbortController();
  const abort = () => controller.abort();
  const close = () => { if (!res.writableFinished) abort(); };
  // req.close can mean a normally completed request body, NOT a disconnect.
  req.once("aborted", abort);
  res.once("close", close);
  return {
    signal: controller.signal,
    cleanup() {
      req.off("aborted", abort);
      res.off("close", close);
    },
  };
}

const PROMPT_MAX_CHARS = 300;
export function customizationInputError(
  recipe: unknown, prompt: string, productName: string,
): string | null {
  if (prompt.length > PROMPT_MAX_CHARS) return `prompt must be at most ${PROMPT_MAX_CHARS} characters`;
  if (productName.length > 120) return "productName must be at most 120 characters";
  if (!recipe || typeof recipe !== "object" || Array.isArray(recipe)) return "recipe must be an object";
  const r = recipe as Record<string, unknown>;
  for (const field of ["title", "name", "description"]) {
    if (r[field] !== undefined && (typeof r[field] !== "string" || r[field].length > 500)) {
      return `recipe.${field} must be a string of at most 500 characters`;
    }
  }
  if (r.ingredients !== undefined) {
    if (!Array.isArray(r.ingredients) || r.ingredients.length > 30) return "recipe.ingredients must be an array of at most 30 items";
    for (const ingredient of r.ingredients) {
      if (typeof ingredient === "string") {
        if (ingredient.length > 200) return "each ingredient text must be at most 200 characters";
      } else {
        if (!ingredient || typeof ingredient !== "object" || Array.isArray(ingredient)) return "invalid ingredient";
        const parts = ["amount", "unit", "name"].map(key => ingredient[key] ?? "");
        if (parts.some(part => typeof part !== "string") ||
            parts.filter(Boolean).join(" ").length > 200) return "each ingredient text must be at most 200 characters";
      }
    }
  }
  if (r.steps !== undefined && (!Array.isArray(r.steps) || r.steps.length > 30 ||
      r.steps.some(step => typeof step !== "string" || step.length > 500))) {
    return "recipe.steps must have at most 30 strings of at most 500 characters each";
  }
  return null;
}
