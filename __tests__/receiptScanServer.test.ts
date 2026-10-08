// The pantry-scan function runs in Deno and calls Deno.serve at module scope, so it cannot be
// imported here. Its receipt-mode request handling lives in a pure module beside it, which can.
import { receiptImages } from "../supabase/functions/pantry-scan/receipt";

describe("receiptImages", () => {
  it("accepts one to three photos, defaulting the type to JPEG", () => {
    expect(receiptImages([{ data: "AAA" }, { data: "BBB", mediaType: "image/png" }])).toEqual([
      { mimeType: "image/jpeg", data: "AAA" },
      { mimeType: "image/png", data: "BBB" },
    ]);
  });

  it("refuses more than three photos, so one AI use stays one receipt", () => {
    const photos = Array.from({ length: 4 }, () => ({ data: "AAA" }));
    expect(receiptImages(photos)).toBeNull();
    expect(receiptImages(photos.slice(0, 3))).toHaveLength(3);
  });

  it("refuses an empty list or anything that isn't a list", () => {
    expect(receiptImages([])).toBeNull();
    expect(receiptImages(undefined)).toBeNull();
    expect(receiptImages("AAA")).toBeNull();
  });

  it("refuses the whole request when any photo has no image data", () => {
    expect(receiptImages([{ data: "AAA" }, { data: "" }])).toBeNull();
    expect(receiptImages([{ data: 42 }])).toBeNull();
    expect(receiptImages([null])).toBeNull();
  });

  it("passes only image types the model reads, and treats anything else as JPEG", () => {
    expect(receiptImages([{ data: "AAA", mediaType: "image/webp" }])).toEqual([
      { mimeType: "image/webp", data: "AAA" },
    ]);
    expect(receiptImages([{ data: "AAA", mediaType: "text/html" }])).toEqual([
      { mimeType: "image/jpeg", data: "AAA" },
    ]);
  });
});
