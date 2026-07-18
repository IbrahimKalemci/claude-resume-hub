"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");

/** Root where Claude Code stores per-project session transcripts. */
function projectsRoot() {
  return path.join(os.homedir(), ".claude", "projects");
}

/**
 * Encode an absolute directory the way Claude Code names its project folders:
 * the path with `:`, `/` and `\` all replaced by `-`.
 * e.g. C:\Users\me\proj -> C--Users-me-proj
 */
function encodeDir(dir) {
  return path.resolve(dir).replace(/[/\\:]/g, "-");
}

/** Locate the project folder for `dir` (exact, then case-insensitive). */
function findProjectFolder(dir) {
  const root = projectsRoot();
  if (!fs.existsSync(root)) return null;
  const want = encodeDir(dir);
  let entries = [];
  try { entries = fs.readdirSync(root); } catch { return null; }
  if (entries.includes(want)) return path.join(root, want);
  const ci = entries.find((e) => e.toLowerCase() === want.toLowerCase());
  return ci ? path.join(root, ci) : null;
}

/** First non-empty user message in a transcript — used as a preview. */
function firstUserMessage(lines) {
  for (const l of lines) {
    try {
      const o = JSON.parse(l);
      if (o.type === "user" && o.message) {
        let c = o.message.content;
        if (Array.isArray(c)) c = c.map((x) => (x && x.text) || "").join(" ");
        if (typeof c === "string" && c.trim()) return c.trim().replace(/\s+/g, " ");
      }
    } catch { /* ignore malformed lines */ }
  }
  return "";
}

/**
 * List Claude Code sessions for a project directory, newest first.
 * Returns [{ id, mtime, sizeKB, turns, preview }].
 */
function listSessions(dir) {
  const folder = findProjectFolder(dir);
  if (!folder) return [];
  let files = [];
  try { files = fs.readdirSync(folder).filter((f) => f.endsWith(".jsonl")); } catch { return []; }

  const out = files.map((f) => {
    const full = path.join(folder, f);
    let st, lines = [];
    try {
      st = fs.statSync(full);
      lines = fs.readFileSync(full, "utf8").split("\n").filter(Boolean);
    } catch {
      st = { mtime: new Date(0), size: 0 };
    }
    const turns = lines.reduce((n, l) => n + (/"type":"(user|assistant)"/.test(l) ? 1 : 0), 0);
    return {
      id: f.replace(/\.jsonl$/, ""),
      mtime: st.mtime,
      sizeKB: Math.round((st.size || 0) / 1024),
      turns,
      preview: firstUserMessage(lines).slice(0, 80),
    };
  });

  out.sort((a, b) => b.mtime - a.mtime); // newest first
  return out;
}

module.exports = { projectsRoot, encodeDir, findProjectFolder, listSessions };
