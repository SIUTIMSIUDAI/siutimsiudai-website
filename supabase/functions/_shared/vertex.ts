// Shared Google Cloud (Vertex AI) client for the Edge Function proxies.
//
// SECURITY (the whole point of this file): the Google Cloud service account — including its RSA
// private key — lives ONLY here, server-side, as a Supabase secret (GCP_SERVICE_ACCOUNT_KEY).
// It is never shipped to a device or the app bundle and cannot be pulled off the JS the way an
// EXPO_PUBLIC_ key could. Each request mints a short-lived OAuth access token from that key and
// calls Vertex with a Bearer token; the key material itself never leaves this runtime.
//
// Why a service account and not a simple API key: true Vertex AI (…-aiplatform.googleapis.com)
// authenticates with Google OAuth, not an "?key=" query param. So the secret is the service account
// JSON (client_email + private_key), and we run the standard JWT-bearer grant by hand — there is no
// Google SDK / Application Default Credentials in the Supabase Deno runtime.
//
// Runs in the Supabase Deno runtime (Deno.env, crypto.subtle, fetch, btoa/atob), excluded from the
// app tsconfig. `Deno` is a runtime global here.

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/cloud-platform";

export const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

// Map an internal throw to a stable client-facing error. We deliberately expose only coarse codes
// (never the underlying Google/token error text) so nothing about the credentials leaks to callers,
// and so the client's mock-fallback logic keeps working unchanged.
export function proxyError(err: unknown): Response {
  const msg = err instanceof Error ? err.message : "";
  // Log the full reason server-side (visible only in the Supabase function logs, never to the
  // client) so an operator can diagnose a 5xx without any of it reaching the device.
  console.error("[vertex] proxyError:", msg);
  if (msg.startsWith("not_configured")) return json({ error: "not_configured" }, 500);
  if (msg.startsWith("auth_failed") || msg.startsWith("upstream_failed") || msg.startsWith("bad_model_json"))
    return json({ error: "upstream_failed" }, 502);
  return json({ error: "internal_error" }, 500);
}

// Gemini is asked to answer with pure JSON (generationConfig.responseMimeType), but never trust it:
// strip a ```json fence and grab the first balanced {...} so a stray sentence can't break parsing.
//
// Both failure modes throw with a "bad_model_json" prefix so proxyError classifies them as an
// UPSTREAM problem (502), not an internal bug (500). This mattered: a truncated response used to
// surface as a bare JSON.parse SyntaxError -> "internal_error", which sent us hunting for a broken
// credential when the model had actually answered fine and just run out of output budget.
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced ? fenced[1] : text).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`bad_model_json no_json len=${body.length} head=${body.slice(0, 200)}`);
  }
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    // Nearly always truncation: the model ran out of maxOutputTokens mid-object. Log the tail so
    // the shape of the cut is obvious at a glance.
    throw new Error(`bad_model_json unparseable len=${body.length} tail=${body.slice(-160)}`);
  }
}

// --- Service account + OAuth ------------------------------------------------------------------

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id?: string;
}

let saCache: ServiceAccount | null = null;

function readServiceAccount(): ServiceAccount {
  if (saCache) return saCache;
  const raw = Deno.env.get("GCP_SERVICE_ACCOUNT_KEY");
  if (!raw) throw new Error("not_configured");
  let parsed: ServiceAccount;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("not_configured");
  }
  if (!parsed.client_email || !parsed.private_key) throw new Error("not_configured");
  saCache = parsed;
  return parsed;
}

