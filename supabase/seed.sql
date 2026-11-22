-- Demo seed. MUST mirror packages/shared/src/fixtures.ts exactly (CLAUDE.md).
--   Clothing $200 / $135 spent · Beauty $80 / $20 · Entertainment $150 / $70 · Food $250 / $90 · Transport $100 / $25 · Other $50 / $0
--   Savings: $1,000 opening, $300/month, 0%, 120 months
--   Hotspot: Masonville Place, 250 m, coordinates UNVERIFIED (verified = false)
--
-- Nothing here creates an auth user. The owner signs in anonymously on the phone and calls
-- `select public.reset_demo()` (Me → Demo tools → "Reset demo data"), which seeds or re-seeds
-- that user's own data and keeps devices, tokens and pairings.
-- Applied to the hosted project with: supabase db push --remote --include-seed

create or replace function public.seed_owner(p_owner uuid, p_name text default 'Alex')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period     uuid;
  v_clothing   uuid;
  v_beauty     uuid;
  v_ent        uuid;
  v_food       uuid;
  v_transport  uuid;
begin
  insert into profiles (user_id, display_name, onboarded_at)
  values (p_owner, p_name, now())
  on conflict (user_id) do update set display_name = excluded.display_name, onboarded_at = coalesce(profiles.onboarded_at, now());

  -- Replace budget state wholesale (cascades categories + expenses; hotspots.category_id → null, relinked below).
  delete from budget_periods where owner_id = p_owner;

  insert into budget_periods (owner_id, label, starts_at, ends_at, is_active)
  values (p_owner, 'November 2026', date '2026-11-01', date '2026-12-01', true)
  returning id into v_period;

  insert into budget_categories (owner_id, period_id, name, allocated_cents, enabled, product_category, sort_order)
  values (p_owner, v_period, 'Clothing', 20000, true, 'clothing', 1) returning id into v_clothing;
  insert into budget_categories (owner_id, period_id, name, allocated_cents, enabled, product_category, sort_order)
  values (p_owner, v_period, 'Beauty', 8000, true, 'beauty', 2) returning id into v_beauty;
  insert into budget_categories (owner_id, period_id, name, allocated_cents, enabled, product_category, sort_order)
  values (p_owner, v_period, 'Entertainment', 15000, true, 'entertainment', 3) returning id into v_ent;
  insert into budget_categories (owner_id, period_id, name, allocated_cents, enabled, product_category, sort_order)
  values (p_owner, v_period, 'Food', 25000, true, null, 4) returning id into v_food;
  insert into budget_categories (owner_id, period_id, name, allocated_cents, enabled, product_category, sort_order)
  values (p_owner, v_period, 'Transport', 10000, true, null, 5) returning id into v_transport;
  insert into budget_categories (owner_id, period_id, name, allocated_cents, enabled, product_category, sort_order)
  values (p_owner, v_period, 'Other', 5000, true, 'other', 6);

  insert into expenses (owner_id, period_id, category_id, amount_cents, source, confirmed_at) values
    (p_owner, v_period, v_clothing,  13500, 'seed', date '2026-11-10'),
    (p_owner, v_period, v_beauty,     2000, 'seed', date '2026-11-08'),
    (p_owner, v_period, v_ent,        7000, 'seed', date '2026-11-12'),
    (p_owner, v_period, v_food,       9000, 'seed', date '2026-11-15'),
    (p_owner, v_period, v_transport,  2500, 'seed', date '2026-11-05');

  insert into savings_plans (owner_id, opening_balance_cents, monthly_contribution_cents, illustrative_rate, horizon_months)
  values (p_owner, 100000, 30000, 0, 120)
  on conflict (owner_id) do update set
    opening_balance_cents = excluded.opening_balance_cents,
    monthly_contribution_cents = excluded.monthly_contribution_cents,
    illustrative_rate = excluded.illustrative_rate,
    horizon_months = excluded.horizon_months,
    version = savings_plans.version + 1;

  -- Masonville Place, London ON. Approximate; `verified` stays false until confirmed on-map (SPEC §5.8).
  if not exists (select 1 from hotspots where owner_id = p_owner and name = 'Masonville Place') then
    insert into hotspots (owner_id, name, latitude, longitude, radius_m, category_id, enabled, verified)
    values (p_owner, 'Masonville Place', 43.0254, -81.2761, 250, v_clothing, true, false);
  else
    update hotspots set category_id = v_clothing, radius_m = 250, enabled = true
    where owner_id = p_owner and name = 'Masonville Place';
  end if;
end $$;

revoke all on function public.seed_owner(uuid, text) from public;

-- Owner-callable demo reset: clears carts/events/deliveries, re-seeds budgets. Keeps devices, push tokens, pairings.
create or replace function public.reset_demo()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_name  text;
begin
  if v_owner is null then
    raise exception 'reset_demo requires an authenticated owner';
  end if;
  select display_name into v_name from profiles where user_id = v_owner;

  delete from cart_snapshots where owner_id = v_owner;
  delete from spending_events where owner_id = v_owner and type not in ('DEVICE_PAIRED', 'DEVICE_REVOKED');
  perform seed_owner(v_owner, coalesce(v_name, 'Alex'));
end $$;

revoke all on function public.reset_demo() from public;
grant execute on function public.reset_demo() to authenticated;
