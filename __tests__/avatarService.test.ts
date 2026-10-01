// A profile photo is the first file the app ever uploads, and the storage policies only let a user
// write inside a folder named after their own id. These tests pin the service to that layout and to
// an order of operations that, when a step fails, never leaves the profile pointing at a photo that
// is gone and never leaves a "removed" photo sitting in storage.
//
// The Supabase client is the only fake: a small stand-in for the profiles row and the avatars bucket.

import {
  getAvatarUrls,
  getMyAvatarUrl,
  removeMyAvatar,
  saveMyAvatar,
} from "@/services/avatarService";

const mockUid = "6f1c2a9e-3b7d-4e21-9a55-0c8d4b2e7f10";
const UID = mockUid;
const PREVIOUS = `${UID}/1700000000000.jpg`;
const JPEG_BASE64 = "/9j/4A=="; // FF D8 FF E0, the start of a JPEG

// Ordered record of every write, so the tests can check what happened in which order.
const mockLog: string[] = [];
const mockState = {
  avatarPath: null as string | null,
  updateError: null as { message: string } | null,
};
const mockBucket = {
  upload: jest.fn(),
  remove: jest.fn(),
  list: jest.fn(),
  createSignedUrl: jest.fn(),
  createSignedUrls: jest.fn(),
};

jest.mock("@/services/supabase", () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: mockUid } } } }),
    },
    from: (table: string) => {
      if (table !== "profiles") throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { avatar_path: mockState.avatarPath }, error: null }),
          }),
        }),
        update: (patch: { avatar_path: string | null }) => ({
          eq: async () => {
            mockLog.push(`profile -> ${patch.avatar_path}`);
            if (mockState.updateError) return { error: mockState.updateError };
            mockState.avatarPath = patch.avatar_path;
            return { error: null };
          },
        }),
      };
    },
    storage: {
      from: (bucket: string) => {
        if (bucket !== "avatars") throw new Error(`unexpected bucket ${bucket}`);
        return mockBucket;
      },
    },
  },
}));

beforeEach(() => {
  mockLog.length = 0;
  mockState.avatarPath = PREVIOUS;
  mockState.updateError = null;
  mockBucket.upload.mockReset().mockImplementation(async (path: string) => {
    mockLog.push(`upload ${path}`);
    return { data: { path }, error: null };
  });
  mockBucket.remove.mockReset().mockImplementation(async (paths: string[]) => {
    mockLog.push(`remove ${paths.join(",")}`);
    return { data: [], error: null };
  });
  mockBucket.list
    .mockReset()
    .mockResolvedValue({ data: [{ name: "1700000000000.jpg" }], error: null });
  mockBucket.createSignedUrl
    .mockReset()
    .mockImplementation(async (path: string) => ({
      data: { signedUrl: `https://signed/${path}` },
      error: null,
    }));
  mockBucket.createSignedUrls.mockReset();
});

describe("saveMyAvatar", () => {
  it("uploads the photo as JPEG bytes into the user's own folder", async () => {
    await saveMyAvatar(JPEG_BASE64);
    const [path, body, options] = mockBucket.upload.mock.calls[0];
    expect(path).toMatch(new RegExp(`^${UID}/\\d+\\.jpg$`));
    expect(Array.from(new Uint8Array(body as ArrayBuffer))).toEqual([255, 216, 255, 224]);
    expect(options).toEqual({ contentType: "image/jpeg" });
  });

  it("points the profile at the new photo before deleting the old one", async () => {
    const result = await saveMyAvatar(JPEG_BASE64);
    const newPath = mockBucket.upload.mock.calls[0][0] as string;
    expect(mockLog).toEqual([`upload ${newPath}`, `profile -> ${newPath}`, `remove ${PREVIOUS}`]);
    expect(result).toEqual({ ok: true, url: `https://signed/${newPath}` });
  });

  it("deletes nothing when there was no earlier photo", async () => {
    mockState.avatarPath = null;
    await saveMyAvatar(JPEG_BASE64);
    expect(mockBucket.remove).not.toHaveBeenCalled();
  });

  it("leaves the profile alone when the upload fails", async () => {
    mockBucket.upload.mockResolvedValueOnce({ data: null, error: { message: "network" } });
    await expect(saveMyAvatar(JPEG_BASE64)).resolves.toEqual({ ok: false });
    expect(mockState.avatarPath).toBe(PREVIOUS);
    expect(mockBucket.remove).not.toHaveBeenCalled();
  });

  it("takes the new file away again when the profile cannot be updated", async () => {
    mockState.updateError = { message: "network" };
    await expect(saveMyAvatar(JPEG_BASE64)).resolves.toEqual({ ok: false });
    const newPath = mockBucket.upload.mock.calls[0][0] as string;
    expect(mockBucket.remove).toHaveBeenCalledWith([newPath]);
    expect(mockBucket.remove).not.toHaveBeenCalledWith([PREVIOUS]);
  });
});

