const HEX_32 = 64;

export function normalizeAddress(value) {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value)) return null;
  return value.toLowerCase();
}

export function decodeAddressTopic(topic) {
  if (typeof topic !== "string") return null;
  const hex = topic.replace(/^0x/, "");
  if (hex.length !== HEX_32) return null;
  return normalizeAddress(`0x${hex.slice(24)}`);
}

export function dataWord(data, index) {
  const hex = String(data ?? "").replace(/^0x/, "");
  const start = index * HEX_32;
  if (hex.length < start + HEX_32) return null;
  return hex.slice(start, start + HEX_32);
}

export function decodeAddressWord(data, index) {
  const word = dataWord(data, index);
  return word ? normalizeAddress(`0x${word.slice(24)}`) : null;
}

export function decodeUintWord(data, index) {
  const word = dataWord(data, index);
  return word ? BigInt(`0x${word}`) : null;
}

export function decodeAbiString(data) {
  const hex = String(data ?? "").replace(/^0x/, "");
  if (!hex) return null;
  try {
    if (hex.length === HEX_32) {
      return Buffer.from(hex, "hex").toString("utf8").replace(/\0+$/u, "") || null;
    }
    const offset = Number(BigInt(`0x${hex.slice(0, HEX_32)}`)) * 2;
    const length = Number(BigInt(`0x${hex.slice(offset, offset + HEX_32)}`));
    const start = offset + HEX_32;
    return Buffer.from(hex.slice(start, start + length * 2), "hex").toString("utf8") || null;
  } catch {
    return null;
  }
}

export function decodeAbiUint(data) {
  const word = dataWord(data, 0);
  return word ? BigInt(`0x${word}`) : null;
}

