# PourIt — Drink Recipe Discovery App

## Overview
PourIt is a cross-platform native mobile app (Expo/React Native) for discovering and customizing drink recipes. It supports three modes with distinct accent colors and AI-powered recipe customization via Anthropic Claude.

## Architecture

### Artifacts
- **`artifacts/pour-it`** (`@workspace/pour-it`) — Expo/React Native mobile app, served via Expo Go
- **`artifacts/api-server`** (`@workspace/api-server`) — Express API server, routes at `/api`

### Key Technologies
- **Expo SDK 54** with Expo Router v6 (file-based routing)
- **Fonts**: Playfair Display (serif headings) + DM Sans (body)
- **Theme**: Dark `#0A0A0F` background
- **State**: React Context (ModeContext, SavedRecipesContext) + AsyncStorage for persistence
- **AI**: Anthropic Claude via Replit AI Integration (SSE streaming)

## App Modes

| Mode | Accent Color | Tab Icon |
|------|-------------|----------|
| Spirits | `#D4A843` (amber) | coffee / wineglass |
| THC | `#7C3AED` (purple) | feather / leaf |
| Mocktails | `#10B981` (emerald) | droplet / drop |

## Screen Flow (per mode)
```
Scan View → [tap category] → Product Grid → Recipe List → AI Panel (bottom sheet)
         → [tap to scan]  → Product found → Recipe List
```

## Key Files

### Mobile App (`artifacts/pour-it/`)
- `app/_layout.tsx` — Root layout: fonts, providers, error boundary
- `app/(tabs)/_layout.tsx` — 4-tab navigation (Spirits, THC, Mocktails, Saved)
- `app/(tabs)/spirits.tsx`, `thc.tsx`, `mocktails.tsx` — Mode screens
- `app/(tabs)/saved.tsx` — Saved recipes screen
- `app/index.tsx` — Root redirect to `/(tabs)/spirits`
- `components/ModeScreen.tsx` — Shared state machine (scan → products → recipes)
- `components/ScanView.tsx` — Animated viewfinder + category chips
- `components/ProductGrid.tsx` — 2-column product grid with fade-in animations
- `components/RecipeList.tsx` — Expandable recipe cards with save functionality
- `components/AIPanel.tsx` — Sliding bottom sheet with SSE streaming from Claude
- `context/ModeContext.tsx` — Global mode state
- `context/SavedRecipesContext.tsx` — AsyncStorage-backed saved recipes
- `constants/colors.ts` — Mode colors, theme tokens
- `src/data/recipes.ts` — 18 products × 3 recipes each (54 total), across 3 modes

### API Server (`artifacts/api-server/`)
- `src/routes/claude.ts` — `POST /api/claude-stream` — SSE streaming with Anthropic SDK
- `src/routes/index.ts` — Router mounting

## Environment Variables
- `AI_INTEGRATIONS_ANTHROPIC_API_KEY` — Replit AI Integration key
- `AI_INTEGRATIONS_ANTHROPIC_BASE_URL` — Replit AI proxy base URL
- `EXPO_PUBLIC_DOMAIN` — Set at runtime to `$REPLIT_DEV_DOMAIN` for API calls
- `SESSION_SECRET` — Express session secret

## Recipe Data
- **Spirits**: Svedka Vodka, Bacardi Rum, Hendricks Gin, Patrón Silver, Maker's Mark, Jameson (6 products)
- **THC**: Cann Social Tonic, House of Saka, Mad Lilly, Keef Cola, Lagunitas Hi-Fi Hops, Lord Jones (6 products)
- **Mocktails**: Seedlip Spice 94, Ghia, Curious Elixirs, Three Spirit, Lyre's, Monday Gin (6 products)

## Notes
- `expo-camera` is installed at `^17.0.10` but Metro resolution fails in pnpm workspace; ScanView uses a simulated tap-to-scan fallback with random product discovery
- `expo-glass-effect` (`isLiquidGlassAvailable`) was removed from tabs layout due to broken native module; uses standard BlurView tabs instead
- All animations use `useNativeDriver: false` for web compatibility
- The Saved tab groups recipes by mode with collapsible cards
