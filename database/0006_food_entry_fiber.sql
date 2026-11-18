-- 0006_food_entry_fiber.sql  ·  Per-entry dietary fibre
--
-- Fibre becomes a first-class macro captured per food entry (barcode via Open Food Facts, the AI
-- estimator, and known dishes). This mirrors the client's MacroNutrients.fiber field into the cloud
-- so the manager viewer reads back exactly the fibre the dependent logged.
--
-- Owner-applied to production out-of-band, same discipline as 0005: the client ships as a JS-only
-- EAS Update and this migration (plus the estimate-meal redeploy) lands on the backend separately.
-- The coalesce below makes the two orderings independent, so neither has to wait on the other.

-- 1. Fidelity column ------------------------------------------------------
-- Dietary fibre in grams. default 0 backfills every existing row honestly: those meals were logged
-- before fibre was tracked, so their fibre was never measured (not "zero by claim"). not null keeps
-- the server column and the client's required MacroNutrients.fiber in lockstep.
alter table food_entries
  add column fiber numeric not null default 0;

-- 2. Publish RPC: same signature, fibre added to the entry recordset ------
-- The argument list is UNCHANGED (no p_total_fiber: daily_logs.total_* are write-only mirrors the
-- viewer never reads, it recomputes effective totals from the entries), so create-or-replace keeps
-- the 0005 grant to `authenticated` intact and re-grants nothing. Only the body changes: the entry
-- recordset gains a `fiber` column and the insert carries it.
--
-- coalesce(e.fiber, 0) makes this migration and the client update order-independent: a still-cached
-- client that predates fibre omits the key, jsonb_to_recordset yields null, and we store 0. A new
-- client that sends fiber against a not-yet-migrated database is also fine, because
-- jsonb_to_recordset ignores JSON keys that have no matching column.
create or replace function public.sync_daily_log(
  p_log_date date,
  p_total_calories numeric,
  p_total_protein numeric,
  p_total_carbs numeric,
  p_total_fat numeric,
  p_entries jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_log_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  insert into daily_logs (user_id, log_date, total_calories, total_protein, total_carbs, total_fat)
  values (v_uid, p_log_date, p_total_calories, p_total_protein, p_total_carbs, p_total_fat)
  on conflict (user_id, log_date) do update
    set total_calories = excluded.total_calories,
        total_protein  = excluded.total_protein,
        total_carbs    = excluded.total_carbs,
        total_fat      = excluded.total_fat
  returning id into v_log_id;

  delete from food_entries where daily_log_id = v_log_id;

  insert into food_entries (
    daily_log_id, name, name_zh, meal_type, calories, protein, carbs, fat, fiber,
    quantity, unit, source, image_url, barcode, logged_at, customizations, micros
  )
  select
    v_log_id, e.name, e.name_zh, e.meal_type, e.calories, e.protein, e.carbs, e.fat,
    coalesce(e.fiber, 0),
    e.quantity, e.unit, e.source, e.image_url, e.barcode, e.logged_at,
    coalesce(e.customizations, '[]'::jsonb), e.micros
  from jsonb_to_recordset(p_entries) as e(
    name text, name_zh text, meal_type meal_type, calories numeric, protein numeric,
    carbs numeric, fat numeric, fiber numeric, quantity numeric, unit text, source log_source,
    image_url text, barcode text, logged_at timestamptz, customizations jsonb, micros jsonb
  );
end;
$$;

-- 3. Grants: unchanged. create-or-replace with an identical signature preserves the 0005 grant
-- (authenticated) and revoke (public, anon), so nothing is re-issued here.
