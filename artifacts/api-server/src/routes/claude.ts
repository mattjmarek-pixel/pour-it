import Anthropic from "@anthropic-ai/sdk";
import { Router } from "express";

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

router.post("/claude-stream", async (req, res) => {
  const { recipe, prompt } = req.body as {
    recipe: RecipePayload;
    prompt: string;
  };

  if (!recipe || !prompt) {
    res.status(400).json({ error: "recipe and prompt are required" });
    return;
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
      system:
        "You are a creative mixologist. Given a drink recipe and a user's customization request, suggest a personalized variation with a new name, modified ingredients, and numbered steps. Be specific, fun, and concise. Format your response with: **Recipe Name**, then Ingredients (bulleted list), then Steps (numbered), then a one-line description.",
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
