-- 0012_max_household.sql  ·  Weekly family meal plan (Max)
--
-- One plan per family per week (Sunday to Saturday): a dish per enabled meal slot per day, each member's
-- portion (細 / 中 / 大 or 唔食), and an inbox that carries 食咗 entries to each member's own phone.
--
-- Who can do what:
--   - Every member reads the family's plan, dishes and portions, and the roster's names and usual
--     sizes (through family_plan_roster, never the profiles table).
--   - Plans and dishes are written only by the plan-week Edge Function (service role), which checks
--     Max with RevenueCat first. From the app, the manager can only lock or unlock a dish.
--   - A member sets their own portions; the manager can set anyone's.
--   - Exclusions (foods a member doesn't eat, allergies included) are health data: readable and
--     writable by that member alone. The server reads them to plan; no other member ever can.
--   - 食咗 for other members goes through log_family_meal, which only the manager can call, into an
--     inbox only the recipient can read. The recipient's phone imports it into its own diary (phones
--     own their diaries: sync_daily_log replaces a whole day from the phone, so a row written straight
--     into someone else's log would be erased at their next sync).
--
-- Helper mode (姐姐煮飯模式): the planner can mark a member as the family's helper, with a language
-- (en / fil / id). Her privacy is enforced here, not just in the app:
--   - She reads dishes only through helper_plan_dishes, which strips every number about nutrition, so
--     she never sees anyone's calories. The plain dish read excludes her.
--   - Her own food diary is private: once she is a helper, the planner's access to it (0002's
--     manager_* policies, narrowed below) needs log_private to be off, and only she can turn it off.
--     Un-marking her as helper does not reopen it.
--   - She can't make herself a helper or not (column grants); only the planner's RPC sets is_helper.
-- Her profile (name, photo, calorie target) stays readable by the planner under 0002's
-- manager_read_profiles; the app never shows the target.
--
-- Leaving a family removes that member's settings, portions and unread inbox rows with them, via the
-- foreign keys to family_members.
--
-- Depends on 0002_family_linking.sql. (0008 is reserved for unpublished storage work.)

-- Member settings --------------------------------------------------------------------------------
create table family_member_settings (
  group_id uuid not null,
  user_id uuid not null,
  default_size text not null default 'medium' check (default_size in ('small', 'medium', 'large')),
  exclusions text[] not null default '{}' check (cardinality(exclusions) <= 40),
  -- Set by the planner (set_member_helper), never by the member.
  is_helper boolean not null default false,
  helper_language text not null default 'en' check (helper_language in ('en', 'fil', 'id')),
  -- The member's own food diary is hidden from the planner. Turned on when she becomes the helper;
  -- only she can turn it off ("let my employer see my food diary").
  log_private boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (group_id, user_id),
  foreign key (group_id, user_id) references family_members (group_id, user_id) on delete cascade
);

-- Family plan settings: the slots this family plans, remembered for the next week ---------------
create table family_plan_settings (
  group_id uuid primary key references family_groups (id) on delete cascade,
  slots text[] not null default '{breakfast,lunch,dinner}'
    check (cardinality(slots) between 1 and 4 and slots <@ array['breakfast', 'lunch', 'dinner', 'snack']),
  updated_at timestamptz not null default now()
);

-- Plans, dishes and portions ------------------------------------------------------------------------
create table family_week_plans (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references family_groups (id) on delete cascade,
  week_start date not null check (extract(dow from week_start) = 0), -- a Sunday
  generated_at timestamptz not null default now(),
  generated_by uuid references profiles (id) on delete set null,
  -- Dish swaps and day regenerations used, against plan-week's REGEN_LIMIT.
  regen_used integer not null default 0 check (regen_used >= 0),
  -- The week's shopping list as the planner's phone last worked it out (the pantry lives there),
  -- published for helper mode: { fromDate, groups: [{ category, lines: [{ name, nameZh, quantity, unit }] }] }.
  shopping jsonb,
  shopping_at timestamptz,
  -- One full generation per family per week: the unique key is the rate limit.
  unique (group_id, week_start)
);

