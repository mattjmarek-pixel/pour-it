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

For failures from Replit's managed Git askpass helper, use the account's Git Providers reconnection flow rather than reconnecting the app integration.
**Why:** Official guidance distinguishes Git pane authentication from integration authentication; a working app integration did not repair the managed helper.
**How to apply:** Ask the user to reconnect GitHub under Account settings → Git Providers, then verify ordinary Git with a dry-run push. Do not claim a successful integration request proves shell Git is repaired.

When purging an exposed value locally, inspect every ref, including Replit's agent branch and ledger, before pruning.
**Why:** Internal agent refs and backup remote-tracking refs retained contaminated history even after main was clean. Protected internal-ref deletion requires an explicit Git override.
**How to apply:** Only with user authorization to remove local recovery history, delete contaminated refs, expire all reflogs, prune, and scan all remaining decompressed objects plus regular files. This does not erase external backups.
