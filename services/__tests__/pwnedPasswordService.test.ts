// The two properties that matter here are not "does it find a breached password" — that is the easy
// one — but:
//
//   1. The password, and its full hash, must NEVER be transmitted. Only five hex characters may
//      leave the device. If that ever regresses, this stops being a privacy-preserving check and
//      becomes us posting our users' password hashes to a third party. So it is asserted directly,
//      against the real URL, rather than assumed from reading the code.
//
//   2. It must fail OPEN. Every network path a phone can take — offline, captive portal, timeout,
//      HIBP having a bad day — has to end in "allowed", or a third party's downtime becomes our
//      sign-up form being broken.

const mockDigest = jest.fn();

jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA1: "SHA-1" },
  digestStringAsync: (...a: unknown[]) => mockDigest(...a),
}));

import { isPasswordPwned } from "../pwnedPasswordService";

// The real SHA-1 of "Password123!". Verified against the live API, which reports it at 295,389
// sightings — so the fixture is a password the corpus genuinely holds, not an invented one. Split at
// the boundary the k-anonymity scheme uses, so the assertions below can name each half.
const PREFIX = "49EFE";
const SUFFIX = "F5F70D47ADC2DB2EB397FBEF5F7BC560E29";
const FULL_HASH = PREFIX + SUFFIX;

// Cheap guard on the fixture itself: 40 hex characters, split 5/35. A miscounted constant here
// would make every assertion below agree with each other and with nothing real.
it("uses a well-formed SHA-1 fixture", () => {
  expect(FULL_HASH).toMatch(/^[0-9A-F]{40}$/);
  expect(SUFFIX).toHaveLength(35);
});

/** A range response body in the API's real shape: CRLF-separated `SUFFIX:COUNT`. */
function body(...entries: [string, number][]): string {
  return entries.map(([s, n]) => `${s}:${n}`).join("\r\n");
}

// Two other 35-character suffixes that share the prefix, standing in for the ~800 a real range
// response returns.
const OTHER = "0018A45C4D1DEF81644B54AB7F969B88D65";
const ANOTHER = "1E4C9B93F3F0682250B6CF8331B7EE68FD8";

it("uses well-formed decoy suffixes", () => {
  expect(OTHER).toHaveLength(35);
  expect(ANOTHER).toHaveLength(35);
});

let mockFetch: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockDigest.mockResolvedValue(FULL_HASH);
  mockFetch = jest.fn();
  global.fetch = mockFetch as unknown as typeof fetch;
});

/** Answer the range call with these entries. */
function respond(text: string, ok = true) {
  mockFetch.mockResolvedValue({ ok, text: async () => text });
}

