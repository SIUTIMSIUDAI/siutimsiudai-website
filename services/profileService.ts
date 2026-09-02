import { isSupabaseConfigured, supabase } from "./supabase";

/**
 * Thin wrapper over the signed-in user's own profiles row.
 *
 * Security: profiles carries the RLS policy `own_profiles` (for all using auth.uid() = id), so these
 * reads and writes only ever touch the caller's own row. The user's chosen display_name is the same
 * column the family roster reads per member, so setting it here is what makes their name show up
 * there instead of the generic "Family member" fallback.
 *
 * When Supabase is unconfigured (Expo Go without env, web preview, tests) there is no signed-in user,
 * so reads return null and writes report { ok: false } rather than inventing a result.
 */

async function currentUserId(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

/** The signed-in user's saved display name, or null if none is set / not signed in. */
export async function getMyDisplayName(): Promise<string | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  const uid = await currentUserId();
  if (!uid) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", uid)
    .maybeSingle();
  if (error || !data) return null;
  return (data.display_name as string | null) ?? null;
}

/** Save (or clear, with null) the signed-in user's display name. Returns whether the write landed. */
export async function setMyDisplayName(name: string | null): Promise<{ ok: boolean }> {
  if (!isSupabaseConfigured || !supabase) return { ok: false };
  const uid = await currentUserId();
  if (!uid) return { ok: false };
  const { error } = await supabase.from("profiles").update({ display_name: name }).eq("id", uid);
  return { ok: !error };
}
