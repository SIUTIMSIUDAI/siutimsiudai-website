// Find or create the caller's own household, shared by create-family-invite (inviting someone needs a
// group to invite them into) and plan-week (a Max user can plan for the family before anyone has
// joined). Call it only after the Max check: it is what turns a Max user into a family's manager.
//
// Runs in the Supabase Deno runtime, excluded from the app tsconfig.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

type AdminClient = SupabaseClient;

/**
 * The group this user owns, creating it on first use, with the user recorded as its manager.
 * The unique index family_groups_one_per_owner keeps it to exactly one per owner; on a lost insert
 * race the winner's row is re-selected. Null only when the database refuses both.
 */
export async function ensureOwnGroup(
  admin: AdminClient,
  uid: string,
): Promise<{ groupId: string; maxMembers: number } | null> {
  let groupId: string | null = null;
  let maxMembers = 6;
  const { data: existing } = await admin
    .from("family_groups")
    .select("id, max_members")
    .eq("owner_id", uid)
    .maybeSingle();
  if (existing) {
    groupId = existing.id;
    maxMembers = existing.max_members;
  } else {
    const { data: inserted, error: insErr } = await admin
      .from("family_groups")
      .insert({ owner_id: uid })
      .select("id, max_members")
      .single();
    if (!insErr && inserted) {
      groupId = inserted.id;
      maxMembers = inserted.max_members;
    } else {
      const { data: retry } = await admin
        .from("family_groups")
        .select("id, max_members")
        .eq("owner_id", uid)
        .maybeSingle();
      if (retry) {
        groupId = retry.id;
        maxMembers = retry.max_members;
      }
    }
  }
  if (!groupId) return null;

  // Ensure the caller is recorded as this group's manager (idempotent).
  await admin
    .from("family_members")
    .upsert({ group_id: groupId, user_id: uid, role: "manager" }, {
      onConflict: "group_id,user_id",
      ignoreDuplicates: true,
    });

  return { groupId, maxMembers };
}