function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// PEM (-----BEGIN PRIVATE KEY-----, PKCS#8) -> raw DER bytes for crypto.subtle.importKey.
function pemToPkcs8(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

// Cache the access token across warm invocations of a single function instance (Google tokens last
// ~1h). Refreshed 60s early so an in-flight request never races the expiry.
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt - 60 > now) return cachedToken.value;

  const sa = readServiceAccount();
  const enc = new TextEncoder();
  const header = base64url(enc.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claims = base64url(
    enc.encode(
      JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: TOKEN_ENDPOINT, iat: now, exp: now + 3600 }),
    ),
  );
  const unsigned = `${header}.${claims}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(unsigned));
  const assertion = `${unsigned}.${base64url(new Uint8Array(sig))}`;

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`auth_failed http=${res.status} ${detail.slice(0, 400)}`);
  }
  const data = await res.json();
  const token = data?.access_token;
  if (typeof token !== "string" || !token) {
    throw new Error("auth_failed no_access_token");
  }
  cachedToken = { value: token, expiresAt: now + (Number(data.expires_in) || 3600) };
  return token;
}

// --- Vertex AI generateContent ---------------------------------------------------------------

export interface VertexPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

export interface GenerateContentOptions {
  system?: string;
  parts: VertexPart[];
  maxOutputTokens?: number;
  temperature?: number;
}

function projectId(): string {
  const explicit = Deno.env.get("GOOGLE_CLOUD_PROJECT");
  if (explicit) return explicit;
  const sa = readServiceAccount();
  if (sa.project_id) return sa.project_id;
  throw new Error("not_configured");
}

// Gemini 2.5 models "think" before answering, and those thinking tokens are billed against
// maxOutputTokens. Left on, a complex bilingual-JSON prompt can spend the entire budget reasoning
// and return truncated (or empty) JSON — which is exactly what broke pantry-scan and
// generate-recipe: Vertex answered in 5-9s, then extractJson choked on a half-written object.
//
// These prompts are extraction and formatting, not reasoning, so thinking buys us nothing. Turn it
// off where the model allows it. 2.5-pro cannot go to 0 and rejects the request if you try, so it
// gets the documented minimum. Pre-2.5 models have no thinkingConfig at all and 400 if sent one.
function thinkingBudgetFor(model: string): number | undefined {
  const raw = Deno.env.get("VERTEX_THINKING_BUDGET");
  if (raw !== undefined && raw !== "") {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return n; // escape hatch, no redeploy needed
  }
  if (!/2\.5/.test(model)) return undefined;
  return /2\.5-pro/.test(model) ? 128 : 0;
}

// Call a Gemini model on Vertex AI and return the raw text of the first candidate. Forces JSON-only
// output via responseMimeType; the caller still runs extractJson + full shape validation, so the
// model is never trusted. Throws (never returns partial junk) so the client reports a failed call.
export async function vertexGenerateContent(model: string, opts: GenerateContentOptions): Promise<string> {
  const token = await getAccessToken();
  const location = Deno.env.get("VERTEX_LOCATION") || "us-central1";
  const project = projectId();
  const endpoint =
    `https://${location}-aiplatform.googleapis.com/v1/projects/${project}` +
    `/locations/${location}/publishers/google/models/${model}:generateContent`;

  const thinkingBudget = thinkingBudgetFor(model);
  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: opts.maxOutputTokens ?? 4096,
    temperature: opts.temperature ?? 0.4,
    responseMimeType: "application/json",
  };
  if (thinkingBudget !== undefined) generationConfig.thinkingConfig = { thinkingBudget };

  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts: opts.parts }],
    generationConfig,
  };
  if (opts.system) body.systemInstruction = { parts: [{ text: opts.system }] };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`upstream_failed http=${res.status} model=${model} loc=${location} ${detail.slice(0, 600)}`);
  }

  const payload = await res.json();
  const candidate = payload?.candidates?.[0];
  // finishReason is the single most useful field when a call "succeeds" but yields nothing usable:
  // MAX_TOKENS means we truncated, SAFETY means the model refused. Carry it into every error.
  const finish = candidate?.finishReason ?? "unknown";
  const parts = candidate?.content?.parts;
  if (!Array.isArray(parts)) {
    throw new Error(
      `upstream_failed no_parts finish=${finish} budget=${thinkingBudget ?? "default"} ` +
        JSON.stringify(payload).slice(0, 600),
    );
  }
  const text = parts.map((p: VertexPart) => (typeof p.text === "string" ? p.text : "")).join("").trim();
  if (!text) {
    throw new Error(
      `upstream_failed empty_text finish=${finish} budget=${thinkingBudget ?? "default"} ` +
        JSON.stringify(payload).slice(0, 600),
    );
  }
  // We got text, but a MAX_TOKENS finish means it is very likely cut mid-JSON. Say so here rather
  // than letting it reappear downstream as an unexplained parse failure.
  if (finish === "MAX_TOKENS") {
    console.error(
      `[vertex] truncated model=${model} usage=`,
      JSON.stringify(payload?.usageMetadata ?? {}),
    );
  }
  return text;
}
