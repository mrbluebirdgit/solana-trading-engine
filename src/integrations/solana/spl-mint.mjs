const SPL_MINT_LENGTH = 82;
const TOKEN_ACCOUNT_LENGTH = 165;
const TOKEN_2022_ACCOUNT_TYPE_MINT = 1;
const TOKEN_2022_TLV_START = TOKEN_ACCOUNT_LENGTH + 1;

const TOKEN_2022_EXTENSION_NAMES = Object.freeze([
  "uninitialized",
  "transfer_fee_config",
  "transfer_fee_amount",
  "mint_close_authority",
  "confidential_transfer_mint",
  "confidential_transfer_account",
  "default_account_state",
  "immutable_owner",
  "memo_transfer",
  "non_transferable",
  "interest_bearing_config",
  "cpi_guard",
  "permanent_delegate",
  "non_transferable_account",
  "transfer_hook",
  "transfer_hook_account",
  "confidential_transfer_fee_config",
  "confidential_transfer_fee_amount",
  "metadata_pointer",
  "token_metadata",
  "group_pointer",
  "token_group",
  "group_member_pointer",
  "token_group_member",
  "confidential_mint_burn",
  "scaled_ui_amount",
  "pausable",
  "pausable_account",
  "permissioned_burn",
]);

const TOKEN_2022_MINT_EXTENSION_TYPES = new Set([
  1, 3, 4, 6, 9, 10, 12, 14, 16, 18, 19, 20, 21, 22, 23, 24, 25, 26, 28,
]);
const TOKEN_2022_METADATA_EXTENSION_TYPES = new Set([18, 19, 20, 21, 22, 23]);

function asBytes(data) {
  return data instanceof Uint8Array
    ? data
    : Buffer.isBuffer(data)
      ? new Uint8Array(data)
      : null;
}

function token2022Result({ safe, reason = null, extensionTypes = [] }) {
  const extensions = Object.freeze(extensionTypes.map((type) =>
    TOKEN_2022_EXTENSION_NAMES[type] ?? `unknown_${type}`,
  ));
  return Object.freeze({
    safe,
    reason,
    extensionTypes: Object.freeze([...extensionTypes]),
    extensions,
  });
}

function invalidToken2022(extensionTypes = []) {
  return token2022Result({
    safe: false,
    reason: "token_2022_extension_data_invalid",
    extensionTypes,
  });
}

function expectedLength(type, length) {
  if (type === 19) return length >= 80;
  const exactLengths = new Map([
    [18, 64],
    [20, 64],
    [21, 80],
    [22, 64],
    [23, 72],
  ]);
  return exactLengths.get(type) === length;
}

export function inspectToken2022MintExtensions(
  data,
  { expectedMintBytes = null } = {},
) {
  const bytes = asBytes(data);
  if (!bytes || bytes.length < SPL_MINT_LENGTH) return invalidToken2022();
  if (bytes.length === SPL_MINT_LENGTH) {
    return token2022Result({ safe: true });
  }
  if (bytes.length <= TOKEN_2022_TLV_START) return invalidToken2022();
  if (bytes.slice(SPL_MINT_LENGTH, TOKEN_ACCOUNT_LENGTH).some((byte) => byte !== 0)) {
    return invalidToken2022();
  }
  if (bytes[TOKEN_ACCOUNT_LENGTH] !== TOKEN_2022_ACCOUNT_TYPE_MINT) {
    return invalidToken2022();
  }

  const expectedMint = expectedMintBytes === null ? null : asBytes(expectedMintBytes);
  if (expectedMint !== null && expectedMint.length !== 32) {
    throw new TypeError("expectedMintBytes must contain exactly 32 bytes");
  }

  const extensionTypes = [];
  const seen = new Set();
  let offset = TOKEN_2022_TLV_START;
  while (offset < bytes.length) {
    const remaining = bytes.length - offset;
    if (remaining < 2) {
      return bytes[offset] === 0
        ? token2022Result({ safe: true, extensionTypes })
        : invalidToken2022(extensionTypes);
    }

    const type = bytes[offset] | (bytes[offset + 1] << 8);
    if (type === 0) {
      return token2022Result({ safe: true, extensionTypes });
    }
    if (remaining < 4 || seen.has(type)) return invalidToken2022(extensionTypes);

    const length = bytes[offset + 2] | (bytes[offset + 3] << 8);
    const valueStart = offset + 4;
    const valueEnd = valueStart + length;
    if (valueEnd > bytes.length) return invalidToken2022(extensionTypes);

    extensionTypes.push(type);
    seen.add(type);
    if (!TOKEN_2022_MINT_EXTENSION_TYPES.has(type)) {
      return token2022Result({
        safe: false,
        reason: type < TOKEN_2022_EXTENSION_NAMES.length
          ? "token_2022_extension_base_mismatch"
          : "token_2022_unknown_extension",
        extensionTypes,
      });
    }

    if (type === 6) {
      if (length !== 1 || bytes[valueStart] === 0 || bytes[valueStart] > 2) {
        return invalidToken2022(extensionTypes);
      }
      if (bytes[valueStart] === 2) {
        return token2022Result({
          safe: false,
          reason: "token_2022_default_account_state_frozen",
          extensionTypes,
        });
      }
    } else if (TOKEN_2022_METADATA_EXTENSION_TYPES.has(type)) {
      if (!expectedLength(type, length)) return invalidToken2022(extensionTypes);
      if (
        type === 19 &&
        expectedMint &&
        expectedMint.some((byte, index) => byte !== bytes[valueStart + 32 + index])
      ) {
        return invalidToken2022(extensionTypes);
      }
    } else {
      return token2022Result({
        safe: false,
        reason: `token_2022_${TOKEN_2022_EXTENSION_NAMES[type]}`,
        extensionTypes,
      });
    }

    offset = valueEnd;
  }

  return token2022Result({ safe: true, extensionTypes });
}

export function decodeSplMintAccount(data) {
  const bytes = asBytes(data);
  if (!bytes || bytes.length < SPL_MINT_LENGTH) {
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

export const splMintConstants = Object.freeze({
  splMintLength: SPL_MINT_LENGTH,
  tokenAccountLength: TOKEN_ACCOUNT_LENGTH,
  token2022TlvStart: TOKEN_2022_TLV_START,
  token2022ExtensionNames: TOKEN_2022_EXTENSION_NAMES,
});

