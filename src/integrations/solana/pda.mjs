import { createHash } from "node:crypto";

import { decodePublicKey, encodeBase58 } from "./base58.mjs";

const PDA_MARKER = Buffer.from("ProgramDerivedAddress");
const P =
  0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffedn;
const D =
  0x52036cee2b6ffe738cc740797779e89800700a4d4141d8ab75eb4dca135978a3n;

function mod(a) {
  const r = a % P;
  return r < 0n ? r + P : r;
}

function powMod(base, exp) {
  let result = 1n;
  let b = mod(base);
  let e = exp;
  while (e > 0n) {
    if (e & 1n) result = mod(result * b);
    b = mod(b * b);
    e >>= 1n;
  }
  return result;
}

function inv(a) {
  return powMod(a, P - 2n);
}

function isOnCurve(bytes) {
  if (bytes.length !== 32) return false;
  let y = 0n;
  for (let i = 0; i < 32; i += 1) {
    y |= BigInt(bytes[i]) << BigInt(8 * i);
  }
  const sign = y >> 255n;
  y &= (1n << 255n) - 1n;
  if (y >= P) return false;

  const y2 = mod(y * y);
  const u = mod(y2 - 1n);
  const v = mod(D * y2 + 1n);
  if (v === 0n) return false;
  let x2 = mod(u * inv(v));
  let x = powMod(x2, (P + 3n) / 8n);
  if (mod(x * x) !== x2) {
    const I = powMod(2n, (P - 1n) / 4n);
    x = mod(x * I);
  }
  if (mod(x * x) !== x2) return false;
  if (x === 0n && sign === 1n) return false;
  return true;
}

export function findProgramAddress(seeds, programId) {
  const programBytes =
    typeof programId === "string" ? decodePublicKey(programId, "programId") : programId;
  const seedBytes = seeds.map((seed, index) => {
    if (typeof seed === "string") return Buffer.from(seed);
    if (seed instanceof Uint8Array || Buffer.isBuffer(seed)) return seed;
    throw new TypeError(`seed[${index}] must be bytes or text`);
  });

  for (let bump = 255; bump >= 0; bump -= 1) {
    const hash = createHash("sha256");
    for (const seed of seedBytes) hash.update(seed);
    hash.update(Buffer.from([bump]));
    hash.update(programBytes);
    hash.update(PDA_MARKER);
    const digest = hash.digest();
    if (!isOnCurve(digest)) {
      return Object.freeze({
        address: encodeBase58(digest),
        bump,
      });
    }
  }

  throw new Error("unable to find a valid program address");
}

