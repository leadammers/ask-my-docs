const PDF_MAGIC_BYTES = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

/** True if the bytes start with the PDF magic (the extension and MIME type are client-controlled). */
export function hasPdfMagic(bytes: Uint8Array): boolean {
  if (bytes.length < PDF_MAGIC_BYTES.length) return false;
  return PDF_MAGIC_BYTES.every((magicByte, index) => bytes[index] === magicByte);
}
