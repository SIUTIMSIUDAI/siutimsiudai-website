-- 0004_ai_usage_quota.sql  ·  Per-user daily cap on the billable AI endpoints
--
-- WHY THIS EXISTS IN THE DATABASE AND NOT IN THE GOOGLE CLOUD CONSOLE
--
-- The obvious place to cap Vertex AI spend is a consumer quota override on
-- aiplatform.googleapis.com. That is not available to us. The model these functions call
-- (gemini-2.5-flash) is served under Dynamic Shared Quota: filtering the project's quota page to
-- "Generate content requests per minute per project per base model" + region us-central1 returns
-- 17 rows, there is no gemini-2.5-flash row among them at all, and every row present reads
-- Adjustable = No. There is no project-level number to lower.
--
-- A project-level cap would also have been the worse control even if it had existed, because it is
-- shared: one abusive account exhausting it takes the feature away from every honest user. A
-- per-user counter throttles only the account doing the damage.
--
-- WHAT IT DEFENDS
--
-- requireUser (supabase/functions/_shared/requireUser.ts) already stopped the anon key from
-- reaching these functions, so an attacker now needs a real, email-verified account. This bounds
-- what one such account can spend in a day. Without it, a single sign-up still buys an unmetered
-- Vertex credential, and the vision path (estimate-meal with a photo) is the expensive one.

-- One row per user per day per bucket. No surrogate key: the composite is the natural identity, and
-- it gives the upsert its conflict target and the prune its index for free.
--
-- `bucket` separates allowances that should not compete. Vertex ('ai') and Google Translate
-- ('translate') differ in cost by about two orders of magnitude — a recipe translation is a
-- fraction of a cent against a Gemini vision call — and, more importantly, translation fires
-- automatically from useRecipeAutoTranslate rather than on a deliberate tap. On a single shared
-- counter, importing a batch of recipes would silently spend the allowance the user needs to log
-- dinner. Separate buckets, separate limits.
create table if not exists public.ai_usage (
  user_id       uuid    not null references auth.users (id) on delete cascade,
  usage_date    date    not null,
  bucket        text    not null default 'ai',
  request_count integer not null default 0,
  primary key (user_id, usage_date, bucket)
);

-- No policies are declared below, and that is the whole design. RLS with an empty policy set denies
-- every role that is subject to it, so anon and authenticated cannot read, write, or probe this
-- table. Only the service role (which bypasses RLS, and exists only inside the Edge Function
-- runtime) reaches it. A client that could edit its own row could lift its own cap.
alter table public.ai_usage enable row level security;

-- Supabase grants table privileges to anon/authenticated by default in the public schema. RLS
-- already stops them, but leaving the grants in place means the table shows up in the PostgREST
-- schema cache and answers with an empty 200 instead of a 404. Take them away.
revoke all on table public.ai_usage from public, anon, authenticated;
grant all on table public.ai_usage to service_role;

/*
 * Count one AI request against the caller's daily allowance and report whether it may proceed.
 *
 * Atomic on purpose. A read-then-write from Deno would race: two requests arriving together would
 * both read the old count and both write count+1, so a burst slips past the cap by exactly the
 * width of the burst. The upsert settles it in a single statement under the primary key lock.
 *
 * The day boundary is Hong Kong, not UTC. The whole audience is in UTC+8, so a UTC reset would
 * roll the allowance over at 08:00 local, mid-breakfast, which is the one time of day a meal
 * tracker is busiest.
 *
 * The count increments even when the request is refused. That is deliberate: it makes the row a
 * true record of attempts rather than of successes, so a user sitting at 4,000 attempts against a
 * limit of 50 is visibly an abuser and not a heavy user. A row write costs a fraction of a cent
 * against a Gemini vision call, so charging the attacker a cheap write to deny them an expensive
 * inference is the right way round.
 */
create or replace function public.bump_ai_usage(
  p_user_id uuid,
  p_limit   integer,
  p_bucket  text default 'ai'
)
returns table (allowed boolean, used integer, day_limit integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day   date := (now() at time zone 'Asia/Hong_Kong')::date;
  v_count integer;
begin
  insert into public.ai_usage as u (user_id, usage_date, bucket, request_count)
  values (p_user_id, v_day, p_bucket, 1)
  on conflict (user_id, usage_date, bucket)
  do update set request_count = u.request_count + 1
  returning u.request_count into v_count;

  -- A count of exactly 1 means today's row for this bucket was just created, i.e. this is the
  -- user's first call of the day. Prune here rather than on every request so the delete runs once
  -- per user per bucket per day. Retention is short by intent: this table records when a person
  -- used the app, which is behavioural data we have no reason to keep once it can no longer
  -- inform a cap decision.
  if v_count = 1 then
    delete from public.ai_usage
     where user_id = p_user_id
       and usage_date < v_day - 7;
  end if;

  return query select v_count <= p_limit, v_count, p_limit;
end;
$$;

-- Callable only from the Edge Function runtime. This function is SECURITY DEFINER, so an EXECUTE
-- grant to authenticated would hand any signed-in user the ability to inflate someone else's
-- counter (or their own, to no benefit) by passing an arbitrary p_user_id over /rest/v1/rpc/.
revoke all on function public.bump_ai_usage(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.bump_ai_usage(uuid, integer, text) to service_role;
