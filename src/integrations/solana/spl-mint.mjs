export function decodeSplMintAccount(data) {
  const bytes =
    data instanceof Uint8Array
      ? data
      : Buffer.isBuffer(data)
        ? new Uint8Array(data)
        : null;
  if (!bytes || bytes.length < 82) {
    return Object.freeze({
      mintAuthority: "unknown",
      freezeAuthority: "unknown",
    });
  }

  const mintAuthorityOption = bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24);
  const freezeAuthorityOption =
    bytes[46] | (bytes[47] << 8) | (bytes[48] << 16) | (bytes[49] << 24);

  return Object.freeze({
    mintAuthority: mintAuthorityOption === 0 ? "renounced" : mintAuthorityOption === 1 ? "active" : "unknown",
    freezeAuthority:
      freezeAuthorityOption === 0
        ? "renounced"
        : freezeAuthorityOption === 1
          ? "active"
          : "unknown",
    decimals: bytes[44],
    initialized: bytes[45] === 1,
  });
}

