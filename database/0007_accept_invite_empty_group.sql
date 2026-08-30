-- 0007_accept_invite_empty_group.sql  ·  Fix: solo managers were permanently blocked from accepting
--
-- The original accept_family_invite (0002) blocked ANY caller who already held a family_members row,
-- with reason 'already_linked'. But a user becomes the manager of their own (empty) group the moment
-- they tap "Create invitation link", so anyone who had ever generated a link could never afterwards
-- accept someone else's invite. In practice every real account is a solo manager of an empty group,
-- so a cross-account link never once completed for a real user.
--
-- Amended rule (still "one family per user"):
--   * already a DEPENDENT somewhere    -> block ('already_linked')  [the one-dependency rule]
--   * a MANAGER with real dependents   -> block ('manages_family')  [already runs a household]
--   * a SOLO manager of an EMPTY group -> allow: disband that empty group, then join as a dependent
--   * no membership at all             -> allow (unchanged happy path)
--
-- Everything else (token validation, self-invite guard, seat cap, single-use burn, FOR UPDATE lock)
-- is preserved verbatim from 0002. SECURITY DEFINER with an empty search_path; every reference is
-- schema-qualified. Disbanding an empty group is already within the caller's rights today
-- (family_groups_owner_delete / family_members_delete), so this grants no new privilege; it only
-- automates the leave step during accept.

create or replace function public.accept_family_invite(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_hash text := encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  v_uid uuid := auth.uid();
  v_inv public.family_invitations;
  v_max integer;
  v_count integer;
  v_inviter_name text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  -- Lock the invite so two concurrent taps cannot both consume a single-use token.
  select * into v_inv from public.family_invitations where token_hash = v_hash for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  if v_inv.status <> 'pending' then
    return jsonb_build_object(
      'ok', false,
      'reason', case when v_inv.status = 'accepted' then 'already_used' else v_inv.status::text end
    );
  end if;

  if v_inv.expires_at <= now() then
    update public.family_invitations set status = 'expired' where id = v_inv.id;
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;

  if v_inv.inviter_id = v_uid then
    return jsonb_build_object('ok', false, 'reason', 'self');
  end if;

  -- One family per user, but do NOT trap a solo manager of an empty group (see header).
  -- (a) Already a dependent elsewhere: they must leave that family first.
  if exists (
    select 1 from public.family_members
    where user_id = v_uid and role = 'dependent'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'already_linked');
  end if;

  -- (b) A manager who actually has dependents runs a household; they cannot also become a dependent.
  if exists (
    select 1
    from public.family_members mgr
    join public.family_members dep
      on dep.group_id = mgr.group_id and dep.role = 'dependent'
    where mgr.user_id = v_uid and mgr.role = 'manager'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'manages_family');
  end if;

  -- (c) Solo manager of an empty group: disband it so joining leaves exactly one membership.
  -- Deleting the group cascades its self-only membership row and any dangling invitations.
  -- Safe because (b) has already excluded any group that still contains a dependent.
  delete from public.family_groups
  where id in (
    select group_id from public.family_members
    where user_id = v_uid and role = 'manager'
  );

  select max_members into v_max from public.family_groups where id = v_inv.group_id;
  select count(*) into v_count from public.family_members where group_id = v_inv.group_id;
  if v_count >= v_max then
    return jsonb_build_object('ok', false, 'reason', 'group_full');
  end if;

  insert into public.family_members (group_id, user_id, role)
  values (v_inv.group_id, v_uid, 'dependent');

  update public.family_invitations
    set status = 'accepted', accepted_by = v_uid, accepted_at = now()
    where id = v_inv.id;

  select coalesce(display_name, '') into v_inviter_name from public.profiles where id = v_inv.inviter_id;
  return jsonb_build_object('ok', true, 'group_id', v_inv.group_id, 'inviter_name', v_inviter_name);
end;
$$;

-- Re-assert the hardened grants from 0003 (CREATE OR REPLACE keeps them; explicit is belt-and-braces).
revoke all on function public.accept_family_invite(text) from public, anon;
grant execute on function public.accept_family_invite(text) to authenticated;