create table family_plan_dishes (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references family_week_plans (id) on delete cascade,
  group_id uuid not null references family_groups (id) on delete cascade, -- copied from the plan, for RLS
  plan_date date not null,
  slot text not null check (slot in ('breakfast', 'lunch', 'dinner', 'snack')),
  -- One standard serving: { title, titleZh, totalMinutes, ingredients, steps, perServing }.
  recipe jsonb not null,
  -- AI translations for helper mode: { fil: { title, ingredients[], steps[] }, id: {...} }.
  -- Emptied whenever the recipe changes.
  translations jsonb not null default '{}'::jsonb,
  locked boolean not null default false,
  logged_at timestamptz,
  created_at timestamptz not null default now(),
  unique (plan_id, plan_date, slot)
);
create index family_plan_dishes_group_idx on family_plan_dishes (group_id);

-- Portions belong to a slot, not a dish: a member who isn't home for Tuesday dinner still isn't
-- after the dinner is swapped. No row means the member's usual size.
create table family_plan_portions (
  plan_id uuid not null references family_week_plans (id) on delete cascade,
  group_id uuid not null,
  plan_date date not null,
  slot text not null check (slot in ('breakfast', 'lunch', 'dinner', 'snack')),
  user_id uuid not null,
  choice text not null check (choice in ('small', 'medium', 'large', 'skip')),
  updated_at timestamptz not null default now(),
  primary key (plan_id, plan_date, slot, user_id),
  foreign key (group_id, user_id) references family_members (group_id, user_id) on delete cascade
);

-- 食咗 inbox ------------------------------------------------------------------------------------------
create table family_log_inbox (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null,
  user_id uuid not null, -- whose diary the entry goes into
  dish_id uuid references family_plan_dishes (id) on delete set null,
  log_date date not null,
  entry jsonb not null, -- { name, nameZh, mealType, calories, protein, carbs, fat, fiber, quantity, unit }
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  imported_at timestamptz,
  -- A dish reaches each person's diary once, however many times 食咗 is tapped.
  unique (dish_id, user_id),
  foreign key (group_id, user_id) references family_members (group_id, user_id) on delete cascade
);
create index family_log_inbox_pending_idx on family_log_inbox (user_id) where imported_at is null;

-- Helper predicates -----------------------------------------------------------------------------
-- SECURITY DEFINER for the same reason as 0002's: they read tables whose own policies would recurse.

-- True when the caller is the helper of this family.
create or replace function public.is_family_helper(gid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.family_member_settings s
    where s.group_id = gid and s.user_id = auth.uid() and s.is_helper
  );
$$;

-- True when the caller manages this member AND the member hasn't made their food diary private. This
-- replaces is_family_manager_of in the two food-log policies below (profiles keep the 0002 rule).
create or replace function public.is_family_log_reader_of(member uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_family_manager_of(member)
    and not exists (
      select 1
      from public.family_member_settings s
      join public.family_members m on m.group_id = s.group_id and m.user_id = s.user_id
      where s.user_id = member and s.log_private
    );
$$;

-- Row level security ------------------------------------------------------------------------------
alter table family_member_settings enable row level security;
alter table family_plan_settings enable row level security;
alter table family_week_plans enable row level security;
alter table family_plan_dishes enable row level security;
alter table family_plan_portions enable row level security;
alter table family_log_inbox enable row level security;

-- Settings: your own row only. The manager changes someone's usual size through
-- set_member_default_size, which cannot touch exclusions.
create policy member_settings_own on family_member_settings
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_family_group_member(group_id));

create policy plan_settings_read on family_plan_settings
  for select using (public.is_family_group_member(group_id));
create policy plan_settings_owner_insert on family_plan_settings
  for insert with check (public.is_family_group_owner(group_id));
create policy plan_settings_owner_update on family_plan_settings
  for update using (public.is_family_group_owner(group_id))
  with check (public.is_family_group_owner(group_id));

create policy week_plans_read on family_week_plans
  for select using (public.is_family_group_member(group_id));
-- The planner's phone publishes the week's shopping list for helper mode (column grant below).
create policy week_plans_owner_update on family_week_plans
  for update using (public.is_family_group_owner(group_id))
  with check (public.is_family_group_owner(group_id));

-- A helper reads dishes through helper_plan_dishes only, which carries no nutrition.
create policy plan_dishes_read on family_plan_dishes
  for select using (public.is_family_group_member(group_id) and not public.is_family_helper(group_id));
create policy plan_dishes_owner_update on family_plan_dishes
  for update using (public.is_family_group_owner(group_id))
  with check (public.is_family_group_owner(group_id));

