-- 0011_food_entry_added_sugar.sql  ·  Per-entry added sugar for 少甜 / 走甜
--
-- The logging AI now estimates each food's added sugar (sugar, syrup, honey or condensed milk put in
-- when it was made). The 少甜 (less sugar) and 走甜 (no sugar) tweaks take out half or all of it, so
-- their numbers are the item's own rather than one fixed guess. This mirrors the client's
-- FoodEntry.addedSugar into the cloud so the manager viewer recomputes exactly the effective numbers
-- the dependent sees (utils/customizations.ts runs on both sides).
--
-- Same discipline as 0006: owner-applied to production, then the estimate-meal redeploy, then the
-- app's EAS Update. Apply this BEFORE the app update: the family viewer selects added_sugar by name,
-- and that select fails on a database without the column.

-- 1. Fidelity column ------------------------------------------------------
-- Grams of added sugar. Nullable on purpose: null means no estimate (logged before this existed, or
-- typed in by hand), which the app reads as a typical sweetened drink; 0 means none to take out.
-- Existing rows stay null, which is honest: their added sugar was never estimated.
alter table food_entries
  add column added_sugar numeric;

-- 2. Publish RPC: same signature, added sugar added to the entry recordset --
-- The argument list is UNCHANGED, so create-or-replace keeps the 0005 grant to `authenticated`
-- intact. Only the body changes: the entry recordset gains `added_sugar` and the insert carries it.
--
-- No coalesce: a still-cached client that predates this omits the key, jsonb_to_recordset yields
-- null, and null is exactly "no estimate". A new client against a not-yet-migrated database is also
-- fine on this path, because jsonb_to_recordset ignores JSON keys that have no matching column.
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
    quantity, unit, source, image_url, barcode, logged_at, customizations, micros, added_sugar
  )
  select
    v_log_id, e.name, e.name_zh, e.meal_type, e.calories, e.protein, e.carbs, e.fat,
    coalesce(e.fiber, 0),
    e.quantity, e.unit, e.source, e.image_url, e.barcode, e.logged_at,
    coalesce(e.customizations, '[]'::jsonb), e.micros, e.added_sugar
  from jsonb_to_recordset(p_entries) as e(
    name text, name_zh text, meal_type meal_type, calories numeric, protein numeric,
    carbs numeric, fat numeric, fiber numeric, quantity numeric, unit text, source log_source,
    image_url text, barcode text, logged_at timestamptz, customizations jsonb, micros jsonb,
    added_sugar numeric
  );
end;
$$;

-- 3. Grants: unchanged. create-or-replace with an identical signature preserves the 0005 grant
-- (authenticated) and revoke (public, anon), so nothing is re-issued here.
