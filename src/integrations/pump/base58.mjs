const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

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
