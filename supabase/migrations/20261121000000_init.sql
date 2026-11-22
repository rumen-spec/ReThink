-- ReThink schema v1 (docs/SPEC.md §11–§13). All money is integer CAD cents.
-- Confirmed spending is derived from the `expenses` ledger; carts are never expenses.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Lookups mirrored from packages/shared (categories.ts, merchants.ts).
-- Adding an entry there = adding a row here in a new migration.
-- ---------------------------------------------------------------------------
create table public.product_categories (
  key        text primary key check (key ~ '^[a-z][a-z-]*$'),
  label      text not null,
  sort_order integer not null
);
insert into public.product_categories (key, label, sort_order) values
  ('clothing', 'Clothing', 1),
  ('beauty', 'Beauty', 2),
  ('electronics', 'Electronics', 3),
  ('home', 'Home', 4),
  ('entertainment', 'Entertainment', 5);

create table public.merchants (
  key   text primary key,
  label text not null
);
insert into public.merchants (key, label) values
  ('frankandoak-ca', 'Frank And Oak'),
  ('alo-ca', 'Alo'),
  ('ovo-ca', 'OVO'),
  ('fenty-beauty-ca', 'Fenty Beauty'),
  ('glossier-ca', 'Glossier'),
  ('tentree-ca', 'tentree'),
  ('peace-collective-ca', 'Peace Collective'),
  ('lululemon-ca', 'Lululemon');

-- ---------------------------------------------------------------------------
-- Owner state
-- ---------------------------------------------------------------------------
create table public.profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  currency     text not null default 'CAD' check (currency = 'CAD'),
  onboarded_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.budget_periods (
  id        uuid primary key default gen_random_uuid(),
  owner_id  uuid not null references auth.users (id) on delete cascade,
  label     text not null,
  starts_at date not null,
  ends_at   date not null,
  is_active boolean not null default true,
  check (ends_at > starts_at)
);
create unique index budget_periods_one_active on public.budget_periods (owner_id) where is_active;

create table public.budget_categories (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references auth.users (id) on delete cascade,
  period_id        uuid not null references public.budget_periods (id) on delete cascade,
  name             text not null check (char_length(name) between 1 and 40),
  allocated_cents  integer not null check (allocated_cents >= 0),
  enabled          boolean not null default true,
  product_category text references public.product_categories (key),
  sort_order       integer not null default 0,
  updated_at       timestamptz not null default now()
);
create unique index budget_categories_unique_name on public.budget_categories (period_id, lower(name));
-- At most one enabled budget per product category per period: routing must be unambiguous.
create unique index budget_categories_one_per_product_category
  on public.budget_categories (owner_id, period_id, product_category)
  where enabled and product_category is not null;

-- Ledger. Positive rows are spending; a reversal is a negative row pointing at what it undoes.
create table public.expenses (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references auth.users (id) on delete cascade,
  period_id        uuid not null references public.budget_periods (id) on delete cascade,
  category_id      uuid not null references public.budget_categories (id) on delete cascade,
  amount_cents     integer not null check (amount_cents <> 0),
  source           text not null check (source in ('purchase-confirmed', 'manual', 'reversal', 'seed')),
  merchant_key     text references public.merchants (key),
  confirmation_key text,
  reversal_of      uuid references public.expenses (id),
  confirmed_at     timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  check ((source = 'reversal') = (reversal_of is not null)),
  check ((source = 'reversal' and amount_cents < 0) or (source <> 'reversal' and amount_cents > 0))
);
create unique index expenses_confirmation_key on public.expenses (owner_id, confirmation_key) where confirmation_key is not null;
create unique index expenses_one_reversal on public.expenses (reversal_of) where reversal_of is not null;
create index expenses_category on public.expenses (category_id);

-- Confirmed spend per category, derived. security_invoker → RLS of the caller applies.
create view public.budget_category_balances with (security_invoker = true) as
select c.*, coalesce(sum(e.amount_cents), 0)::integer as confirmed_spent_cents
from public.budget_categories c
left join public.expenses e on e.category_id = c.id
group by c.id;

create table public.savings_plans (
  owner_id                   uuid primary key references auth.users (id) on delete cascade,
  opening_balance_cents      integer not null default 0 check (opening_balance_cents >= 0),
  monthly_contribution_cents integer not null default 0 check (monthly_contribution_cents >= 0),
  illustrative_rate          numeric(4, 3) not null default 0 check (illustrative_rate in (0, 0.05, 0.07, 0.1)),
  horizon_months             integer not null default 120 check (horizon_months between 1 and 600),
  version                    integer not null default 1,
  updated_at                 timestamptz not null default now()
);

