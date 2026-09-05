#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const ignored = new Set([".git", "node_modules", "data"]);

function filesBelow(directory) {
  const found = [];
  for (const name of readdirSync(directory)) {
    if (ignored.has(name)) continue;
    const absolute = path.join(directory, name);
    if (statSync(absolute).isDirectory()) found.push(...filesBelow(absolute));
    else found.push(absolute);
  }
  return found;
}

const files = filesBelow(root);
const failures = [];

for (const file of files.filter((candidate) => candidate.endsWith(".mjs"))) {
  const checked = spawnSync(process.execPath, ["--check", file], {
    encoding: "utf8",
  });
  if (checked.status !== 0) {
    failures.push(`${path.relative(root, file)}: JavaScript syntax check failed`);
  }
}

for (const file of files.filter((candidate) => candidate.endsWith(".json"))) {
  try {
    JSON.parse(readFileSync(file, "utf8"));
  } catch {
    failures.push(`${path.relative(root, file)}: invalid JSON`);
  }
}

const linkPattern = /\[[^\]]*\]\(([^)]+)\)/g;
for (const file of files.filter((candidate) => candidate.endsWith(".md"))) {
  const text = readFileSync(file, "utf8");
  for (const match of text.matchAll(linkPattern)) {
    const target = match[1].trim().split("#", 1)[0];
    if (
      target === "" ||
      target.startsWith("#") ||
      /^[a-z][a-z0-9+.-]*:/i.test(target)
    ) {
      continue;
    }
    const resolved = path.resolve(path.dirname(file), target);
    if (!resolved.startsWith(`${root}${path.sep}`) || !existsSync(resolved)) {
      failures.push(
        `${path.relative(root, file)}: unresolved relative link ${match[1]}`,
      );
    }
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`[FAIL] ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `[PASS] syntax, JSON, and relative Markdown links (${files.length} files scanned)`,
  );
}
