function positiveInteger(value, field) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${field} must be a positive safe integer`);
  }
  return value;
}

function requiredKey(value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError("dedupe key must be a non-empty string");
  }
  return value;
}

export class TtlDeduper {
  #entries = new Map();
  #evictions = 0;
  #expirations = 0;
  #maxEntries;
  #now;
  #ttlMs;

  constructor({ maxEntries, ttlMs, now = Date.now } = {}) {
    this.#maxEntries = positiveInteger(maxEntries, "maxEntries");
    this.#ttlMs = positiveInteger(ttlMs, "ttlMs");
    if (typeof now !== "function") {
      throw new TypeError("now must be a function");
    }
    this.#now = now;
  }

  #nowMs() {
    const value = this.#now();
    if (!Number.isFinite(value)) {
      throw new TypeError("now must return a finite millisecond timestamp");
    }
    return value;
  }

  #pruneAt(nowMs) {
    let removed = 0;
    for (const [key, expiresAt] of this.#entries) {
      if (expiresAt <= nowMs) {
        this.#entries.delete(key);
        removed += 1;
      }
    }
    this.#expirations += removed;
    return removed;
  }

  remember(key) {
    const normalizedKey = requiredKey(key);
    const nowMs = this.#nowMs();
    this.#pruneAt(nowMs);

    if (this.#entries.has(normalizedKey)) {
      return false;
    }

    const expiresAt = nowMs + this.#ttlMs;
    if (!Number.isFinite(expiresAt)) {
      throw new RangeError("dedupe expiry exceeds the numeric timestamp range");
    }

    if (this.#entries.size >= this.#maxEntries) {
      const oldestKey = this.#entries.keys().next().value;
      this.#entries.delete(oldestKey);
      this.#evictions += 1;
    }

    this.#entries.set(normalizedKey, expiresAt);
    return true;
  }

  has(key) {
    const normalizedKey = requiredKey(key);
    this.#pruneAt(this.#nowMs());
    return this.#entries.has(normalizedKey);
  }

  delete(key) {
    return this.#entries.delete(requiredKey(key));
  }

  prune() {
    return this.#pruneAt(this.#nowMs());
  }

  clear() {
    this.#entries.clear();
  }

  get size() {
    this.#pruneAt(this.#nowMs());
    return this.#entries.size;
  }

  snapshot() {
    this.#pruneAt(this.#nowMs());
    return Object.freeze({
      size: this.#entries.size,
      maxEntries: this.#maxEntries,
      ttlMs: this.#ttlMs,
      evictions: this.#evictions,
      expirations: this.#expirations,
    });
  }
}
