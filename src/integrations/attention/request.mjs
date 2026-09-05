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

export async function requestJson(url, {
  fetchImpl = fetch,
  headers = {},
  timeoutMs = 8_000,
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
  if (!response.ok) {
    throw new Error(`${provider} returned HTTP ${response.status}`);
  }
  try {
    return await response.json();
  } catch {
    throw new Error(`${provider} returned malformed JSON`);
  }
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
