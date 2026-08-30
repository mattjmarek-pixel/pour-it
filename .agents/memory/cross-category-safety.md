---
name: Cross-category safety enforcement
description: How PourIt enforces that a product from one mode can never yield another mode's recipes
---

Rule: category integrity is enforced server-side with a deterministic catalog, never by trusting the client or vision model. Known catalog identity/category outranks AI classification.

**Why:** AI can misclassify a known mixer, while a malicious caller can send a compatible product ID with an incompatible product name. Trusting either field independently can bypass category controls or poison an AI prompt.

**How to apply:**
- When both catalog ID and name resolve, require them to identify the same canonical product; reject conflicts and send only the canonical catalog name to AI.
- Unknown products require a short-lived signed attestation of their normalized name and product category. Verify compatibility for the requested mode on every AI endpoint.
- Mixers are compatible with all modes; spirits and THC products are compatible only with their matching mode.
- Keep consumability checks fail-closed before unknown-product category compatibility. A known catalog category may correct an AI spirits/THC misclassification.
- Wrong-mode UI is dismiss-only guidance; never auto-switch modes or offer a bypass.
- Every THC AI path must independently enforce location and category, and prohibit dose, potency, effects, amount, milligrams, redosing, and alcohol mixing.
