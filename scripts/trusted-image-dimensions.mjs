export function trustedImageDimensions(bytes, mimeType) {
  const be16 = (index) => (bytes[index] << 8) | bytes[index + 1];
  const be32 = (index) => ((bytes[index] * 0x1000000) + ((bytes[index + 1] << 16) | (bytes[index + 2] << 8) | bytes[index + 3])) >>> 0;

  if (mimeType === "image/png" && bytes.length >= 24) return { width: be32(16), height: be32(20) };
  if (mimeType === "image/jpeg") {
    for (let index = 2; index + 9 < bytes.length;) {
      if (bytes[index] !== 0xff) { index += 1; continue; }
      const marker = bytes[index + 1];
      if (marker === 0xd8 || marker === 0xd9) { index += 2; continue; }
      const length = be16(index + 2);
      if (length < 2 || index + 2 + length > bytes.length) return null;
      if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) return { width: be16(index + 7), height: be16(index + 5) };
      index += 2 + length;
    }
  }
  if (mimeType === "image/webp" && bytes.length >= 30 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF") {
    const tag = String.fromCharCode(...bytes.slice(12, 16));
    if (tag === "VP8X") return { width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16), height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16) };
    if (tag === "VP8 " && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) return { width: (bytes[26] | (bytes[27] << 8)) & 0x3fff, height: (bytes[28] | (bytes[29] << 8)) & 0x3fff };
    if (tag === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f) { const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24); return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) }; }
  }
  return null;
}
