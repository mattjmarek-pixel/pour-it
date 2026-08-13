---
name: Jest + pnpm dual React
description: Fixing "Cannot read properties of null (reading 'useState')" in jest tests in this monorepo
---
Rule: In this pnpm monorepo (node-linker=hoisted), jest resolves `react` via the package-local symlink AND the hoisted root copy as two different modules, breaking the hooks dispatcher under react-test-renderer even when only one react version is installed.
**Why:** Jest keys module identity by resolved path, not realpath — the same .pnpm dir reached via two symlinks becomes two React instances (null `ReactSharedInternals.H`).
**How to apply:** Map `^react$` and `^react/(.*)$` in jest `moduleNameMapper` to the workspace-root `node_modules/react`. Also: ts-jest needs `jsx: 'react-jsx'` in its tsconfig override to transform .tsx sources, and react-test-renderer's version must match react's exactly.
