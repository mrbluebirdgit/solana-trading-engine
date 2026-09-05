import { createAtomicJsonStore } from "./atomic-json-store.mjs";

function dayOf(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf())) throw new TypeError("budget clock is invalid");
  return date.toISOString().slice(0, 10);
}

function timestampOf(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf())) throw new TypeError("budget timestamp is invalid");
  return date.toISOString();
}

function normalizeState(value, provider, today) {
  if (
    !value ||
    value.schemaVersion !== 1 ||
    value.provider !== provider ||
    typeof value.day !== "string" ||
    !Number.isSafeInteger(value.used) ||
    value.used < 0 ||
    (value.consecutiveFailures !== undefined &&
      (!Number.isSafeInteger(value.consecutiveFailures) ||
        value.consecutiveFailures < 0)) ||
    (value.blockedUntil !== null &&
      (typeof value.blockedUntil !== "string" ||
        !Number.isFinite(new Date(value.blockedUntil).valueOf())))
  ) {
    throw new Error(`${provider} request-budget state is invalid`);
  }
  if (value.day !== today) {
    return {
      schemaVersion: 1,
      provider,
      day: today,
      used: 0,
      blockedUntil: null,
      consecutiveFailures: 0,
    };
  }
  return { ...value, consecutiveFailures: value.consecutiveFailures ?? 0 };
}

export function createDailyRequestBudget({
  provider,
  dailyLimit,
  reserve,
  statePath,
  clock = () => new Date(),
  createStoreImpl = createAtomicJsonStore,
} = {}) {
  if (typeof provider !== "string" || provider.trim() === "") {
    throw new TypeError("budget provider is required");
  }
  if (!Number.isSafeInteger(dailyLimit) || dailyLimit < 1) {
    throw new TypeError("budget dailyLimit must be a positive integer");
  }
  if (!Number.isSafeInteger(reserve) || reserve < 0 || reserve >= dailyLimit) {
    throw new TypeError("budget reserve must be smaller than dailyLimit");
  }

  const name = provider.trim().toLowerCase();
  const store = createStoreImpl({
    filePath: statePath,
    defaultValue: {
      schemaVersion: 1,
      provider: name,
      day: dayOf(clock()),
      used: 0,
      blockedUntil: null,
      consecutiveFailures: 0,
    },
  });
  let state = null;
  let tail = Promise.resolve();

  function schedule(operation) {
    const pending = tail.catch(() => {}).then(operation);
    tail = pending.catch(() => {});
    return pending;
  }

  async function ensureLoaded() {
    if (state) return;
    state = normalizeState(await store.load(), name, dayOf(clock()));
    await store.save(state);
  }

  function rotate() {
    const today = dayOf(clock());
    if (state.day !== today) {
      state = {
        schemaVersion: 1,
        provider: name,
        day: today,
        used: 0,
        blockedUntil: null,
        consecutiveFailures: 0,
      };
      return true;
    }
    return false;
  }

  async function take() {
    await ensureLoaded();
    const rotated = rotate();
    const nowMs = new Date(clock()).valueOf();
    const blockedUntilMs = state.blockedUntil === null
      ? null
      : new Date(state.blockedUntil).valueOf();
    if (blockedUntilMs !== null && blockedUntilMs > nowMs) {
      if (rotated) await store.save(state);
      return Object.freeze({
        ok: false,
        provider: name,
        reason: "provider_backoff",
        blockedUntil: state.blockedUntil,
        remaining: Math.max(0, dailyLimit - reserve - state.used),
      });
    }
    if (blockedUntilMs !== null) state.blockedUntil = null;

    const spendable = dailyLimit - reserve;
    if (state.used >= spendable) {
      await store.save(state);
      return Object.freeze({
        ok: false,
        provider: name,
        reason: "daily_budget_exhausted",
        blockedUntil: null,
        remaining: 0,
      });
    }

    state.used += 1;
    await store.save(state);
    return Object.freeze({
      ok: true,
      provider: name,
      reason: null,
      blockedUntil: null,
      remaining: spendable - state.used,
    });
  }

  async function blockFor(milliseconds) {
    if (!Number.isFinite(milliseconds) || milliseconds < 1) {
      throw new TypeError("budget backoff must be a positive duration");
    }
    await ensureLoaded();
    rotate();
    const blockedUntil = new Date(new Date(clock()).valueOf() + milliseconds);
    state.blockedUntil = timestampOf(blockedUntil);
    await store.save(state);
    return state.blockedUntil;
  }

  async function backoff({
    retryAfterMs = null,
    baseMs = 30_000,
    maximumMs = 15 * 60 * 1_000,
  } = {}) {
    for (const [field, value] of Object.entries({ baseMs, maximumMs })) {
      if (!Number.isSafeInteger(value) || value < 1) {
        throw new TypeError(`budget ${field} must be a positive integer`);
      }
    }
    if (maximumMs < baseMs) {
      throw new TypeError("budget maximumMs must be at least baseMs");
    }
    if (retryAfterMs !== null && (!Number.isSafeInteger(retryAfterMs) || retryAfterMs < 1)) {
      throw new TypeError("budget retryAfterMs must be a positive integer when provided");
    }
    await ensureLoaded();
    rotate();
    state.consecutiveFailures += 1;
    const exponent = Math.min(20, state.consecutiveFailures - 1);
    const exponentialMs = Math.min(maximumMs, baseMs * (2 ** exponent));
    const durationMs = Math.min(
      maximumMs,
      Math.max(exponentialMs, retryAfterMs ?? 0),
    );
    const candidate = new Date(new Date(clock()).valueOf() + durationMs);
    const current = state.blockedUntil === null
      ? 0
      : new Date(state.blockedUntil).valueOf();
    if (candidate.valueOf() > current) state.blockedUntil = timestampOf(candidate);
    await store.save(state);
    return state.blockedUntil;
  }

  async function succeed() {
    await ensureLoaded();
    rotate();
    state.consecutiveFailures = 0;
    await store.save(state);
  }

  function snapshot() {
    if (!state) {
      return Object.freeze({
        provider: name,
        ready: false,
        dailyLimit,
        reserve,
        spendable: dailyLimit - reserve,
        used: null,
        remaining: null,
        blockedUntil: null,
        consecutiveFailures: null,
      });
    }
    const spendable = dailyLimit - reserve;
    return Object.freeze({
      provider: name,
      ready: true,
      dailyLimit,
      reserve,
      spendable,
      used: state.used,
      remaining: Math.max(0, spendable - state.used),
      blockedUntil: state.blockedUntil,
      consecutiveFailures: state.consecutiveFailures,
    });
  }

  return Object.freeze({
    ready: () => schedule(ensureLoaded),
    take: () => schedule(take),
    blockFor: (milliseconds) => schedule(() => blockFor(milliseconds)),
    backoff: (options) => schedule(() => backoff(options)),
    succeed: () => schedule(succeed),
    snapshot,
    flush: async () => {
      await tail;
      await store.flush();
    },
  });
}
