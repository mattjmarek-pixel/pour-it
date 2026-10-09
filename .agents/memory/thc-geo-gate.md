---
name: THC geo-gate
description: How PourIt gates the THC tab by US state legality
---
Rule: THC tab access is gated client-side, fail-closed — only an affirmative match against the recreational-legal state list (GPS reverse-geocode or manual self-report) unlocks it; denied permission, geocode failure, or unknown state block.
**Why:** Cannabis legality varies by state; the user required fail-closed behavior and a manual fallback.
**How to apply:** Gate is session-scoped with a 30-min TTL re-check on tab focus; nothing persists across launches. Legal-state list is data (updated Aug 2026) the user must keep current as laws change. expo-location `reverseGeocodeAsync` returns nothing on web — web goes straight to manual state selection. Record failed check timestamps too, or stale-check logic loops checking↔unverified and hides the manual fallback. Server-side trust boundary: never treat a client claim (state, X-Forwarded-For, NODE_ENV assumptions) as location proof — derive it server-side, bind tokens to the caller, and make every unverifiable/unset-config path fail closed; dev conveniences must be explicit opt-ins that can't turn into production fail-open. Keep server and client legal lists in lockstep. Known limit: IP geolocation is not VPN-proof — no network-level geo control is.
