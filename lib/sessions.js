"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const { detectLimit } = require("./detect");

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
    // Count real human prompts (a "user" line that isn't a tool_result echo),
    // not every message line — otherwise tool traffic inflates the number.
    const turns = lines.reduce(
      (n, l) => n + (/"type":"user"/.test(l) && !/"tool_result"/.test(l) ? 1 : 0),
      0
    );
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

/** Last non-empty assistant text in a transcript — used as a resume recap. */
function lastAssistantText(lines) {
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const o = JSON.parse(lines[i]);
      if (o.type === "assistant" && o.message) {
        let c = o.message.content;
        if (Array.isArray(c)) c = c.filter((x) => x && x.type === "text").map((x) => x.text).join(" ");
        if (typeof c === "string" && c.trim()) return c.trim().replace(/\s+/g, " ");
      }
    } catch { /* ignore malformed lines */ }
  }
  return "";
}

/**
 * The full path of the newest transcript in `dir` (by mtime), or null.
 * If `id` is given, returns that specific session's transcript path instead.
 */
function newestTranscript(dir, id) {
  const folder = findProjectFolder(dir);
  if (!folder) return null;
  if (id) {
    const p = path.join(folder, `${id}.jsonl`);
    return fs.existsSync(p) ? p : null;
  }
  let files = [];
  try { files = fs.readdirSync(folder).filter((f) => f.endsWith(".jsonl")); } catch { return null; }
  let newest = null, newestM = -1;
  for (const f of files) {
    try {
      const m = fs.statSync(path.join(folder, f)).mtimeMs;
      if (m > newestM) { newestM = m; newest = path.join(folder, f); }
    } catch { /* skip */ }
  }
  return newest;
}

/**
 * Recap of the most-recent session in `dir`: the last thing the assistant said.
 * Used by --smart to build a context-aware resume prompt. Returns "" if none.
 */
function sessionRecap(dir) {
  const file = newestTranscript(dir);
  if (!file) return "";
  try {
    const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
    return lastAssistantText(lines);
  } catch { return ""; }
}

/**
 * How long ago (ms) a session's transcript was last written, or Infinity if
 * unknown. Used by the "active-session guard": if a session was touched seconds
 * ago and we're not the ones writing it, it's probably open in another window —
 * resuming it would make two clients fight over the same conversation and hang.
 */
function sessionIdleMs(dir, id) {
  const file = newestTranscript(dir, id);
  if (!file) return Infinity;
  try { return Date.now() - fs.statSync(file).mtimeMs; }
  catch { return Infinity; }
}

/**
 * Detect whether the newest session in `dir` ENDED on a usage-limit error, by
 * reading the transcript only — NO `claude` call, no quota spent, no tokens read.
 * This is how "watch mode" spots a limit the user hit in their own Claude window.
 *
 * Keyed strictly on Claude Code's structured error fields (`error:"rate_limit"` /
 * `apiErrorStatus:429`) on the LAST assistant entry — never on prose — so a
 * conversation that merely *mentions* usage limits can't false-positive. The
 * reset time is parsed from that same entry's text. Returns { limited, resetAt }.
 */
function limitFromTranscript(dir, id) {
  const file = newestTranscript(dir, id);
  if (!file) return { limited: false };
  let lines = [];
  try { lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean); } catch { return { limited: false }; }

  // Walk backwards to the most recent real turn (user or assistant message).
  for (let i = lines.length - 1; i >= 0; i--) {
    let o;
    try { o = JSON.parse(lines[i]); } catch { continue; }
    if (!o || (o.type !== "assistant" && o.type !== "user")) continue;

    const isLimit = o.error === "rate_limit" || (o.isApiErrorMessage && o.apiErrorStatus === 429);
    if (!isLimit) return { limited: false }; // newest turn is normal -> not currently limited

    let text = "";
    const c = o.message && o.message.content;
    if (Array.isArray(c)) text = c.map((x) => (x && x.text) || "").join(" ");
    else if (typeof c === "string") text = c;
    const l = detectLimit(text);
    return { limited: true, resetAt: l.resetAt || null };
  }
  return { limited: false };
}

/**
 * Build a context-aware "smart" resume prompt from a session recap (the last
 * thing the assistant said). Shared by the CLI and the desktop app so both
 * behave identically. Returns "" if there's no recap to work with.
 */
function smartPrompt(recap) {
  if (!recap) return "";
  return (
    `Continue where you left off and finish the task you were working on. ` +
    `If it is already complete, say so instead of inventing new work. ` +
    `For context, your last message was: "${recap.slice(0, 300)}${recap.length > 300 ? "…" : ""}"`
  );
}

/**
 * The session to resume by default in `dir`: the most recently active one.
 * Returned object is the same shape as listSessions() entries, or null.
 * The engine PINS this id so later cycles don't race "most recent" (which can
 * change if the tool's own run, or a second terminal, touches another session).
 */
function pickActiveSession(dir) {
  const all = listSessions(dir);
  return all.length ? all[0] : null;
}

/**
 * The real working directory of the most recently active session across ALL
 * projects, read from the transcript's own `cwd` field (the folder name itself
 * is lossy, so we don't try to decode it). Used by the desktop app to open on
 * the project you were last working in. Returns null if nothing is found.
 */
function lastActiveProjectDir() {
  const root = projectsRoot();
  if (!fs.existsSync(root)) return null;

  let newest = null, newestM = -1;
  let folders = [];
  try { folders = fs.readdirSync(root); } catch { return null; }
  for (const folder of folders) {
    const dir = path.join(root, folder);
    let files = [];
    try { files = fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl")); } catch { continue; }
    for (const f of files) {
      try {
        const m = fs.statSync(path.join(dir, f)).mtimeMs;
        if (m > newestM) { newestM = m; newest = path.join(dir, f); }
      } catch { /* skip */ }
    }
  }
  if (!newest) return null;

  try {
    const lines = fs.readFileSync(newest, "utf8").split("\n");
    for (const l of lines) {
      if (!l) continue;
      try {
        const o = JSON.parse(l);
        if (o && typeof o.cwd === "string" && o.cwd) return o.cwd;
      } catch { /* ignore malformed lines */ }
    }
  } catch { /* unreadable */ }
  return null;
}

module.exports = {
  projectsRoot, encodeDir, findProjectFolder, listSessions,
  lastAssistantText, sessionRecap, smartPrompt, pickActiveSession, lastActiveProjectDir,
  newestTranscript, sessionIdleMs, limitFromTranscript,
};
