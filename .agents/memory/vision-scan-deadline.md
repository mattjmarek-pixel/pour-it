---
name: Vision scan deadline
description: Why PourIt's shared scan deadline must include realistic camera and AI-identification latency.
---

Keep the vision scan deadline end-to-end, but size it to cover both native camera capture and the identification request. Treat My Bar persistence as post-success best-effort work outside that failure path.

**Why:** Live requests showed identification alone taking about 11 seconds. A 12-second shared budget had already spent time on camera capture and aborted otherwise valid responses around 10.7–11.0 seconds into the request.

**How to apply:** When changing capture, identification models, or timeout behavior, inspect live request durations and preserve immediate scan unlock on genuine timeout. Never let optional post-success storage surface as identification failure.