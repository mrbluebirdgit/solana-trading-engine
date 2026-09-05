const credentialSpecs = Object.freeze({
  birdeye: Object.freeze([
    Object.freeze({
      name: "BIRDEYE_API_KEY",
      description: "Birdeye Data read-only API key",
      validate: (value) => /^[!-~]{16,512}$/.test(value),
      invalidMessage: "must be 16-512 non-whitespace characters",
    }),
  ]),
  gmgn: Object.freeze([
    Object.freeze({
      name: "GMGN_API_KEY",
      description: "GMGN read-only intelligence API key",
      validate: (value) => /^[!-~]{16,512}$/.test(value),
      invalidMessage: "must be 16-512 non-whitespace characters",
    }),
  ]),
  helius: Object.freeze([
    Object.freeze({
      name: "HELIUS_API_KEY",
      description: "Helius project API key",
      validate: (value) => /^[A-Za-z0-9_-]{16,128}$/.test(value),
      invalidMessage: "must be a 16-128 character Helius API key",
    }),
  ]),
  jupiter: Object.freeze([
    Object.freeze({
      name: "JUPITER_API_KEY",
      description: "Jupiter market-data and routing API key",
      validate: (value) => /^[!-~]{16,512}$/.test(value),
      invalidMessage: "must be 16-512 non-whitespace characters",
    }),
  ]),
  lunarcrush: Object.freeze([
    Object.freeze({
      name: "LUNARCRUSH_API_KEY",
      description: "LunarCrush read-only social intelligence API key",
      validate: (value) => /^[!-~]{16,512}$/.test(value),
      invalidMessage: "must be 16-512 non-whitespace characters",
    }),
  ]),
  newsapi: Object.freeze([
    Object.freeze({
      name: "NEWSAPI_KEY",
      description: "NewsAPI read-only news discovery API key",
      validate: (value) => /^[!-~]{16,512}$/.test(value),
      invalidMessage: "must be 16-512 non-whitespace characters",
    }),
  ]),
  solscan: Object.freeze([
    Object.freeze({
      name: "SOLSCAN_API_KEY",
      description: "Solscan Pro read-only API key",
      validate: (value) => /^[!-~]{16,512}$/.test(value),
      invalidMessage: "must be 16-512 non-whitespace characters",
    }),
  ]),
  telegram: Object.freeze([
    Object.freeze({
      name: "TELEGRAM_API_ID",
      description: "Telegram application identifier",
      validate: (value) => /^[1-9]\d{3,12}$/.test(value),
      invalidMessage: "must be 4-13 digits and cannot begin with zero",
    }),
    Object.freeze({
      name: "TELEGRAM_API_HASH",
      description: "Telegram application secret hash",
      validate: (value) => /^[a-f0-9]{32}$/i.test(value),
      invalidMessage: "must be exactly 32 hexadecimal characters",
    }),
  ]),
  x: Object.freeze([
    Object.freeze({
      name: "X_BEARER_TOKEN",
      description: "X API read-only bearer token",
      validate: (value) => /^[!-~]{20,2048}$/.test(value),
      invalidMessage: "must be 20-2048 non-whitespace characters",
    }),
  ]),
});

export function listProviders() {
  return Object.keys(credentialSpecs);
}

export function validateProvider(provider, environment = process.env) {
  const specs = credentialSpecs[provider];

  if (!specs) {
    throw new Error(`Unknown provider: ${provider}`);
  }

  const checks = specs.map((spec) => {
    const value = environment[spec.name]?.trim() ?? "";

    if (!value) {
      return {
        name: spec.name,
        description: spec.description,
        ok: false,
        reason: "is missing",
      };
    }

    if (!spec.validate(value)) {
      return {
        name: spec.name,
        description: spec.description,
        ok: false,
        reason: spec.invalidMessage,
      };
    }

    return {
      name: spec.name,
      description: spec.description,
      ok: true,
      reason: "is present and correctly formatted",
    };
  });

  return {
    provider,
    ok: checks.every((check) => check.ok),
    checks,
  };
}
