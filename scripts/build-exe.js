#!/usr/bin/env node
"use strict";

/**
 * Build a standalone claude-resume-hub executable via Node's Single Executable
 * Applications (SEA). Cross-platform: run `npm run build:exe` on the OS you want
 * a binary for (SEA does not reliably cross-compile — CI builds one per OS).
 *
 * Steps: bundle (esbuild) -> sea blob -> copy the node binary -> inject blob.
 * The resulting exe embeds Node + this CLI; it still needs the `claude` CLI on
 * PATH at runtime (it wraps Claude Code, it doesn't contain it).
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const isWin = process.platform === "win32";
const isMac = process.platform === "darwin";
const exeName = isWin ? "claude-resume-hub.exe" : "claude-resume-hub";
const out = path.join("dist", exeName);
const FUSE = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2";

function run(cmd, opts = {}) {
  console.log("> " + cmd);
  execSync(cmd, { stdio: "inherit", ...opts });
}

fs.mkdirSync("dist", { recursive: true });

// 1) Bundle bin/cli.js + lib/*.js + package.json into ONE self-contained CJS file
//    (SEA's injected main may only require() builtins, so we inline everything).
run("npx esbuild bin/cli.js --bundle --platform=node --target=node20 --format=cjs --outfile=dist/bundle.cjs");

// 2) Generate the SEA preparation blob.
run("node --experimental-sea-config sea-config.json");

// 3) Copy the running node binary to become our executable.
fs.copyFileSync(process.execPath, out);
console.log("copied node -> " + out);

// 4) On Windows, best-effort remove Node's Authenticode signature so injection
//    doesn't leave a broken signature (needs Windows SDK signtool; skip if absent).
if (isWin) {
  try { execSync(`signtool remove /s "${out}"`, { stdio: "ignore" }); console.log("removed existing signature"); }
  catch { console.log("signtool not available — continuing (unsigned build)"); }
}

// 5) Inject the blob into the copied binary.
let inject = `npx postject "${out}" NODE_SEA_BLOB dist/sea-prep.blob --sentinel-fuse ${FUSE}`;
if (isMac) inject += " --macho-segment-name NODE_SEA";
run(inject);

console.log("\n✔ Built " + out);
console.log("  Note: this exe wraps Claude Code — the `claude` CLI must be on PATH to use it.");