create policy plan_portions_read on family_plan_portions
  for select using (public.is_family_group_member(group_id));
create policy plan_portions_insert on family_plan_portions
  for insert with check (
    (user_id = auth.uid() or public.is_family_group_owner(group_id))
    and exists (select 1 from family_week_plans p where p.id = plan_id and p.group_id = family_plan_portions.group_id)
  );
create policy plan_portions_update on family_plan_portions
  for update using (user_id = auth.uid() or public.is_family_group_owner(group_id))
  with check (
    (user_id = auth.uid() or public.is_family_group_owner(group_id))
    and exists (select 1 from family_week_plans p where p.id = plan_id and p.group_id = family_plan_portions.group_id)
  );
create policy plan_portions_delete on family_plan_portions
  for delete using (user_id = auth.uid() or public.is_family_group_owner(group_id));

-- The inbox: only the person it's for reads it, marks it imported, or clears it. Rows are created by
-- log_family_meal only.
create policy inbox_own_read on family_log_inbox
  for select using (user_id = auth.uid());
create policy inbox_own_update on family_log_inbox
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy inbox_own_delete on family_log_inbox
  for delete using (user_id = auth.uid());

-- Grants. Stated in full because new tables in this project are not reachable through the Data API
-- until granted (supabase/config.toml, auto_expose_new_tables), and where a platform default would
-- grant more, this narrows it. Column grants limit what the app may write even where a policy lets a
-- row through: the manager can lock a dish but not rewrite it, and a member can mark an entry
-- imported but not edit it. Plans and dishes are otherwise written by plan-week alone.
revoke all on table family_member_settings, family_plan_settings, family_week_plans, family_plan_dishes,
  family_plan_portions, family_log_inbox from public, anon, authenticated;
-- A member writes their own settings but never is_helper, and can't delete the row (that would clear
-- is_helper and log_private behind the planner's and their own back).
grant select on table family_member_settings to authenticated;
grant insert (group_id, user_id, default_size, exclusions, helper_language, log_private, updated_at)
  on table family_member_settings to authenticated;
grant update (default_size, exclusions, helper_language, log_private, updated_at)
  on table family_member_settings to authenticated;
grant select, insert, update on table family_plan_settings to authenticated;
grant select on table family_week_plans to authenticated;
grant update (shopping, shopping_at) on table family_week_plans to authenticated;
grant select on table family_plan_dishes to authenticated;
grant update (locked) on table family_plan_dishes to authenticated;
grant select, insert, update, delete on table family_plan_portions to authenticated;
grant select, delete on table family_log_inbox to authenticated;
grant update (imported_at) on table family_log_inbox to authenticated;
grant all on table family_member_settings, family_plan_settings, family_week_plans, family_plan_dishes,
  family_plan_portions, family_log_inbox to service_role;

-- RPC: the roster the plan screen shows ----------------------------------------------------------
-- Names, usual sizes and who the helper is, for everyone in the caller's family. SECURITY DEFINER
-- because a dependent can't read the other members' profiles; this hands over the display name and
-- nothing else from them (no weight, goals, targets or exclusions). shares_log tells the planner
-- whether a member's food diary is open to them.
create or replace function public.family_plan_roster()
returns table (
  user_id uuid,
  role public.family_role,
  display_name text,
  default_size text,
  is_helper boolean,
  helper_language text,
  shares_log boolean
)
language sql stable security definer set search_path = '' as $$
  with mine as (
    select m.group_id from public.family_members m
    where m.user_id = auth.uid()
    order by (m.role = 'manager') desc
    limit 1
  )
  select fm.user_id, fm.role, p.display_name, coalesce(s.default_size, 'medium'),
    coalesce(s.is_helper, false), coalesce(s.helper_language, 'en'), not coalesce(s.log_private, false)
  from mine
  join public.family_members fm on fm.group_id = mine.group_id
  left join public.profiles p on p.id = fm.user_id
  left join public.family_member_settings s on s.group_id = fm.group_id and s.user_id = fm.user_id
  order by (fm.role = 'manager') desc, fm.created_at;
$$;

