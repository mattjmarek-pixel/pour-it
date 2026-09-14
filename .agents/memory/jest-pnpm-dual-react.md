---
name: Jest + pnpm dual React
description: Fixing "Cannot read properties of null (reading 'useState')" in jest tests in this monorepo
---
Use the isolated pnpm linker and keep Jest on the app-local React identity.
**Why:** Hoisted installs produced duplicate native expo-constants installations even after clean reinstalls. Switching to isolated linking resolved Expo Doctor's duplicate-module finding during the SDK 57 upgrade. Historically, mixed root/local React paths also broke the test-renderer hooks dispatcher.
**How to apply:** Do not restore hoisted linking merely to fix an undeclared dependency. Declare dependencies in the package using them, and keep Jest and react-test-renderer resolving the same React copy.

After SDK dependency upgrades, a hoisted install can retain stale peer-linked React or Jest packages even when the lockfile is correct and a forced install succeeds.
**Why:** Expo Doctor observed an old React peer installation and Jest resolved mixed major-version internals after alignment.
**How to apply:** If installed resolutions contradict the lockfile, clean generated node_modules and reinstall from the frozen lockfile rather than masking Doctor checks or adding dependency overrides.

Stop Metro before changing installed dependencies.
**Why:** During a pnpm SDK upgrade, Metro watched a transient package-install directory that was removed, crashing with ENOENT. This is a watcher/install race, not evidence of broken application logic.
**How to apply:** Complete dependency installation before restarting the existing managed Expo workflow; do not add application fallbacks for a stale watcher.
