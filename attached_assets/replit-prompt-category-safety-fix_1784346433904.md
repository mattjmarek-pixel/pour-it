# Replit Agent Prompt: THC/Spirits Cross-Category Safety Fix

Copy-paste everything below into Replit Agent.

---

I need to eliminate cross-category mixups between Spirits and THC products in pour-it. This is a safety-critical fix: a THC product must never be able to produce a spirits-mode recipe or vice versa, under any tap sequence or code path. Treat this as a hard fail-safe, not a UI nicety — enforcement must happen server-side, not just in the mobile UI.

## 1. Catalog audit
- Find the product catalog (wherever the 36 products with UPCs live).
- Confirm every product has a `category` field with value exactly `'spirits'`, `'thc'`, or `'mocktail'`.
- Fix any products missing this field or with inconsistent values.
- Report which ones you fixed.

## 2. Barcode scan mismatch check (client-side, first pass)
- Find wherever barcode scan results are matched to catalog products.
- After a successful UPC lookup, compare `product.category` to the currently active app mode.
- If they don't match: do NOT render the product card or recipes. Set a state indicating a category mismatch, including the product's actual category and name, and show `CrossCategoryWarningModal` (see #4).

## 3. AI vision: two-stage classification (artifacts/api-server/src/routes/identify.ts)
- Update the system prompt sent to the Claude API so the model returns category classification FIRST, as structured JSON:
  ```json
  {
    "category": "spirits" | "thc" | "mocktail" | "non_beverage" | "uncertain",
    "confidence": "high" | "low",
    "identification": { ... }
  }
  ```
- Only populate `identification` if category is high-confidence AND matches what's needed (product name is fine to include for display in a mismatch message).
- In the route handler:
  - If category is high-confidence and does NOT match the mode passed in the request → return `{ "type": "category_mismatch", "detectedCategory": "...", "label": "..." }`. Do NOT include a full identification/recipe payload in this response.
  - If confidence is `"low"` or category is `"uncertain"` → return `{ "type": "uncertain" }`. Never guess and proceed. Uncertain must block, not default to the active mode.

## 4. Server-side enforcement in recipe generation — THIS IS THE CRITICAL STEP
- In `/api/recipes/generate` (or wherever recipe generation happens), before generating anything: re-verify `product.category === requestedMode` server-side.
- If they don't match, refuse to generate — return an error response, not a recipe. This check must NOT depend on the client having already validated anything. Assume the client check can be bypassed, buggy, or skipped, and make this endpoint safe regardless.
- Apply the same logic to any other endpoint that returns recipe or product detail content keyed by category.

## 5. Mobile UI: CrossCategoryWarningModal
- Create `artifacts/pour-it/components/CrossCategoryWarningModal.tsx`.
- Props: `detectedCategory` (`'spirits' | 'thc' | 'mocktail'`), `currentMode`, `productName` (optional), `onSwitchMode()`, `onCancel()`.
- Content: plain, factual message stating what was detected vs. current mode, e.g. "This looks like a THC product, but you're in Spirits mode."
- Exactly two actions:
  - "Switch to [detectedCategory] mode" → calls `onSwitchMode()`, which changes the app's active mode and re-triggers identification/lookup in that mode.
  - "Cancel" → dismiss, return to scanner.
- No "Continue anyway" option. No swipe-to-dismiss or tap-outside-to-dismiss that reveals product/recipe content underneath. This must be a fully blocking modal with no bypass path.
- Style consistently with existing modals/tier badges (amber/CLASSIC, grey/CRAFT, purple/AI conventions), but use distinct warning styling — do not reuse `ErrorFallback`'s error styling, since this is a safety notice, not an error.

## 6. Uncertain results
- Anywhere an "uncertain" classification can occur (AI vision only, since barcode lookups are deterministic), show a simple "Couldn't confirm what this is — try scanning again or check the label" state. No recipe or product screen should be reachable from this state.

## 7. Wire it up
- In the barcode scan handler and the AI identify handler, check for `category_mismatch` and `uncertain` response types and show the appropriate blocking UI instead of navigating to the product/recipe screen.

## 8. Verification — show me all of this
1. The updated system prompt in `identify.ts`.
2. The mismatch-check logic in the barcode scan handler.
3. The server-side category check added to `/api/recipes/generate` (or equivalent).
4. The full contents of `CrossCategoryWarningModal.tsx`.
5. `grep` output confirming no code path renders recipe content when a `category_mismatch` or `uncertain` result is returned.
6. List of any catalog products that were missing or had incorrect `category` fields.
7. **Manual test confirmation**: scan or upload a photo of a known THC product while the app is in Spirits mode, and confirm no recipe screen is reachable through any tap sequence — including if you try to bypass the modal. Describe exactly what you did to test this and what happened.

Do not consider this task complete until step 8.7 has been actually performed and confirmed, not just implemented.
