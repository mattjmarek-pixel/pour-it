---
name: GitHub backup safety
description: Secret-safe history uploads and GitHub authentication boundaries
---
Scan unpublished history, not only the latest working tree, before pushing. Keep signing secrets in protected secret storage, never tracked configuration.
**Why:** An old tracked configuration assignment survived in unpublished commits; removing the latest assignment alone would still expose it on push.
**How to apply:** Rotate exposed signing keys and obtain permission before sanitizing unpublished history. Preserve the history already on GitHub and never force-push as a shortcut.

GitHub connector access does not imply that shell Git authentication works.
**Why:** The connector retained repository write access while Git's stored authentication failed.
**How to apply:** Do not extract connector credentials. If using GitHub's Git database API instead, verify every uploaded blob, tree, and commit hash against local Git and update the branch with force disabled.
