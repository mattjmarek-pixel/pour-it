---
name: Local AI vision allowance
description: Scope and failure-policy decisions for the free vision scan limit.
---
The allowance is intentionally local per installation, not an account-backed or server-enforced entitlement. Barcode catalog matches remain unlimited; an unknown barcode's existing AI fallback is a vision attempt and shares the allowance across modes.
**Why:** The user explicitly chose AsyncStorage with no accounts or sync and confirmed that AI fallback consumes the same allowance.
**How to apply:** Keep quota code independent of My Bar, safety enforcement, and recipe quality. Reviewer configuration bypasses quota only, never safety. Purchases remain visibly disabled until a real entitlement integration exists.

Storage reads/corruption fail closed. Successful results must not be delivered when their usage write fails.
**Why:** Delivering a result with an unrecorded deduction lets a restart grant extra usable identifications; an in-memory hold alone is insufficient.
**How to apply:** Preserve serialized reservations, success-only commits, and lifecycle cancellation. Do not treat storage failure as a fresh allowance or charge failed/uncertain attempts.