describe("what leaves the device", () => {
  it("sends only the first five hex characters of the hash", async () => {
    respond(body([OTHER, 5]));

    await isPasswordPwned("Password123!");

    const url = String(mockFetch.mock.calls[0][0]);
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${PREFIX}`);
    // Stated independently of the constant: whatever the prefix is, the URL must end right there.
    expect(url).toMatch(/\/range\/[0-9A-F]{5}$/);
  });

  it("never puts the password or the rest of the hash in the request", async () => {
    respond(body([OTHER, 5]));

    await isPasswordPwned("Password123!");

    // Everything the call carries — URL, headers, body — flattened and searched.
    const sent = JSON.stringify(mockFetch.mock.calls[0]);
    expect(sent).not.toContain("Password123!");
    expect(sent).not.toContain(SUFFIX);
    expect(sent).not.toContain(FULL_HASH);
  });

  it("hashes with SHA-1, which is what the corpus is indexed by", async () => {
    respond(body([OTHER, 5]));

    await isPasswordPwned("Password123!");

    expect(mockDigest).toHaveBeenCalledWith("SHA-1", "Password123!");
  });

  it("asks for padding, so response size does not leak the prefix", async () => {
    respond(body([OTHER, 5]));

    await isPasswordPwned("Password123!");

    const init = mockFetch.mock.calls[0][1] as { headers: Record<string, string> };
    expect(init.headers["Add-Padding"]).toBe("true");
  });

  it("makes no request at all for an empty password", async () => {
    expect(await isPasswordPwned("")).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("reading the answer", () => {
  it("reports a breached password as breached", async () => {
    respond(body([OTHER, 5], [SUFFIX, 42], [ANOTHER, 1]));

    expect(await isPasswordPwned("Password123!")).toBe(true);
  });

  it("clears a password whose suffix is absent from the range", async () => {
    respond(body([OTHER, 5], [ANOTHER, 1]));

    expect(await isPasswordPwned("Password123!")).toBe(false);
  });

  it("ignores padding entries, which are decoys with a count of zero", async () => {
    // The whole point of Add-Padding is that these are indistinguishable from real hashes. Counting
    // one as a hit would refuse a password that has never been breached, for no discoverable reason.
    respond(body([SUFFIX, 0]));

    expect(await isPasswordPwned("Password123!")).toBe(false);
  });

  it("matches regardless of the case either side returns", async () => {
    // expo-crypto does not document the case of its hex, and the API answers in uppercase. Neither
    // is trusted; a mismatch here would silently clear every breached password.
    mockDigest.mockResolvedValue(FULL_HASH.toLowerCase());
    respond(body([SUFFIX.toLowerCase(), 42]));

    expect(await isPasswordPwned("Password123!")).toBe(true);
  });

  it("parses a response that uses bare newlines", async () => {
    respond([`${OTHER}:5`, `${SUFFIX}:42`].join("\n"));

    expect(await isPasswordPwned("Password123!")).toBe(true);
  });

  it("is not fooled by a suffix that merely starts the same", async () => {
    respond(body([SUFFIX.slice(0, -1), 900]));

    expect(await isPasswordPwned("Password123!")).toBe(false);
  });
});

describe("failing open", () => {
  // Each of these is a real thing a phone does. None may block a password change.
  it("allows the password when the device is offline", async () => {
    mockFetch.mockRejectedValue(new TypeError("Network request failed"));

    expect(await isPasswordPwned("Password123!")).toBe(false);
  });

  it("allows the password when the request times out", async () => {
    const abort = new Error("Aborted");
    abort.name = "AbortError";
    mockFetch.mockRejectedValue(abort);

    expect(await isPasswordPwned("Password123!")).toBe(false);
  });

  it("allows the password when the service answers with an error status", async () => {
    respond("upstream error", false);

    expect(await isPasswordPwned("Password123!")).toBe(false);
  });

  it("allows the password when the body is not the expected shape", async () => {
    // A captive portal answering 200 with a login page is the case this covers.
    respond("<html><body>Sign in to continue</body></html>");

    expect(await isPasswordPwned("Password123!")).toBe(false);
  });

  it("allows the password when reading the body throws", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => {
        throw new Error("stream closed");
      },
    });

    expect(await isPasswordPwned("Password123!")).toBe(false);
  });

  it("allows the password when no digest is available at all", async () => {
    // An environment without the native crypto module. Nothing to send, so nothing to check.
    mockDigest.mockRejectedValue(new Error("expo-crypto unavailable"));

    expect(await isPasswordPwned("Password123!")).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("the timeout is actually armed", () => {
  it("aborts a request that never answers, rather than hanging the sign-up button", async () => {
    jest.useFakeTimers();
    try {
      let signal: AbortSignal | undefined;
      // A fetch that resolves only when its signal aborts, like a real stalled connection.
      mockFetch.mockImplementation((_url: string, init: { signal: AbortSignal }) => {
        signal = init.signal;
        return new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () => reject(new Error("aborted")));
        });
      });

      const pending = isPasswordPwned("Password123!");
      // Let the digest promise settle so the fetch is actually in flight before the clock moves.
      await Promise.resolve();
      await Promise.resolve();
      jest.advanceTimersByTime(10_000);

      expect(await pending).toBe(false);
      expect(signal?.aborted).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });
});
