import { normaliseAuthRedirect, parseAuthFragment } from "@/utils/authRedirect";

// The regression these tests exist for: build 7 sent `siutimsiudai:///auth/callback` to Supabase,
// missed the exact-match allow-list by one slash, and every password reset link landed on the
// marketing website instead of opening the app.

describe("normaliseAuthRedirect", () => {
  it("collapses the hostless authority expo-linking emits on native", () => {
    expect(normaliseAuthRedirect("siutimsiudai:///auth/callback")).toBe("siutimsiudai://auth/callback");
  });

  it("leaves an already-correct custom scheme URL untouched", () => {
    expect(normaliseAuthRedirect("siutimsiudai://auth/callback")).toBe("siutimsiudai://auth/callback");
  });

  it("drops a trailing slash, which fails the allow-list the same way", () => {
    expect(normaliseAuthRedirect("siutimsiudai://auth/callback/")).toBe("siutimsiudai://auth/callback");
    expect(normaliseAuthRedirect("siutimsiudai:///auth/callback/")).toBe("siutimsiudai://auth/callback");
  });

  it("leaves the Expo Go proxy URL alone, host and all", () => {
    const proxy = "exp://192.168.1.5:8081/--/auth/callback";
    expect(normaliseAuthRedirect(proxy)).toBe(proxy);
  });

  it("leaves https URLs alone, since the authority is a real host", () => {
    expect(normaliseAuthRedirect("https://siutimsiudai.app/auth/callback")).toBe(
      "https://siutimsiudai.app/auth/callback",
    );
    expect(normaliseAuthRedirect("http://localhost:8081/auth/callback")).toBe(
      "http://localhost:8081/auth/callback",
    );
  });

  it("only collapses at the scheme, never inside the path", () => {
    expect(normaliseAuthRedirect("siutimsiudai://auth///callback")).toBe("siutimsiudai://auth///callback");
  });

  it("keeps a scheme-only URL parseable rather than trimming it to nothing", () => {
    expect(normaliseAuthRedirect("siutimsiudai:///")).toBe("siutimsiudai://");
    expect(normaliseAuthRedirect("siutimsiudai://")).toBe("siutimsiudai://");
  });

  it("passes empty and non-string input straight through instead of throwing", () => {
    expect(normaliseAuthRedirect("")).toBe("");
    expect(normaliseAuthRedirect(undefined as unknown as string)).toBeUndefined();
  });
});

// The second half of the same bug. Once the link opened the app, nothing could read what it said:
// GoTrue answers entirely in the fragment and `Linking.parse` only sees the query string, so a
// valid recovery link looked empty and the user was dropped on sign-in. Both URL shapes below were
// captured from the live project, not invented.

describe("parseAuthFragment", () => {
  it("reads the tokens off a successful recovery redirect", () => {
    const frag = parseAuthFragment(
      "siutimsiudai://auth/callback#access_token=eyJhbGc.payload.sig&expires_in=3600&refresh_token=v1xyz&token_type=bearer&type=recovery",
    );
    expect(frag.access_token).toBe("eyJhbGc.payload.sig");
    expect(frag.refresh_token).toBe("v1xyz");
    expect(frag.type).toBe("recovery");
  });

  it("reads the error off a spent or expired link, which is what the user actually hits", () => {
    const frag = parseAuthFragment(
      "siutimsiudai://auth/callback#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired&sb=",
    );
    expect(frag.error).toBe("access_denied");
    expect(frag.error_code).toBe("otp_expired");
    // `+` is a space in a form-encoded fragment; leaving it raw would surface in the UI copy.
    expect(frag.error_description).toBe("Email link is invalid or has expired");
  });

  it("keeps a value that contains '=' whole, so base64 padding survives", () => {
    expect(parseAuthFragment("app://cb#access_token=YWJjZA==&type=recovery").access_token).toBe(
      "YWJjZA==",
    );
  });

  it("returns nothing for a URL with no fragment, so an invite link is not read as auth", () => {
    expect(parseAuthFragment("siutimsiudai://invite/abc123")).toEqual({});
    expect(parseAuthFragment("siutimsiudai://auth/callback?code=pkce123")).toEqual({});
  });

  it("survives an empty, malformed, or non-string fragment instead of throwing", () => {
    expect(parseAuthFragment("app://cb#")).toEqual({});
    expect(parseAuthFragment("app://cb#&&=novalue&=&")).toEqual({});
    expect(parseAuthFragment("")).toEqual({});
    expect(parseAuthFragment(undefined as unknown as string)).toEqual({});
  });

  it("drops one bad pair without losing the rest", () => {
    // A lone `%` cannot be percent-decoded. The tokens beside it must still come through.
    const frag = parseAuthFragment("app://cb#bad=%&type=recovery&access_token=abc");
    expect(frag.type).toBe("recovery");
    expect(frag.access_token).toBe("abc");
    expect(frag.bad).toBeUndefined();
  });
});
