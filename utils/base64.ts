// Decode standard base64 (RFC 4648, as expo-image-picker returns it, no data: prefix) into raw bytes
// for a Storage upload. Written out by hand because Hermes does not guarantee a global atob in every
// React Native release, and an over-the-air update cannot add one.
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const VALUE_OF = new Uint8Array(128);
for (let i = 0; i < ALPHABET.length; i++) VALUE_OF[ALPHABET.charCodeAt(i)] = i;

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  // Padding and line breaks carry no data.
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, "");
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let out = 0;
  for (let i = 0; i < clean.length; i++) {
    buffer = ((buffer << 6) | VALUE_OF[clean.charCodeAt(i)]) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[out++] = (buffer >> bits) & 0xff;
    }
  }
  return bytes.buffer as ArrayBuffer;
}
