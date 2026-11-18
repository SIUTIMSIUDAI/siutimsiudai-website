-- 0005_family_log_sync.sql  ·  Dependent diary sync + manager viewer support
--
-- Adds fidelity columns so the cloud mirror of a food entry matches the client exactly, plus one
-- atomic RPC the dependent's device calls to publish a day. Manager READ of a dependent's logs is
-- already granted by 0002 (manager_manage_daily_logs / manager_manage_food_entries via
-- is_family_manager_of), so this migration adds NO new policy.

-- 1. Fidelity columns -----------------------------------------------------
-- customizations: the active 少甜/少底 tweaks (jsonb array of 'less_sugar' | 'less_rice'). The stored
--   calories/protein/carbs/fat remain the UNTWEAKED base; effective values are derived on read, so
--   the manager recomputes exactly what the dependent sees.
-- micros: per-meal vitamins & minerals, null when the dependent's tier did not retain them.
alter table food_entries
  add column customizations jsonb not null default '[]'::jsonb,
  add column micros jsonb;

-- 2. Atomic publish RPC ---------------------------------------------------
-- One call upserts the day's totals and REPLACES its entries (delete + re-insert), so an edit or a
-- delete on the dependent's device can never leave stale or duplicate rows, and the manager can
-- never read a half-written day. SECURITY DEFINER bypasses RLS, so the function itself stamps
-- v_uid from auth.uid(): a caller can only ever write its OWN day, never anyone else's.
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
    daily_log_id, name, name_zh, meal_type, calories, protein, carbs, fat,
    quantity, unit, source, image_url, barcode, logged_at, customizations, micros
  )
  select
    v_log_id, e.name, e.name_zh, e.meal_type, e.calories, e.protein, e.carbs, e.fat,
    e.quantity, e.unit, e.source, e.image_url, e.barcode, e.logged_at,
    coalesce(e.customizations, '[]'::jsonb), e.micros
  from jsonb_to_recordset(p_entries) as e(
    name text, name_zh text, meal_type meal_type, calories numeric, protein numeric,
    carbs numeric, fat numeric, quantity numeric, unit text, source log_source,
    image_url text, barcode text, logged_at timestamptz, customizations jsonb, micros jsonb
  );
end;
$$;

-- 3. Grants (follow 0003): drop the anonymous surface, keep authenticated. The function bails when
-- auth.uid() is null, so this is defense in depth on top of that check.
revoke all on function public.sync_daily_log(date, numeric, numeric, numeric, numeric, jsonb)
  from public, anon;
grant execute on function public.sync_daily_log(date, numeric, numeric, numeric, numeric, jsonb)
  to authenticated;