describe("removeMyAvatar", () => {
  it("deletes every file in the user's folder, then clears the profile", async () => {
    mockBucket.list.mockResolvedValueOnce({
      data: [{ name: "1700000000000.jpg" }, { name: "1690000000000.jpg" }],
      error: null,
    });
    await expect(removeMyAvatar()).resolves.toEqual({ ok: true });
    expect(mockBucket.list).toHaveBeenCalledWith(UID);
    expect(mockLog).toEqual([
      `remove ${UID}/1700000000000.jpg,${UID}/1690000000000.jpg`,
      "profile -> null",
    ]);
    expect(mockState.avatarPath).toBeNull();
  });

  it("changes nothing when the files cannot be deleted, so the user can try again", async () => {
    mockBucket.remove.mockResolvedValueOnce({ data: null, error: { message: "network" } });
    await expect(removeMyAvatar()).resolves.toEqual({ ok: false });
    expect(mockState.avatarPath).toBe(PREVIOUS);
  });

  it("changes nothing when the folder cannot be read", async () => {
    mockBucket.list.mockResolvedValueOnce({ data: null, error: { message: "network" } });
    await expect(removeMyAvatar()).resolves.toEqual({ ok: false });
    expect(mockState.avatarPath).toBe(PREVIOUS);
  });
});

describe("getMyAvatarUrl", () => {
  it("signs a link to the current photo", async () => {
    await expect(getMyAvatarUrl()).resolves.toBe(`https://signed/${PREVIOUS}`);
  });

  it("is null when there is no photo", async () => {
    mockState.avatarPath = null;
    await expect(getMyAvatarUrl()).resolves.toBeNull();
    expect(mockBucket.createSignedUrl).not.toHaveBeenCalled();
  });
});

describe("getAvatarUrls", () => {
  it("keys links by path and leaves out photos the caller may not read", async () => {
    mockBucket.createSignedUrls.mockResolvedValueOnce({
      data: [
        { path: "a/1.jpg", signedUrl: "https://signed/a", error: null },
        { path: "b/2.jpg", signedUrl: "", error: "Either the object does not exist or you do not have access to it" },
      ],
      error: null,
    });
    await expect(getAvatarUrls(["a/1.jpg", "b/2.jpg"])).resolves.toEqual({
      "a/1.jpg": "https://signed/a",
    });
  });

  it("asks for nothing when no member has a photo", async () => {
    await expect(getAvatarUrls([])).resolves.toEqual({});
    expect(mockBucket.createSignedUrls).not.toHaveBeenCalled();
  });
});

describe("without a backend", () => {
  it("reports failure instead of pretending to save", async () => {
    // Clear the registry first: Jest otherwise hands back the configured client built above.
    jest.resetModules();
    jest.doMock("@/services/supabase", () => ({ supabase: null, isSupabaseConfigured: false }));
    const svc: typeof import("@/services/avatarService") = require("@/services/avatarService");
    await expect(svc.saveMyAvatar(JPEG_BASE64)).resolves.toEqual({ ok: false });
    await expect(svc.getMyAvatarUrl()).resolves.toBeNull();
  });
});
