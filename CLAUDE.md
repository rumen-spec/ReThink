# ReThink — notes for AI assistants

Read `docs/SPEC.md` before changing product behaviour (§1.4 lists the invariants) and `docs/PLAN.md` for build order and status. Update PLAN.md checkboxes as work lands. `docs/DEMO.md` is the demo runbook (pitch, run of show, stores, seeded numbers, fallbacks): update it whenever a decision changes what the judges will see. `docs/RETAILERS.md` holds per-store probe evidence.

## Layout
npm workspaces, TypeScript everywhere.
- `packages/shared` — contracts + pure finance math. No runtime deps. Consumed as TS source by both apps and by edge functions.
- `apps/mobile` — Expo SDK 58, expo-router, `src/app/`. Runs on a physical iPhone (Expo Go for UI; EAS dev build for geofencing/push). No Xcode on this Mac; native builds go through EAS.
- `apps/extension` — WXT + React, Manifest V3. Entrypoints in `entrypoints/`.
- `supabase/` — migrations, edge functions (Deno), `seed.sql`.
- Tests live in a `test/` folder beside `src/` in every workspace (`packages/shared/test/*.test.ts`, `apps/*/test/`), never co-located in `src/`. Import the unit under test as `../src/<file>.ts`.

## Rules that are easy to break
- UI is dark-first (deep charcoal-teal canvas, never pure `#000`). Tokens are in `docs/PLAN.md` Block 4 until the apps own them.
- Money is integer CAD cents end to end. Format only at the UI edge with `formatCad`. Unknown price is `null`, never `0`.
- Finance math lives only in `packages/shared`. Never re-derive remaining/overage/forecast inside an app.
- Viewing a product or observing a cart never changes confirmed spending. Only a `PURCHASE_CONFIRMED` event with a unique confirmation key does.
- No secrets in clients. Gemini key and service-role key exist only in edge-function env. A device id is an identifier, not a credential.
- Every event carries a client-generated `eventId` (idempotency key) and `isSimulated`. Simulated hotspot entries are always labelled as such in UI.
- Cart snapshots are scoped to merchant + account + device/session. Do not merge retailers.
- Product categories (`clothing`, `beauty`, …) and merchants are registries in `packages/shared/src/categories.ts` and `merchants.ts`. Add entries there; never hardcode a category key, subtype list, hostname or `/en-ca/` path in an app or edge function. Route a product to a budget with `findBudgetCategoryFor`, never by display name.
- `packages/shared/src/fixtures.ts` and `supabase/seed.sql` must hold the same numbers.

## Commands
`npm install` · `npm test` · `npm run typecheck` · `npm run mobile` · `npm run extension` · `npx supabase <cmd>` (see root package.json `db:*` scripts)
