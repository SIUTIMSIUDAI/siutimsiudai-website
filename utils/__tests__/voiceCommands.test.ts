import { matchVoiceCommand } from "@/utils/voiceCommands";

// The matcher is deliberately locale-agnostic: Hong Kong cooks code-switch mid-sentence, and a
// zh-HK recogniser can still return English words. So both languages are always accepted.
describe("matchVoiceCommand", () => {
  it("recognises English next", () => {
    expect(matchVoiceCommand("next")).toBe("next");
    expect(matchVoiceCommand("Next step")).toBe("next");
    expect(matchVoiceCommand("go next")).toBe("next");
    expect(matchVoiceCommand("continue")).toBe("next");
  });

  it("recognises English back", () => {
    expect(matchVoiceCommand("back")).toBe("back");
    expect(matchVoiceCommand("go back")).toBe("back");
    expect(matchVoiceCommand("previous")).toBe("back");
    expect(matchVoiceCommand("previous step")).toBe("back");
  });

  it("recognises Cantonese next", () => {
    expect(matchVoiceCommand("下一步")).toBe("next");
    expect(matchVoiceCommand("下一步啦")).toBe("next");
    expect(matchVoiceCommand("繼續")).toBe("next");
  });

  it("recognises Cantonese back", () => {
    expect(matchVoiceCommand("上一步")).toBe("back");
    expect(matchVoiceCommand("返上一步")).toBe("back");
  });

  it("normalises casing and surrounding whitespace", () => {
    expect(matchVoiceCommand("  NEXT  ")).toBe("next");
    expect(matchVoiceCommand("BACK")).toBe("back");
  });

  it("resolves an ambiguous transcript by first occurrence", () => {
    expect(matchVoiceCommand("back to next")).toBe("back");
    expect(matchVoiceCommand("next, no go back")).toBe("next");
  });

  it("returns null for unrelated speech or empty input", () => {
    expect(matchVoiceCommand("beat the eggs")).toBeNull();
    expect(matchVoiceCommand("加鹽拂勻")).toBeNull();
    expect(matchVoiceCommand("")).toBeNull();
    expect(matchVoiceCommand("   ")).toBeNull();
  });
});
