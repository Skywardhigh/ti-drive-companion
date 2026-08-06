#!/usr/bin/env node
/**
 * Force LF on the files this fork touches.
 *
 * Upstream is entirely LF. Any tool that rewrites a whole file on Windows - a Python
 * `open(...).write()`, a PowerShell redirect - will save it as CRLF, which turns a
 * 200-line addition into a 500-line rewrite in `git diff` and would then conflict on
 * every line the next time upstream changes. Run this before staging.
 *
 *     node scripts/normalise-eol.mjs
 *
 * Note: `grep -c $'\r'` is NOT a valid check here. Git Bash drops the CR while passing
 * the argument through, leaving an empty pattern that matches every line and reports a
 * fully-CRLF file. Count bytes instead, which is what this script does.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const FILES = [
  "app/ShipExplorer.tsx",
  "app/ships/page.tsx",
  "app/layout.tsx",
  "app/globals.css",
  "scripts/sync-data.mjs",
  "scripts/normalise-eol.mjs",
];

let changed = 0;
for (const rel of FILES) {
  const path = join(root, rel);
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (err) {
    console.log(`skip ${rel} (${err.code})`);
    continue;
  }
  if (!text.includes("\r\n")) {
    console.log(`ok   ${rel}`);
    continue;
  }
  writeFileSync(path, text.replace(/\r\n/g, "\n"), "utf8");
  console.log(`LF   ${rel}`);
  changed += 1;
}

console.log(changed ? `\nnormalised ${changed} file(s)` : "\nall files already LF");
