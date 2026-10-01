import { isSupabaseConfigured, supabase } from "./supabase";
import { base64ToArrayBuffer } from "@/utils/base64";

/**
 * The signed-in user's optional profile photo, kept in Supabase Storage so it follows the account to
 * any device and can be shown to their family manager.
 *
 * Security: photos live in the private `avatars` bucket, in a folder named after the owner's auth
 * user id. The storage policies in database/0010_profile_avatars.sql let only the owner write that
 * folder, and only the owner or their family manager read it. profiles.avatar_path records the
 * current file under the same profile policies as display_name, so the roster only ever learns a
 * path the caller may also read.
 *
 * Every save writes a NEW file name: an image layer may cache a link, and a fresh name means a changed
 * photo never shows stale. The old file is deleted once the profile points away from it.
 *
 * When Supabase is unconfigured (web preview, tests) reads return null and writes report failure.
 */

export const AVATAR_BUCKET = "avatars";
// Signed links are short-lived; screens sign again on their next load.
const LINK_SECONDS = 60 * 60;

export type AvatarSaveResult = { ok: true; url: string | null } | { ok: false };

// The picker returns JPEG for camera-roll photos but keeps PNG for screenshots and saved PNGs, so a
// photo is labelled by what its bytes are. Anything else (a GIF) is refused, matching the bucket's
// allowed types.
const PHOTO_FORMATS = [
  { signature: [0xff, 0xd8, 0xff], contentType: "image/jpeg", extension: "jpg" },
  { signature: [0x89, 0x50, 0x4e, 0x47], contentType: "image/png", extension: "png" },
];

function photoFormat(bytes: Uint8Array) {
  return PHOTO_FORMATS.find((f) => f.signature.every((b, i) => bytes[i] === b)) ?? null;
}

/** Where a new photo goes: in the owner's folder (what the storage policies check), named by time. */
export function avatarObjectPath(userId: string, now: number, extension = "jpg"): string {
  return `${userId}/${now}.${extension}`;
}

async function currentUserId(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

async function readAvatarPath(uid: string): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("avatar_path")
    .eq("id", uid)
    .maybeSingle();
  if (error || !data) return null;
  return (data.avatar_path as string | null) ?? null;
}

async function signedLink(path: string): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .createSignedUrl(path, LINK_SECONDS);
  return error || !data ? null : data.signedUrl;
}

/** A link to the signed-in user's photo, or null when they have none (or there is no backend). */
export async function getMyAvatarUrl(): Promise<string | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  const uid = await currentUserId();
  if (!uid) return null;
  const path = await readAvatarPath(uid);
  return path ? signedLink(path) : null;
}

/** Links for several photos at once (the family roster), keyed by path. Unreadable ones are left out. */
export async function getAvatarUrls(paths: string[]): Promise<Record<string, string>> {
  if (!isSupabaseConfigured || !supabase || paths.length === 0) return {};
  const { data, error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .createSignedUrls(paths, LINK_SECONDS);
  if (error || !data) return {};
  const urls: Record<string, string> = {};
  for (const item of data) {
    if (!item.error && item.path && item.signedUrl) urls[item.path] = item.signedUrl;
  }
  return urls;
}

/**
 * Save a new photo (raw base64 JPEG or PNG from the picker). The profile is pointed at the new file
 * before the old one is deleted, so a failure part-way never leaves the profile pointing at nothing. A
 * leftover old file (its delete failed) is swept up by the next removal or by account deletion.
 */
export async function saveMyAvatar(base64: string): Promise<AvatarSaveResult> {
  if (!isSupabaseConfigured || !supabase) return { ok: false };
  const body = base64ToArrayBuffer(base64);
  const format = photoFormat(new Uint8Array(body));
  if (!format) return { ok: false };
  const uid = await currentUserId();
  if (!uid) return { ok: false };
  const bucket = supabase.storage.from(AVATAR_BUCKET);
  const previous = await readAvatarPath(uid);
  const path = avatarObjectPath(uid, Date.now(), format.extension);

  const { error: uploadError } = await bucket.upload(path, body, {
    contentType: format.contentType,
  });
  if (uploadError) return { ok: false };

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ avatar_path: path })
    .eq("id", uid);
  if (updateError) {
    // Nothing points at the new file, so take it away again rather than leave it behind.
    await bucket.remove([path]);
    return { ok: false };
  }

  if (previous && previous !== path) await bucket.remove([previous]);
  return { ok: true, url: await signedLink(path) };
}

/**
 * Remove the photo. The files go first: if that fails nothing has changed and the user can simply try
 * again, and a photo is never left in storage after the user has been told it is gone. Deleting the
 * whole folder also sweeps up files an earlier interrupted change left behind.
 */
export async function removeMyAvatar(): Promise<{ ok: boolean }> {
  if (!isSupabaseConfigured || !supabase) return { ok: false };
  const uid = await currentUserId();
  if (!uid) return { ok: false };
  const bucket = supabase.storage.from(AVATAR_BUCKET);
  const { data: files, error: listError } = await bucket.list(uid);
  if (listError) return { ok: false };
  if (files && files.length > 0) {
    const { error: removeError } = await bucket.remove(files.map((f) => `${uid}/${f.name}`));
    if (removeError) return { ok: false };
  }
  const { error } = await supabase.from("profiles").update({ avatar_path: null }).eq("id", uid);
  return { ok: !error };
}
