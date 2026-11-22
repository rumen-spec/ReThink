# ReThink

**ReThink puts friction back into spending.** Cash had friction built in; tapping does not. From online carts to shopping malls, ReThink shows what a purchase does to your budget and your future savings before you make it, in real time, on every device you shop from.

**HackWestern 13 · Canada Life "Future Me" challenge.**

As you look at a hoodie on Alo or a lipstick on Fenty Beauty, a Chrome overlay shows what buying it means for this month's Clothing or Beauty budget. The cart you build in the browser keeps the Future Me savings graph on your iPhone in sync over a websocket, and crossing a budget buzzes the phone on its own. A consented phone entering a mall geofence sends a reminder before you walk in. ReThink informs; it never blocks checkout or touches payment.

Demo stores are Shopify storefronts (Frank And Oak, Alo, OVO, Fenty Beauty, Glossier, tentree, Peace Collective) plus Lululemon overlay-only; see `docs/RETAILERS.md`.

## Repo layout

```
packages/shared     Contracts + pure finance math (cents, budget consequence, month available,
                    Future Me forecast, product classifier). Used by everything. 89 tests.
apps/mobile         iOS app — Expo SDK 58 + expo-router. Tabs: Home, Hotspots, Me, plus an edit sheet.
apps/extension      Chrome extension — WXT + React, Manifest V3. Product overlay, mirrored cart,
                    pairing, "I bought this" with undo.
supabase/           Postgres migrations, row-level security, edge functions (pairing, cart, purchase,
                    hotspot, push), seed.
docs/SPEC.md        Full product + system spec. Locked decisions live in §1; amendments at the top.
docs/PLAN.md        Build order, status, and the design tokens.
docs/DEMO.md        Demo runbook: pitch, run of show, checklists, fallbacks.
docs/demo/hook.html Opening screen: a month of small purchases, self-contained, no network.
```

## Prerequisites

- Node 20+ and npm (Node 24 is what we use).
- Chrome.
- An iPhone and an Expo account with EAS. **A development build is required**, not Expo Go:
  notifications, geofencing and maps are native modules Expo Go does not carry.
- A Supabase project.
- Apple Developer membership, for dev builds on a physical phone.
- Xcode, only if you want to run the app on an iOS simulator (used as a hotspot trigger).
- Docker only if you want a local Supabase stack; otherwise work against the hosted project.

## Setup

```sh
npm install

cp apps/mobile/.env.example apps/mobile/.env           # Supabase URL + publishable key
cp apps/extension/.env.example apps/extension/.env     # Supabase URL + publishable key

npx supabase login && npx supabase link --project-ref <your-ref>
cd apps/mobile && npx eas init && cd ../..
npx eas build --profile development --platform ios     # the build you install on the phone
```

## Run

| Command | What it does |
|---|---|
| `npm test` | Shared finance tests (the numbers the whole demo depends on) |
| `npm run typecheck` | `tsc --noEmit` across all workspaces |
| `npm run mobile` | Expo dev server for the development build |
| `npm run extension` | WXT dev server. Opens Chrome with the extension loaded; edits hot-reload. |
| `npm run extension:build` | Production build to `apps/extension/.output/chrome-mv3` (load unpacked from there) |
| `npm run db:push` | Apply migrations + `seed.sql` to the linked hosted project; prompts for the DB password |
| `npm run functions:deploy` | Deploy all edge functions to the hosted project (no Docker needed) |
| `npm run db:start` / `db:reset` | Local Supabase via Docker, re-seeded from `supabase/seed.sql` |
| `cd apps/mobile && npx expo run:ios` | Build and run on an iOS simulator (first run compiles natively, ~25 min) |

## How it stays in sync

- **Browser to phone: realtime.** `publish-cart` writes the snapshot, Supabase pushes the row change
  over a websocket, the phone refetches. Typically under a second.
- **Phone to browser: a 3 second poll.** The extension holds no user session, only a revocable device
  token, so it cannot open a realtime subscription. It asks `get-snapshot` instead.
- **Alerts: server initiated.** A cart crossing a budget, a confirmed purchase and a hotspot entry
  each push through Expo to the owner's phone, with their own suppression rules.

## Non-negotiables

- All money is integer CAD cents. Unknown price is `null`, never `0`.
- Looking at a product or a cart never changes confirmed spending. Only an explicit "I bought this"
  does, exactly once, and undo appends a reversal rather than deleting history.
- Finance math is computed in one place, `packages/shared`, and the phone, the browser and the edge
  functions all call the same functions.
- No secrets in the extension or the app. A device id is an identifier, not a credential.
- A simulated hotspot entry is always labelled as simulated, in the event, the payload and the UI.
- Product categories and merchants are registries in `packages/shared`. Never hardcode a category
  key, a hostname or a currency path anywhere else.

The full list is in `docs/SPEC.md` §1.4.

## Demo fixture

`packages/shared/src/fixtures.ts` is the one fixture, mirrored exactly by `supabase/seed.sql`:
six budgets totalling $830 allocated and $340 spent, so Home opens at **$490 available**. Clothing is
$200 allocated with $135 spent, so the $148 hoodie puts it **$83 over**. At 10% illustrative over 15
years that one purchase costs about $370 of future savings, or about $34,000 if it becomes a monthly
habit. Both figures are pinned by tests.

## Known limits

- Real geofencing does not run on an iOS simulator unless a location is actively selected, and even
  then it is unreliable. The simulator is used as a paired **trigger** device, and its Simulate entry
  button exercises the whole pipeline except the OS callback itself. Say so out loud when demoing.
- The product classifier is deterministic. When it cannot tell, it says so rather than guessing; the
  Gemini fallback for those pages is specified in `docs/SPEC.md` but not built.
- Onboarding is not built. A fresh profile loads the demo fixture instead.
