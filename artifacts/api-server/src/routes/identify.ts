import Anthropic from "@anthropic-ai/sdk";
import { Router } from "express";

const router = Router();

interface ProductHint {
  id: string;
  name: string;
  brand: string;
  category: string;
}

router.post("/identify-bottle", async (req, res) => {
  const { imageBase64, products } = req.body as {
    imageBase64?: string;
    products?: ProductHint[];
  };

  if (!imageBase64 || !products?.length) {
    res.status(400).json({ error: "imageBase64 and products are required" });
    return;
  }

  try {
    const client = new Anthropic({
      apiKey: process.env["AI_INTEGRATIONS_ANTHROPIC_API_KEY"] ?? "dummy",
      baseURL: process.env["AI_INTEGRATIONS_ANTHROPIC_BASE_URL"],
    });

    const productList = products
      .map((p) => `- ${p.id}: ${p.name} by ${p.brand} (${p.category})`)
      .join("\n");

    const response = await client.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 64,
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
            {
              type: "text",
              text: `Identify the bottle or beverage in this image and match it to one of these products:\n\n${productList}\n\nRespond with ONLY valid JSON, no markdown: {"productId": "id_here"} or {"productId": null} if no match found. Match on brand name, product name, or bottle label text.`,
            },
          ],
        },
      ],
    });

    const raw =
      response.content[0].type === "text" ? response.content[0].text.trim() : "";

    let productId: string | null = null;
    try {
      const parsed = JSON.parse(raw) as { productId?: string | null };
      const candidate = parsed.productId ?? null;
      if (candidate && products.some((p) => p.id === candidate)) {
        productId = candidate;
      }
    } catch {
      req.log.warn({ raw }, "Failed to parse identify-bottle response");
    }

    res.json({ productId });
  } catch (err) {
    req.log.error({ err }, "Identify bottle error");
    res.json({ productId: null });
  }
});

export default router;
