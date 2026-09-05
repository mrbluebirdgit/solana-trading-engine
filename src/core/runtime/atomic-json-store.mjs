import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createAtomicJsonStore({
  filePath,
  defaultValue,
  mkdirImpl = mkdir,
  readFileImpl = readFile,
  renameImpl = rename,
  writeFileImpl = writeFile,
} = {}) {
  if (typeof filePath !== "string" || filePath.trim() === "") {
    throw new TypeError("atomic JSON store filePath is required");
  }
  if (defaultValue === undefined) {
    throw new TypeError("atomic JSON store defaultValue is required");
  }

  const resolved = path.resolve(filePath.trim());
  let tail = Promise.resolve();

  function schedule(operation) {
    const pending = tail.catch(() => {}).then(operation);
    tail = pending.catch(() => {});
    return pending;
  }

  async function load() {
    try {
      const text = await readFileImpl(resolved, "utf8");
      return JSON.parse(text);
    } catch (error) {
      if (error?.code === "ENOENT") return clone(defaultValue);
      if (error instanceof SyntaxError) {
        throw new Error(`state file contains invalid JSON: ${path.basename(resolved)}`);
      }
      throw error;
    }
  }

  async function saveNow(value) {
    const directory = path.dirname(resolved);
    await mkdirImpl(directory, { recursive: true, mode: 0o700 });
    const temporary = `${resolved}.${process.pid}.tmp`;
    await writeFileImpl(temporary, `${JSON.stringify(value)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await renameImpl(temporary, resolved);
  }

  return Object.freeze({
    filePath: resolved,
    load: () => schedule(load),
    save: (value) => schedule(() => saveNow(value)),
    flush: () => tail,
  });
}
