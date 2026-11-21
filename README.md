# ReThink

ReThink is Grammarly for spending. From online carts to shopping malls, it shows how purchases affect your financial future in real time, giving you a second chance to rethink them.

**HackWestern 13 · Canada Life "Future Me" challenge.**

As you look at clothing on Lululemon, Nike or Uniqlo, a Chrome overlay shows what buying it means for this month's Clothing budget. A mirrored cart keeps the "Future Me" savings graph on your iPhone in sync, and a consented iPhone entering a mall geofence sends you a reminder before you walk in. ReThink informs; it never blocks checkout or touches payment.

## Repo layout

```
packages/shared     Contracts + pure finance math (cents, budget consequence, Future Me forecast). Used by everything.
apps/mobile         iOS app — Expo SDK 58 + expo-router. Tabs: Home, Hotspots, Me.
apps/extension      Chrome extension — WXT + React, Manifest V3. Product overlay, mirrored cart, pairing.
supabase/           Postgres migrations, row-level security, edge functions (pairing, cart, purchase, hotspot, Gemini, push), seed.
docs/SPEC.md        Full product + system spec. Locked decisions live in §1.
docs/PLAN.md        Build order and status.
```

## Prerequisites

- Node 20+ and npm (Node 24 is what we use).
- Chrome.
- An iPhone with Expo Go, plus an Expo account with EAS for development builds. Geofencing and reliable push need a dev build, not Expo Go.
- A Supabase project.
- Apple Developer membership (for dev builds on physical phones).
- Docker only if you want a local Supabase stack; otherwise work against the hosted project.

No Xcode is required: iOS native builds run on EAS.

## Setup

```sh
npm install

cp apps/mobile/.env.example apps/mobile/.env           # Supabase URL + anon key
cp apps/extension/.env.example apps/extension/.env     # Supabase URL + anon key
cp supabase/functions/.env.example supabase/functions/.env   # Gemini key (server only)

npx supabase login && npx supabase link --project-ref <your-ref>
cd apps/mobile && npx eas init && cd ../..
```

## Run

| Command | What it does |
|---|---|
| `npm test` | Shared finance tests (the numbers the whole demo depends on) |
| `npm run typecheck` | `tsc --noEmit` across all workspaces |
| `npm run mobile` | Expo dev server. Scan the QR with Expo Go. |
| `npm run extension` | WXT dev server. It opens Chrome with the extension loaded; edits hot-reload. |
| `npm run extension:build` | Production build to `apps/extension/.output/` (load unpacked from there) |
| `npm run db:push` | Apply migrations to the linked hosted project |
| `npm run db:start` / `db:reset` | Local Supabase via Docker, re-seeded from `supabase/seed.sql` |
| `npm run db:functions` | Serve edge functions locally with `supabase/functions/.env` |

## Non-negotiables

- All money is integer CAD cents. Unknown price is `null`, never `0`.
- Looking at a product or a cart never changes confirmed spending. Only an explicit "I bought this" does, exactly once.
- Finance math is computed in one place, `packages/shared`, and both the phone and the browser call the same functions.
- No secrets in the extension or the app. Device IDs are not credentials.
- A simulated hotspot entry is always labelled "Simulated".

The full list is in `docs/SPEC.md` §1.4.

## Demo fixture

`packages/shared/src/fixtures.ts` is the one fixture: Clothing $200 allocated, $135 spent, hoodie $148 → $83 over, next $300 savings contribution becomes $217 for one month. `supabase/seed.sql` mirrors it.
