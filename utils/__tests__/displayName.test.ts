import { DISPLAY_NAME_MAX, normaliseDisplayName } from "../displayName";

// normaliseDisplayName cleans the free-text "how should we call you?" field before it becomes a
// member's displayName on the family roster. It trims, collapses runs of whitespace, caps the
// length so one person can't stretch a roster row, and returns null when there is nothing real to
// save (so the caller stores null and the roster falls back to "Family member" rather than a blank).
describe("normaliseDisplayName", () => {
  it("returns null for an empty or whitespace-only name", () => {
    expect(normaliseDisplayName("")).toBeNull();
    expect(normaliseDisplayName("   ")).toBeNull();
    expect(normaliseDisplayName("\n\t ")).toBeNull();
  });

  it("trims surrounding whitespace", () => {
    expect(normaliseDisplayName("  Amy  ")).toBe("Amy");
  });

  it("collapses internal runs of whitespace to a single space", () => {
    expect(normaliseDisplayName("Amy   Wong")).toBe("Amy Wong");
    expect(normaliseDisplayName("Amy\t\tWong")).toBe("Amy Wong");
  });

  it("keeps a normal name unchanged", () => {
    expect(normaliseDisplayName("Amy Wong")).toBe("Amy Wong");
  });

  it("keeps a Chinese name unchanged", () => {
    expect(normaliseDisplayName("小明")).toBe("小明");
  });

  it("caps an over-long name at DISPLAY_NAME_MAX characters", () => {
    const long = "a".repeat(DISPLAY_NAME_MAX + 20);
    expect(normaliseDisplayName(long)).toBe("a".repeat(DISPLAY_NAME_MAX));
  });

  it("does not leave trailing whitespace after capping", () => {
    // 29 letters + several spaces: the slice would land inside the spaces, which must be trimmed off.
    const raw = "b".repeat(DISPLAY_NAME_MAX - 1) + "          ";
    expect(normaliseDisplayName(raw)).toBe("b".repeat(DISPLAY_NAME_MAX - 1));
  });
});
