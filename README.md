# PourIt

AI-powered drink recipe discovery — scan a bottle label and get instant, customizable cocktail recipes.

## Modes

| Mode | Color | Description |
|------|-------|-------------|
| 🥃 Spirits | Amber `#D4A843` | Classic cocktails from 6 premium spirits |
| 🌿 THC | Purple `#7C3AED` | Cannabis-infused beverages |
| 🍃 Mocktails | Emerald `#10B981` | Non-alcoholic craft drinks |

## Features

- **Bottle scanning** — tap to open your camera, aim at any bottle label; Claude Vision identifies the product and surfaces matching recipes
- **54 curated recipes** — 18 products × 3 recipes each, across all three modes
- **AI customization** — stream a personalized variation from Claude with your own twist (e.g. "make it spicier", "less sweet")
- **Save favorites** — recipes persist between sessions via AsyncStorage
- **Dark theme** — near-black `#0A0A0F` background; Playfair Display + DM Sans typography

## Prerequisites

- Node.js 20+
- pnpm 9+ (`npm install -g pnpm`)
- Expo Go app on your iOS or Android device (for local development)

## Local Setup

### 1. Install dependencies

```bash
pnpm install
```

### 2. Set environment variables

Create a `.env` file or export these in your shell:

| Variable | Description |
|----------|-------------|
| `AI_INTEGRATIONS_ANTHROPIC_API_KEY` | Anthropic API key for Claude |
| `AI_INTEGRATIONS_ANTHROPIC_BASE_URL` | Anthropic base URL (or leave blank for default) |
| `EXPO_PUBLIC_DOMAIN` | Domain where the API server is reachable (e.g. `localhost:8080` locally) |
| `SESSION_SECRET` | Secret for Express session signing |

On Replit, these are injected automatically via the Replit AI Integration and Secrets panel.

### 3. Start the API server

```bash
pnpm --filter @workspace/api-server run dev
```

The server starts on `PORT` (default 8080) and exposes:
- `GET  /api/healthz` — health check
- `POST /api/claude-stream` — SSE streaming recipe customization
- `POST /api/identify-bottle` — Claude Vision bottle identification

### 4. Start the Expo app

```bash
pnpm --filter @workspace/pour-it run dev
```

Scan the QR code with Expo Go on your device.

## Architecture

```
workspace/
├── artifacts/
│   ├── api-server/     # Express + Anthropic SDK (Node 20, ESM)
│   └── pour-it/        # Expo SDK 54 / React Native app
├── lib/
│   ├── api-client-react/  # Generated React Query hooks
│   ├── api-spec/          # OpenAPI contract
│   ├── api-zod/           # Zod validation schemas
│   └── db/                # Drizzle ORM schema
└── scripts/               # Shared utility scripts
```

### How AI streaming works

1. User types a customization prompt in the AI panel (e.g. "more tropical")
2. The Expo app POSTs `{ recipe, prompt }` to `/api/claude-stream`
3. The API opens a streaming connection to Anthropic and forwards SSE tokens as `data: {"content": "..."}` events
4. The client reads the stream chunk-by-chunk and appends tokens to the UI in real time
5. The stream ends with `data: [DONE]`
6. A 30-second client-side timeout aborts the request if no response arrives

### How bottle scanning works

1. User taps the scanner button — the native camera opens via `expo-image-picker`
2. The captured image (JPEG, 50% quality) is base64-encoded and sent to `/api/identify-bottle`
3. The API calls Claude claude-3-5-sonnet with the image + a list of product names for the current mode
4. Claude returns the matched product ID (or `null` if unrecognized)
5. If matched, the app navigates to that product's recipes; if not, a friendly message is shown

## Running Tests

```bash
pnpm test
```

Or just the Expo app tests:

```bash
pnpm --filter @workspace/pour-it run test
```

## Type Checking

```bash
pnpm typecheck
```

## Known Limitations

- Bottle scanning requires a physical device with a camera; the web preview falls back to random product discovery
- Hero banner images are stored locally in `artifacts/pour-it/assets/images/` and are not currently tracked in Git (binary files exceed the API proxy size limit)
- AI responses depend on Anthropic API availability and your API key quota

## Roadmap

- Barcode scanning via product barcode databases
- User accounts and cloud sync for saved recipes
- Social sharing of AI-generated variations
- Seasonal and regional recipe packs
