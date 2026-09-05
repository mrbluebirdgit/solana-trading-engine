import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export async function loadWatcherState(path) {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    return {
      lastBlock: Number(parsed.lastBlock ?? 0),
      candidates: parsed.candidates && typeof parsed.candidates === "object" ? parsed.candidates : {},
    };
  } catch (error) {
    if (error?.code === "ENOENT") return { lastBlock: 0, candidates: {} };
    throw error;
  }
}

export async function saveWatcherState(path, state) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state)}\n`, { mode: 0o600 });
  await rename(temporary, path);
}

