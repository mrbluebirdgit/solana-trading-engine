const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const INDEX = new Map([...ALPHABET].map((ch, i) => [ch, i]));

export function encodeBase58(bytes) {
  if (!(bytes instanceof Uint8Array) && !Buffer.isBuffer(bytes)) {
    throw new TypeError("base58 input must be bytes");
  }

  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros += 1;

  const size = Math.ceil((bytes.length * 138) / 100) + 1;
  const digits = new Uint8Array(size);
  let length = 0;

  for (let i = zeros; i < bytes.length; i += 1) {
    let carry = bytes[i];
    let j = 0;
    for (let k = size - 1; (carry !== 0 || j < length) && k >= 0; k -= 1, j += 1) {
      carry += 256 * digits[k];
      digits[k] = carry % 58;
      carry = (carry / 58) | 0;
    }
    length = j;
  }

  let start = size - length;
  while (start < size && digits[start] === 0) start += 1;

  let encoded = "1".repeat(zeros);
  for (let i = start; i < size; i += 1) {
    encoded += ALPHABET[digits[i]];
  }
  return encoded;
}

export function decodeBase58(value, field = "address") {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${field} must be a base58 address`);
  }
  const text = value.trim();
  let zeros = 0;
  while (zeros < text.length && text[zeros] === "1") zeros += 1;

  const size = Math.ceil((text.length * 733) / 1000) + 1;
  const bytes = new Uint8Array(size);
  let length = 0;

  for (let i = zeros; i < text.length; i += 1) {
    const digit = INDEX.get(text[i]);
    if (digit === undefined) {
      throw new TypeError(`${field} is not valid base58`);
    }
    let carry = digit;
    let j = 0;
    for (let k = size - 1; (carry !== 0 || j < length) && k >= 0; k -= 1, j += 1) {
      carry += 58 * bytes[k];
      bytes[k] = carry % 256;
      carry = (carry / 256) | 0;
    }
    length = j;
  }

  let start = size - length;
  while (start < size && bytes[start] === 0) start += 1;
  const out = new Uint8Array(zeros + (size - start));
  out.set(bytes.subarray(start), zeros);
  return out;
}

export function decodePublicKey(value, field = "address") {
  const bytes = decodeBase58(value, field);
  if (bytes.length !== 32) {
    throw new TypeError(`${field} must decode to 32 bytes`);
  }
  return bytes;
}
