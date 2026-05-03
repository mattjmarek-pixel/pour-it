# PourIt — Drink Recipe Discovery App

## Overview
PourIt is a cross-platform native mobile app (Expo/React Native) for discovering and customizing drink recipes. It supports three modes with distinct accent colors, AI-powered recipe customization via Anthropic Claude (SSE streaming), and real camera-based bottle identification using Claude Vision.

## Architecture

### Artifacts
- **`artifacts/pour-it`** (`@workspace/pour-it`) — Expo/React Native mobile app, served via Expo Go
- **`artifacts/api-server`** (`@workspace/api-server`) — Express API server, routes at `/api`

### Key Technologies
- **Expo SDK 54** with Expo Router v6 (file-based routing)
- **Fonts**: Playfair Display (serif headings) + DM Sans (body)
- **Theme**: Dark `#0A0A0F` background
- **State**: React Context (ModeContext, SavedRecipesContext) + AsyncStorage for persistence
- **AI**: Anthropic Claude via Replit AI Integration (SSE streaming + Vision)
- **Camera**: `expo-image-picker` (`launchCameraAsync`) for bottle capture
- **Animations**: `useNativeDriver: true` for all transform/opacity; `LayoutAnimation` for expand/collapse

## App Modes

| Mode | Accent Color | Tab Icon |
|------|-------------|----------|
| Spirits | `#D4A843` (amber) | coffee / wineglass |
| THC | `#7C3AED` (purple) | feather / leaf |
| Mocktails | `#10B981` (emerald) | droplet / drop |

## Screen Flow (per mode)
```
Scan View → [tap camera]     → Camera opens → Claude Vision identifies bottle → Recipe List
          → [tap category]   → Product Grid → Recipe List
          → Recipe List      → Expand card  → AI Panel (SSE stream)
                                            → Save recipe → Saved Tab
```

## Key Files

### Mobile App (`artifacts/pour-it/`)
- `app/_layout.tsx` — Root layout: fonts, providers, UIManager setup for Android LayoutAnimation
- `app/(tabs)/_layout.tsx` — 4-tab navigation (Spirits, THC, Mocktails, Saved)
- `app/(tabs)/spirits.tsx`, `thc.tsx`, `mocktails.tsx` — Mode screens
- `app/(tabs)/saved.tsx` — Saved recipes screen with empty state illustration
- `app/index.tsx` — Root redirect to `/(tabs)/spirits`
- `components/ModeScreen.tsx` — Shared state machine (scan → products → recipes)
- `components/ScanView.tsx` — Camera capture via expo-image-picker + category chips; graceful no-match / error states
- `components/ProductGrid.tsx` — 2-column product grid with native-driver fade-in animations
- `components/RecipeList.tsx` — Expandable recipe cards using LayoutAnimation; native-driver scale on press
- `components/AIPanel.tsx` — Sliding bottom sheet with SSE streaming, 30s timeout, retry button, pulsing skeleton, cleanup on dismiss
- `context/ModeContext.tsx` — Global mode state
- `context/SavedRecipesContext.tsx` — AsyncStorage-backed saved recipes
- `constants/colors.ts` — Mode colors, theme tokens
- `src/data/recipes.ts` — 18 products × 3 recipes each (54 total), across 3 modes
- `src/__tests__/recipes.test.ts` — 19 data integrity tests (jest + ts-jest, node env)
- `jest.config.js` — ts-jest in node environment for pure TypeScript tests
- `metro.config.js` — Fixed for pnpm workspace: `nodeModulesPaths` + `watchFolders`

### API Server (`artifacts/api-server/`)
- `src/routes/claude.ts` — `POST /api/claude-stream` — SSE streaming with Anthropic SDK
- `src/routes/identify.ts` — `POST /api/identify-bottle` — Claude Vision bottle identification (accepts base64 image + product hints, returns matched productId)
- `src/routes/index.ts` — Router mounting
- `src/app.ts` — Express app with 10MB JSON body limit for image uploads

## Environment Variables
- `AI_INTEGRATIONS_ANTHROPIC_API_KEY` — Replit AI Integration key
- `AI_INTEGRATIONS_ANTHROPIC_BASE_URL` — Replit AI proxy base URL
- `EXPO_PUBLIC_DOMAIN` — Set at runtime to `$REPLIT_DEV_DOMAIN` for API calls
- `SESSION_SECRET` — Express session secret

## Recipe Data
- **Spirits**: Svedka Vodka, Bacardi Rum, Hendricks Gin, Patrón Silver, Maker's Mark, Jameson (6 products)
- **THC**: Cann Social Tonic, House of Saka, Mad Lilly, Keef Cola, Lagunitas Hi-Fi Hops, Lord Jones (6 products)
- **Mocktails**: Seedlip Spice 94, Ghia, Curious Elixirs, Three Spirit, Lyre's, Monday Gin (6 products)

## CI
- `.github/workflows/ci.yml` — Runs `pnpm typecheck` and `pnpm test` on push/PR to main (Node 20, pnpm 9, store caching)

## Testing
- `pnpm test` — runs all workspace tests
- `pnpm --filter @workspace/pour-it run test` — 19 recipe data integrity tests

## TypeScript
- `pnpm typecheck` — zero errors across all 4 workspace artifacts