-- RPC: the manager sets a member's usual size (and only that) ------------------------------------
create or replace function public.set_member_default_size(p_user_id uuid, p_size text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_group uuid;
begin
  if p_size not in ('small', 'medium', 'large') then
    return false;
  end if;
  select g.id into v_group
  from public.family_groups g
  join public.family_members m on m.group_id = g.id and m.user_id = p_user_id
  where g.owner_id = auth.uid();
  if v_group is null then
    return false;
  end if;
  insert into public.family_member_settings (group_id, user_id, default_size)
  values (v_group, p_user_id, p_size)
  on conflict (group_id, user_id) do update set default_size = excluded.default_size, updated_at = now();
  return true;
end;
$$;

-- RPC: 食咗 for the rest of the family ----------------------------------------------------------------
-- The manager's phone works out each eater's entry from the one portion config in the app
-- (constants/portionSizes.ts) and logs its own locally; this files the others' entries for their
-- phones to import. It checks that the caller runs the dish's family, the meal is due, every
-- recipient is another member of that family, and every number is in range. The dish is marked
-- logged so a second tap does nothing.
create or replace function public.family_log_entry_ok(e jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  k text;
begin
  if jsonb_typeof(e) <> 'object' then return false; end if;
  if jsonb_typeof(e -> 'name') <> 'string' or length(e ->> 'name') not between 1 and 120 then return false; end if;
  if jsonb_typeof(e -> 'nameZh') <> 'string' or length(e ->> 'nameZh') not between 1 and 120 then return false; end if;
  if coalesce(e ->> 'mealType', '') not in ('breakfast', 'lunch', 'dinner', 'snack') then return false; end if;
  if coalesce(e ->> 'unit', '') <> 'serving' then return false; end if;
  if jsonb_typeof(e -> 'calories') <> 'number' or (e ->> 'calories')::numeric not between 0 and 5000 then return false; end if;
  foreach k in array array['protein', 'carbs', 'fat', 'fiber'] loop
    if jsonb_typeof(e -> k) <> 'number' or (e ->> k)::numeric not between 0 and 500 then return false; end if;
  end loop;
  if jsonb_typeof(e -> 'quantity') <> 'number' or (e ->> 'quantity')::numeric <= 0 or (e ->> 'quantity')::numeric > 3 then
    return false;
  end if;
  return true;
end;
$$;

create or replace function public.log_family_meal(p_dish_id uuid, p_entries jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_dish public.family_plan_dishes;
  v_today date := (now() at time zone 'Asia/Hong_Kong')::date;
  v_item jsonb;
  v_to uuid;
  v_sent integer := 0;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  -- Lock the dish so two taps can't both get past the logged check.
  select * into v_dish from public.family_plan_dishes where id = p_dish_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if not exists (select 1 from public.family_groups g where g.id = v_dish.group_id and g.owner_id = v_uid) then
    return jsonb_build_object('ok', false, 'reason', 'not_manager');
  end if;
  if v_dish.plan_date > v_today then
    return jsonb_build_object('ok', false, 'reason', 'not_due');
  end if;
  if v_dish.logged_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'already_logged');
  end if;
  if jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) > 20 then
    return jsonb_build_object('ok', false, 'reason', 'bad_request');
  end if;

  for v_item in select * from jsonb_array_elements(p_entries) loop
    if coalesce(v_item ->> 'user_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      continue;
    end if;
    v_to := (v_item ->> 'user_id')::uuid;
    if v_to = v_uid
      or not exists (select 1 from public.family_members m where m.group_id = v_dish.group_id and m.user_id = v_to)
      or not public.family_log_entry_ok(v_item -> 'entry')
    then
      continue;
    end if;
    insert into public.family_log_inbox (group_id, user_id, dish_id, log_date, entry, created_by)
    values (v_dish.group_id, v_to, v_dish.id, v_dish.plan_date, v_item -> 'entry', v_uid)
    on conflict (dish_id, user_id) do nothing;
    if found then
      v_sent := v_sent + 1;
    end if;
  end loop;

  update public.family_plan_dishes set logged_at = now() where id = v_dish.id;
  return jsonb_build_object('ok', true, 'sent', v_sent);
end;
$$;

-- RPC: helper mode's dishes, with no nutrition -------------------------------------------------------
create or replace function public.helper_plan_dishes(p_plan_ids uuid[])
returns table (
  id uuid,
  plan_id uuid,
  plan_date date,
  slot text,
  recipe jsonb,
  translations jsonb,
  locked boolean,
  logged_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select d.id, d.plan_id, d.plan_date, d.slot, d.recipe - 'perServing', d.translations, d.locked, d.logged_at
  from public.family_plan_dishes d
  where d.plan_id = any(p_plan_ids) and public.is_family_group_member(d.group_id);
$$;

-- RPC: the planner marks a member as the helper (or not) and sets her language ------------------
-- Marking her makes her food diary private. Un-marking leaves it as she set it: the planner can never
-- reopen it, only she can.
create or replace function public.set_member_helper(p_user_id uuid, p_is_helper boolean, p_language text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_group uuid;
begin
  if p_language not in ('en', 'fil', 'id') then
    return false;
  end if;
  select g.id into v_group
  from public.family_groups g
  join public.family_members m on m.group_id = g.id and m.user_id = p_user_id and m.role = 'dependent'
  where g.owner_id = auth.uid();
  if v_group is null then
    return false;
  end if;
  insert into public.family_member_settings (group_id, user_id, is_helper, helper_language, log_private)
  values (v_group, p_user_id, p_is_helper, p_language, p_is_helper)
  on conflict (group_id, user_id) do update
    set is_helper = excluded.is_helper,
        helper_language = excluded.helper_language,
        log_private = public.family_member_settings.log_private or excluded.is_helper,
        updated_at = now();
  return true;
end;
$$;

-- RPC for plan-week only: add one language's translation to a dish without losing another ---------
create or replace function public.merge_dish_translation(p_dish_id uuid, p_language text, p_translation jsonb)
returns void language sql security definer set search_path = '' as $$
  update public.family_plan_dishes
  set translations = translations || jsonb_build_object(p_language, p_translation)
  where id = p_dish_id and p_language in ('fil', 'id');
$$;

-- The planner's access to food logs, narrowed for members who keep theirs private ---------------
drop policy manager_manage_daily_logs on daily_logs;
create policy manager_manage_daily_logs on daily_logs
  for all
  using (public.is_family_log_reader_of(user_id))
  with check (public.is_family_log_reader_of(user_id));

drop policy manager_manage_food_entries on food_entries;
create policy manager_manage_food_entries on food_entries
  for all
  using (
    exists (
      select 1 from daily_logs d
      where d.id = food_entries.daily_log_id and public.is_family_log_reader_of(d.user_id)
    )
  )
  with check (
    exists (
      select 1 from daily_logs d
      where d.id = food_entries.daily_log_id and public.is_family_log_reader_of(d.user_id)
    )
  );

-- RPC for plan-week only: count one swap or day regeneration, or return null at the limit --------
-- Atomic, so two quick taps can't both slip under the limit.
create or replace function public.bump_plan_regen(p_plan_id uuid, p_limit integer)
returns integer language sql security definer set search_path = '' as $$
  update public.family_week_plans set regen_used = regen_used + 1
  where id = p_plan_id and regen_used < p_limit
  returning regen_used;
$$;

revoke all on function public.is_family_helper(uuid) from public, anon;
revoke all on function public.is_family_log_reader_of(uuid) from public, anon;
revoke all on function public.helper_plan_dishes(uuid[]) from public, anon;
revoke all on function public.set_member_helper(uuid, boolean, text) from public, anon;
revoke all on function public.merge_dish_translation(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.is_family_helper(uuid) to authenticated;
grant execute on function public.is_family_log_reader_of(uuid) to authenticated;
grant execute on function public.helper_plan_dishes(uuid[]) to authenticated;
grant execute on function public.set_member_helper(uuid, boolean, text) to authenticated;
grant execute on function public.merge_dish_translation(uuid, text, jsonb) to service_role;
revoke all on function public.family_plan_roster() from public, anon;
revoke all on function public.set_member_default_size(uuid, text) from public, anon;
revoke all on function public.log_family_meal(uuid, jsonb) from public, anon;
revoke all on function public.family_log_entry_ok(jsonb) from public, anon;
revoke all on function public.bump_plan_regen(uuid, integer) from public, anon, authenticated;
grant execute on function public.family_plan_roster() to authenticated;
grant execute on function public.set_member_default_size(uuid, text) to authenticated;
grant execute on function public.log_family_meal(uuid, jsonb) to authenticated;
grant execute on function public.bump_plan_regen(uuid, integer) to service_role;
