function positiveInteger(value, field) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${field} must be a positive safe integer`);
  }
  return value;
}

function nonNegativeInteger(value, field) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${field} must be a non-negative safe integer`);
  }
  return value;
}

export class BoundedTaskQueue {
  #accepted = 0;
  #accepting = true;
  #completed = 0;
  #cancelled = 0;
  #concurrency;
  #failed = 0;
  #idlePromise = null;
  #maxQueued;
  #overloaded = 0;
  #queue = [];
  #resolveIdle = null;
  #running = 0;

  constructor({ concurrency, maxQueued } = {}) {
    this.#concurrency = positiveInteger(concurrency, "concurrency");
    this.#maxQueued = nonNegativeInteger(maxQueued, "maxQueued");
  }

  submit(task) {
    if (typeof task !== "function") {
      throw new TypeError("task must be a function");
    }

    if (!this.#accepting) {
      return Object.freeze({
        accepted: false,
        disposition: "closed",
        reason: "queue is not accepting tasks",
        promise: null,
        state: this.snapshot(),
      });
    }

    const startsNow = this.#running < this.#concurrency;
    if (!startsNow && this.#queue.length >= this.#maxQueued) {
      this.#overloaded += 1;
      return Object.freeze({
        accepted: false,
        disposition: "overloaded",
        reason: "queue capacity reached",
        promise: null,
        state: this.snapshot(),
      });
    }

    let resolveTask;
    let rejectTask;
    const promise = new Promise((resolve, reject) => {
      resolveTask = resolve;
      rejectTask = reject;
    });
    const item = { task, resolveTask, rejectTask };
    this.#accepted += 1;

    if (startsNow) {
      this.#start(item);
    } else {
      this.#queue.push(item);
    }

    return Object.freeze({
      accepted: true,
      disposition: startsNow ? "running" : "queued",
      reason: null,
      promise,
      state: this.snapshot(),
    });
  }

  #start(item) {
    this.#running += 1;
    Promise.resolve()
      .then(() => item.task())
      .then(
        (value) => {
          item.resolveTask(value);
          this.#settle(false);
        },
        (error) => {
          item.rejectTask(error);
          this.#settle(true);
        },
      );
  }

  #settle(failed) {
    this.#running -= 1;
    if (failed) {
      this.#failed += 1;
    } else {
      this.#completed += 1;
    }
    this.#pump();
    this.#resolveIdleIfNeeded();
  }

  #pump() {
    while (this.#running < this.#concurrency && this.#queue.length > 0) {
      this.#start(this.#queue.shift());
    }
  }

  #resolveIdleIfNeeded() {
    if (!this.idle || !this.#resolveIdle) return;
    const resolve = this.#resolveIdle;
    this.#idlePromise = null;
    this.#resolveIdle = null;
    resolve(this.snapshot());
  }

  close() {
    this.#accepting = false;
    return this.snapshot();
  }

  discardQueued(reason = "queue discarded") {
    this.#accepting = false;
    const error = new Error(reason);
    error.name = "QueueCancelledError";
    let discarded = 0;
    while (this.#queue.length > 0) {
      const item = this.#queue.shift();
      item.rejectTask(error);
      discarded += 1;
    }
    this.#cancelled += discarded;
    this.#resolveIdleIfNeeded();
    return Object.freeze({ discarded, state: this.snapshot() });
  }

  waitForIdle() {
    if (this.idle) {
      return Promise.resolve(this.snapshot());
    }
    if (!this.#idlePromise) {
      this.#idlePromise = new Promise((resolve) => {
        this.#resolveIdle = resolve;
      });
    }
    return this.#idlePromise;
  }

  drain() {
    this.close();
    return this.waitForIdle();
  }

  get idle() {
    return this.#running === 0 && this.#queue.length === 0;
  }

  get accepting() {
    return this.#accepting;
  }

  snapshot() {
    return Object.freeze({
      accepting: this.#accepting,
      idle: this.idle,
      draining: !this.#accepting && !this.idle,
      running: this.#running,
      queued: this.#queue.length,
      concurrency: this.#concurrency,
      maxQueued: this.#maxQueued,
      capacity: this.#concurrency + this.#maxQueued,
      accepted: this.#accepted,
      completed: this.#completed,
      cancelled: this.#cancelled,
      failed: this.#failed,
      overloaded: this.#overloaded,
    });
  }
}
