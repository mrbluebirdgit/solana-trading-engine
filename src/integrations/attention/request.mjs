function isForbiddenHostname(hostname) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized === "0.0.0.0" ||
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  ) return true;

  const octets = normalized.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [first, second] = octets;
  return first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224;
}

function checkedEndpoint(url, provider) {
  const endpoint = url instanceof URL ? new URL(url) : new URL(url);
  if (endpoint.protocol !== "https:") {
    throw new TypeError(`${provider} endpoint must use HTTPS`);
  }
  if (isForbiddenHostname(endpoint.hostname)) {
    throw new TypeError(`${provider} endpoint must not target a local network`);
  }
  return endpoint;
}

function retryAfterMilliseconds(response, now = new Date()) {
  const raw = response?.headers?.get?.("retry-after");
  if (typeof raw !== "string" || raw.trim() === "") return null;
  if (/^\d+$/.test(raw.trim())) return Math.max(1_000, Number(raw.trim()) * 1_000);
  const retryAt = new Date(raw).valueOf();
  const nowMs = new Date(now).valueOf();
  return Number.isFinite(retryAt) && retryAt > nowMs ? retryAt - nowMs : null;
}

async function applyBackoff(budget, options) {
  if (!budget) return;
  if (typeof budget.backoff === "function") {
    await budget.backoff(options);
    return;
  }
  if (typeof budget.blockFor === "function") {
    await budget.blockFor(options.retryAfterMs ?? options.baseMs);
  }
}

export async function requestJson(url, {
  fetchImpl = fetch,
  headers = {},
  timeoutMs = 8_000,
  signal: externalSignal,
  provider = "provider",
  budget = null,
} = {}) {
  const endpoint = checkedEndpoint(url, provider);
  if (budget) {
    const permit = await budget.take();
    if (!permit.ok) {
      throw new Error(`${provider} ${permit.reason.replaceAll("_", " ")}`);
    }
  }
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = externalSignal
    ? AbortSignal.any([externalSignal, timeoutSignal])
    : timeoutSignal;
  let response;
  try {
    response = await fetchImpl(endpoint, { headers, signal });
  } catch (error) {
    if (externalSignal?.aborted) throw error;
    await applyBackoff(budget, { baseMs: 30_000, maximumMs: 15 * 60 * 1_000 });
    if (timeoutSignal.aborted) throw new Error(`${provider} request timed out`);
    throw new Error(`${provider} request could not be completed`);
  }
  if (!response.ok) {
    if (response.status === 429) {
      await applyBackoff(budget, {
        retryAfterMs: retryAfterMilliseconds(response) ?? 15 * 60 * 1_000,
        baseMs: 30_000,
        maximumMs: 24 * 60 * 60 * 1_000,
      });
    } else if (response.status === 401 || response.status === 403) {
      await applyBackoff(budget, {
        retryAfterMs: 24 * 60 * 60 * 1_000,
        baseMs: 24 * 60 * 60 * 1_000,
        maximumMs: 24 * 60 * 60 * 1_000,
      });
    } else if (response.status >= 500) {
      await applyBackoff(budget, {
        baseMs: 30_000,
        maximumMs: 15 * 60 * 1_000,
      });
    }
    throw new Error(`${provider} returned HTTP ${response.status}`);
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    await applyBackoff(budget, { baseMs: 30_000, maximumMs: 5 * 60 * 1_000 });
    throw new Error(`${provider} returned malformed JSON`);
  }
  await budget?.succeed?.();
  return payload;
}

export async function requestText(url, {
  fetchImpl = fetch,
  headers = {},
  timeoutMs = 8_000,
  maximumCharacters = 1_000_000,
  signal: externalSignal,
  provider = "provider",
} = {}) {
  const endpoint = checkedEndpoint(url, provider);
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = externalSignal
    ? AbortSignal.any([externalSignal, timeoutSignal])
    : timeoutSignal;
  let response;
  try {
    response = await fetchImpl(endpoint, { headers, signal });
  } catch (error) {
    if (externalSignal?.aborted) throw error;
    if (timeoutSignal.aborted) throw new Error(`${provider} request timed out`);
    throw new Error(`${provider} request could not be completed`);
  }
  if (!response.ok) throw new Error(`${provider} returned HTTP ${response.status}`);
  const body = await response.text();
  if (body.length > maximumCharacters) {
    throw new Error(`${provider} response exceeded the configured size limit`);
  }
  return body;
}
