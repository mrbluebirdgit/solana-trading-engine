import { appendFile, mkdir, open } from "node:fs/promises";
import path from "node:path";

function assertRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new TypeError("observation record must be an object");
  }
  if (record.runtimeAuthority !== false) {
    throw new TypeError("observation records must explicitly have runtimeAuthority false");
  }
}

export function createObservationLedger({
  filePath,
  appendFileImpl = appendFile,
  mkdirImpl = mkdir,
  openImpl = open,
} = {}) {
  if (typeof filePath !== "string" || filePath.trim() === "") {
    throw new TypeError("observation ledger filePath is required");
  }

  const resolved = path.resolve(filePath.trim());
  let tail = Promise.resolve();
  let initialized = false;

  function schedule(operation) {
    const pending = tail.catch(() => {}).then(operation);
    tail = pending.catch(() => {});
    return pending;
  }

  async function initialize() {
    if (initialized) return;
    await mkdirImpl(path.dirname(resolved), { recursive: true, mode: 0o700 });
    const handle = await openImpl(resolved, "a", 0o600);
    try {
      await handle.chmod(0o600);
    } finally {
      await handle.close();
    }
    initialized = true;
  }

  function ready() {
    return schedule(initialize);
  }

  function append(record) {
    assertRecord(record);
    const line = `${JSON.stringify(record)}\n`;
    return schedule(async () => {
      await initialize();
      await appendFileImpl(resolved, line, { encoding: "utf8", mode: 0o600 });
    });
  }

  return Object.freeze({
    filePath: resolved,
    ready,
    append,
    flush: () => tail,
  });
}
