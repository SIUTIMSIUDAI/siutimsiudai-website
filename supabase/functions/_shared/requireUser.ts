// Shared caller-identity gate for every Edge Function that spends money.
//
// THE FAILURE THIS PREVENTS
//
// Supabase's platform-level `verify_jwt` (on by default) is not an authorisation check. It asks
// "is this a valid JWT for this project?" and the *anon key satisfies that question*. The anon key
// is EXPO_PUBLIC_SUPABASE_ANON_KEY, which Expo inlines into the JavaScript bundle, so it is
// readable by anyone who unzips the IPA or APK. That is fine and expected for a publishable key.
// What is not fine is that it was, on its own, enough to reach the AI functions.
//
// The AI functions hold a Google Cloud service account and call Vertex AI on every request. With
// `verify_jwt` as the only gate, the chain was:
//
//     unzip the app -> read the anon key -> POST estimate-meal in a loop -> unbounded GCP bill
//
// No sign-in, no account, no ceiling, no alert. This helper closes that by resolving the bearer
// token to an actual auth user with the service role key. An anon or publishable key resolves to
// no user, so it is rejected before a single Vertex token is spent.
//
// Every caller in the app reaches these functions through supabase.functions.invoke(), which
// attaches the signed-in user's access token automatically, and app/_layout.tsx gates the whole
// app on having a session. So no legitimate call loses access.
//
// Runs in the Supabase Deno runtime, excluded from the app tsconfig. `Deno` is a runtime global.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface AuthOk {
  ok: true;
  /** The auth user id the token resolved to. The only identity a function may act on. */
  userId: string;
}

export interface AuthFail {
  ok: false;
  /** Ready-to-return rejection, CORS headers already applied. */
  response: Response;
}

export type AuthResult = AuthOk | AuthFail;

/**
 * Resolve the request's bearer token to a real signed-in user.
 *
 * Returns the user id on success. On failure it returns a finished Response, so a call site is:
 *
 *     const auth = await requireUser(req, CORS);
 *     if (!auth.ok) return auth.response;
 *
 * Deliberately returns a flat "unauthorized" to the client either way. Telling an unauthenticated
 * caller *why* their token failed only helps someone probing the endpoint.
 */
export async function requireUser(
  req: Request,
  cors: Record<string, string>,
): Promise<AuthResult> {
  const fail = (error: string, status: number): AuthFail => ({
    ok: false,
    response: new Response(JSON.stringify({ error }), {
      status,
      headers: { ...cors, "content-type": "application/json" },
    }),
  });

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  // Both are injected into every Edge Function by the platform, so this only trips on a broken
  // deployment. Fail closed: no identity check possible means no billable work.
  if (!url || !serviceKey) return fail("not_configured", 500);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return fail("unauthorized", 401);

  // Admin client (service role). Never created on a device; the key exists only in this runtime.
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // The load-bearing line. An anon key, a publishable key, an expired token, or a token from
  // another project all resolve to no user here.
  const { data, error } = await admin.auth.getUser(token);
  const userId = data?.user?.id;
  if (error || !userId) return fail("unauthorized", 401);

  return { ok: true, userId };
}
