// Request handling for pantry-scan's receipt mode ({ mode: "receipt", images: [...] }): one to three
// photos of the same grocery receipt, read together in one model call. Pure on purpose: no Deno
// globals and no imports, so the app's Jest suite can test it (index.ts calls Deno.serve at module
// scope and cannot be imported).

export const MAX_RECEIPT_PHOTOS = 3;

// The image types Gemini reads inline. Anything else is sent as JPEG, as the fridge scan does.
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

export interface ReceiptImage {
  mimeType: string;
  data: string;
}

/**
 * The photos of a receipt request, or null when the request is unusable: not a list, empty, more
 * than three photos (a longer receipt is a second scan, so one AI use stays one receipt), or any
 * photo without image data.
 */
export function receiptImages(raw: unknown): ReceiptImage[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_RECEIPT_PHOTOS) return null;
  const images: ReceiptImage[] = [];
  for (const entry of raw) {
    const photo = entry as { data?: unknown; mediaType?: unknown } | null;
    if (!photo || typeof photo.data !== "string" || photo.data.length === 0) return null;
    const type = typeof photo.mediaType === "string" ? photo.mediaType : "";
    images.push({ mimeType: IMAGE_TYPES.includes(type) ? type : "image/jpeg", data: photo.data });
  }
  return images;
}
