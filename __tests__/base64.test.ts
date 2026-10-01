import { base64ToArrayBuffer } from "@/utils/base64";

// Photos leave the picker as base64 and must reach Storage as raw bytes. Hermes cannot be relied on
// for atob, so the app decodes it itself. Vectors checked by hand against RFC 4648.
const bytes = (b64: string) => Array.from(new Uint8Array(base64ToArrayBuffer(b64)));

describe("base64ToArrayBuffer", () => {
  it("decodes a full group", () => {
    expect(bytes("TWFu")).toEqual([77, 97, 110]);
  });

  it("decodes one and two padding characters", () => {
    expect(bytes("TWE=")).toEqual([77, 97]);
    expect(bytes("TQ==")).toEqual([77]);
  });

  it("decodes the top of the alphabet, + and /", () => {
    expect(bytes("+/8=")).toEqual([251, 255]);
  });

  it("decodes the start of a JPEG", () => {
    expect(bytes("/9j/4A==")).toEqual([255, 216, 255, 224]);
  });

  it("ignores line breaks some encoders insert", () => {
    expect(bytes("TW\nFu")).toEqual([77, 97, 110]);
  });

  it("returns no bytes for an empty string", () => {
    expect(bytes("")).toEqual([]);
  });
});
