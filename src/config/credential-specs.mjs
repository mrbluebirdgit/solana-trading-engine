const credentialSpecs = Object.freeze({
  helius: Object.freeze([
    Object.freeze({
      name: "HELIUS_API_KEY",
      description: "Helius project API key",
      validate: (value) => /^[A-Za-z0-9_-]{16,128}$/.test(value),
      invalidMessage: "must be a 16-128 character Helius API key",
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
