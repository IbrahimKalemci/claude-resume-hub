#!/usr/bin/env node
"use strict";

/**
 * Print the CHANGELOG.md section for a given version, e.g.:
 *   node scripts/release-notes.js 1.4.2
 * Used by CI to auto-fill GitHub Release notes — so nobody has to write them by hand.
 */

const fs = require("fs");

const version = (process.argv[2] || "").replace(/^v/, "");
const md = fs.readFileSync("CHANGELOG.md", "utf8").split(/\r?\n/);

const out = [];
let inSection = false;
for (const line of md) {
  const isVersionHeader = /^##\s+\[/.test(line);
  if (isVersionHeader) {
    if (inSection) break; // hit the next version — stop
    if (line.includes(`[${version}]`)) { inSection = true; continue; } // skip the header itself
  } else if (inSection) {
    out.push(line);
  }
}

const body = out.join("\n").trim();
process.stdout.write(body || `Release ${version}`);
