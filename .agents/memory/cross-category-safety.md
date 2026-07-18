---
name: Cross-category safety enforcement
description: How PourIt enforces that a product from one mode can never yield another mode's recipes
---

Rule: category integrity is enforced server-side with a deterministic catalog, never by trusting the client or the vision model's own classification.

**Why:** Safety-critical requirement — a THC product must never yield a Spirits recipe (or vice versa). AI classification can misfire and clients can be bypassed, so the static catalog outranks both.

**How to apply:**
- The server keeps its own product catalog (`api-server/src/data/catalog.ts`) mirroring the mobile catalog. If products are added/moved in the mobile data, update it in lockstep.
- Name lookups for safety checks use aggressive normalization (lowercase, strip diacritics and non-alphanumerics) plus substring containment, so punctuation/spacing tweaks cannot evade the block.
- `/api/identify-bottle` requires `mode`, classifies category+confidence first, and blocks on: non-beverage, uncertain/low confidence, category≠mode, or a catalog cross-check hit — returning no recipe payload in any blocked branch.
- `/api/recipes/generate` returns 409 for any catalog product (by id or fuzzy name) whose mode ≠ requested category.
- Client shows a blocking modal with only "Switch mode" or "Cancel" — no bypass. Mode-switch handoff uses ModeContext `pendingProduct`, consumed only when `pending.mode === screen mode`.
- Note: mobile product mode is structural (`PRODUCTS[mode]` arrays); `Product.category` is a subtype like "Vodka", not the mode.
