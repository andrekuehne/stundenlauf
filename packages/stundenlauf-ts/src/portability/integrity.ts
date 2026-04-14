function toUint8Array(data: ArrayBuffer | ArrayBufferView): Uint8Array {
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

export async function sha256Hex(data: ArrayBuffer | ArrayBufferView): Promise<string> {
  const bytes = toUint8Array(data);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export async function checksumMatches(
  data: ArrayBuffer | ArrayBufferView,
  expectedHex: string,
): Promise<boolean> {
  return (await sha256Hex(data)).toLowerCase() === expectedHex.trim().toLowerCase();
}
