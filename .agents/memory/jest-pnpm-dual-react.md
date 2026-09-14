---
name: Jest + pnpm dual React
description: Fixing "Cannot read properties of null (reading 'useState')" in jest tests in this monorepo
---
Rule: In this pnpm monorepo (node-linker=hoisted), jest resolves `react` via the package-local symlink AND the hoisted root copy as two different modules, breaking the hooks dispatcher under react-test-renderer even when only one react version is installed.
**Why:** Jest keys module identity by resolved path, not realpath — the same .pnpm dir reached via two symlinks becomes two React instances (null `ReactSharedInternals.H`).
**How to apply:** Map `^react$` and `^react/(.*)$` in jest `moduleNameMapper` to the workspace-root `node_modules/react`. Also: ts-jest needs `jsx: 'react-jsx'` in its tsconfig override to transform .tsx sources, and react-test-renderer's version must match react's exactly.

After SDK dependency upgrades, a hoisted install can retain stale peer-linked React or Jest packages even when the lockfile is correct and a forced install succeeds.
**Why:** Expo Doctor observed an old React peer installation and Jest resolved mixed major-version internals after alignment.
**How to apply:** If installed resolutions contradict the lockfile, clean generated node_modules and reinstall from the frozen lockfile rather than masking Doctor checks or adding dependency overrides.

Stop Metro before changing installed dependencies.
**Why:** During a pnpm SDK upgrade, Metro watched a transient package-install directory that was removed, crashing with ENOENT. This is a watcher/install race, not evidence of broken application logic.
**How to apply:** Complete dependency installation before restarting the existing managed Expo workflow; do not add application fallbacks for a stale watcher.