create table public.hotspots (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users (id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 60),
  latitude        double precision not null check (latitude between -90 and 90),
  longitude       double precision not null check (longitude between -180 and 180),
  radius_m        integer not null check (radius_m between 50 and 2000),
  category_id     uuid references public.budget_categories (id) on delete set null,
  enabled         boolean not null default true,
  snoozed_until   timestamptz,
  -- Coordinates confirmed on-map by a human (§5.8). Trigger devices must not register unverified fences.
  verified        boolean not null default false,
  last_entered_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Devices, pairing, push
-- ---------------------------------------------------------------------------
create table public.devices (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references auth.users (id) on delete cascade,
  device_label      text not null check (char_length(device_label) between 1 and 60),
  role              text not null check (role in ('owner', 'browser', 'trigger')),
  platform          text not null check (platform in ('ios', 'chrome', 'other')),
  -- sha256 hex of the device token minted at pairing. Null for owner devices (they use auth).
  token_hash        text,
  consented_at      timestamptz,
  revoked_at        timestamptz,
  last_seen_at      timestamptz,
  notification_pref jsonb not null default '{"cart": true, "hotspot": true}'::jsonb,
  created_at        timestamptz not null default now()
);
create unique index devices_token_hash on public.devices (token_hash) where token_hash is not null;
create index devices_owner on public.devices (owner_id);

create table public.push_tokens (
  device_id       uuid primary key references public.devices (id) on delete cascade,
  owner_id        uuid not null references auth.users (id) on delete cascade,
  expo_push_token text not null,
  updated_at      timestamptz not null default now(),
  invalidated_at  timestamptz
);

create table public.pairing_codes (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null references auth.users (id) on delete cascade,
  code_hash          text not null unique,
  role               text not null check (role in ('browser', 'trigger')),
  expires_at         timestamptz not null,
  redeemed_at        timestamptz,
  redeemed_device_id uuid references public.devices (id) on delete set null,
  created_at         timestamptz not null default now()
);

-- Brute-force throttle for pair-redeem (keyed by caller IP, 10-minute windows).
create table public.pairing_attempts (
  ip           text not null,
  window_start timestamptz not null,
  failures     integer not null default 0,
  primary key (ip, window_start)
);

-- ---------------------------------------------------------------------------
-- Carts (proposed only), events, deliveries
-- ---------------------------------------------------------------------------
create table public.cart_snapshots (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references auth.users (id) on delete cascade,
  merchant_key      text not null references public.merchants (key),
  device_id         uuid not null references public.devices (id) on delete cascade,
  session_id        text not null,
  cart_id           text not null,
  items             jsonb not null default '[]'::jsonb,
  subtotal_cents    integer check (subtotal_cents is null or subtotal_cents >= 0), -- null = partial
  currency          text not null,
  source            text not null check (source in ('retailer-detected', 'manual-consideration')),
  sync_quality      text not null check (sync_quality in ('complete', 'partial', 'manual', 'stale', 'unavailable')),
  includes_tax      boolean not null default false,
  includes_shipping boolean not null default false,
  discount_status   text not null default 'unknown' check (discount_status in ('unknown', 'none', 'applied')),
  fingerprint       text not null,
  version           integer not null check (version >= 1),
  observed_at       timestamptz not null,
  archived_at       timestamptz,
  updated_at        timestamptz not null default now(),
  -- §1.4 rule 8: one snapshot per merchant + account + device/session.
  unique (owner_id, merchant_key, device_id, session_id)
);
create index cart_snapshots_owner_active on public.cart_snapshots (owner_id, updated_at desc) where archived_at is null;

create table public.spending_events (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null,
  owner_id     uuid not null references auth.users (id) on delete cascade,
  device_id    uuid references public.devices (id) on delete set null,
  source       text not null check (source in ('browser', 'ios-owner', 'ios-trigger', 'server')),
  type         text not null check (type in (
    'CART_UPDATED', 'PURCHASE_CONFIRMED', 'BUDGET_UPDATED', 'HOTSPOT_ENTERED',
    'HOTSPOT_SIMULATED', 'DEVICE_PAIRED', 'DEVICE_REVOKED', 'TEST_NOTIFICATION')),
  payload      jsonb not null default '{}'::jsonb,
  is_simulated boolean not null default false,
  occurred_at  timestamptz not null,
  received_at  timestamptz not null default now(),
  unique (owner_id, event_id)
);
create index spending_events_owner_recent on public.spending_events (owner_id, received_at desc);

create table public.notification_deliveries (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references public.spending_events (id) on delete cascade,
  device_id       uuid not null references public.devices (id) on delete cascade,
  type            text not null,
  status          text not null check (status in ('queued', 'sent', 'failed', 'suppressed')),
  last_attempt_at timestamptz,
  error           text,
  unique (event_id, device_id)
);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create function public.set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger budget_categories_updated_at before update on public.budget_categories for each row execute function public.set_updated_at();
create trigger savings_plans_updated_at before update on public.savings_plans for each row execute function public.set_updated_at();
create trigger hotspots_updated_at before update on public.hotspots for each row execute function public.set_updated_at();
create trigger cart_snapshots_updated_at before update on public.cart_snapshots for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row-level security. Owner = auth.uid(). Browser/trigger devices never touch tables
-- directly; they go through edge functions (service role) with a hashed device token.
-- ---------------------------------------------------------------------------
alter table public.product_categories     enable row level security;
alter table public.merchants              enable row level security;
alter table public.profiles               enable row level security;
alter table public.budget_periods         enable row level security;
alter table public.budget_categories      enable row level security;
alter table public.expenses               enable row level security;
alter table public.savings_plans          enable row level security;
alter table public.hotspots               enable row level security;
alter table public.devices                enable row level security;
alter table public.push_tokens            enable row level security;
alter table public.pairing_codes          enable row level security;
alter table public.pairing_attempts       enable row level security;
alter table public.cart_snapshots         enable row level security;
alter table public.spending_events        enable row level security;
alter table public.notification_deliveries enable row level security;

create policy "lookups readable" on public.product_categories for select to authenticated, anon using (true);
create policy "lookups readable" on public.merchants for select to authenticated, anon using (true);

create policy "own profile" on public.profiles for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own periods" on public.budget_periods for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "own categories" on public.budget_categories for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
-- Ledger is append-only for the owner: read + insert (manual spend, reversal). No update/delete.
create policy "own expenses read" on public.expenses for select to authenticated using (owner_id = auth.uid());
create policy "own expenses append" on public.expenses for insert to authenticated
  with check (owner_id = auth.uid() and source in ('manual', 'reversal'));
create policy "own savings plan" on public.savings_plans for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "own hotspots" on public.hotspots for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
-- Owner may register its own phone and revoke anything; token_hash is never written by clients.
create policy "own devices read" on public.devices for select to authenticated using (owner_id = auth.uid());
create policy "own devices insert" on public.devices for insert to authenticated
  with check (owner_id = auth.uid() and role = 'owner' and token_hash is null);
create policy "own devices update" on public.devices for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "own devices delete" on public.devices for delete to authenticated using (owner_id = auth.uid());
create policy "own push tokens" on public.push_tokens for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "own pairing codes read" on public.pairing_codes for select to authenticated using (owner_id = auth.uid());
-- pairing_attempts: service role only (no policies).
-- Carts are written only by publish-cart / confirm-purchase (service role); owner may read and clear.
create policy "own carts read" on public.cart_snapshots for select to authenticated using (owner_id = auth.uid());
create policy "own carts delete" on public.cart_snapshots for delete to authenticated using (owner_id = auth.uid());
-- Owner phone may read all events and append its own (BUDGET_UPDATED etc.). Never updates or deletes.
create policy "own events read" on public.spending_events for select to authenticated using (owner_id = auth.uid());
create policy "own events append" on public.spending_events for insert to authenticated
  with check (owner_id = auth.uid() and source = 'ios-owner');
create policy "own deliveries read" on public.notification_deliveries for select to authenticated
  using (exists (select 1 from public.spending_events e where e.id = event_id and e.owner_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- Realtime: the phone subscribes to these three with owner_id filters.
-- replica identity full so delete/update filters see owner_id.
-- ---------------------------------------------------------------------------
alter table public.cart_snapshots    replica identity full;
alter table public.budget_categories replica identity full;
alter table public.spending_events   replica identity full;
alter publication supabase_realtime add table public.cart_snapshots, public.budget_categories, public.spending_events;
