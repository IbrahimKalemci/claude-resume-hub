"use strict";
const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const { detectLimit, detectAuthError, parseClockTime, fmtDuration } = require("../lib/detect.js");
const { buildClaudeArgs } = require("../lib/engine.js");
const { encodeDir, listSessions, lastAssistantText, pickActiveSession } = require("../lib/sessions.js");
const { PS_SCRIPT, startTray } = require("../lib/tray.js");
const statsLib = require("../lib/stats.js");
const os = require("node:os");
const fs = require("node:fs");

test("epoch marker in seconds -> exact reset time", () => {
  const r = detectLimit("Claude AI usage limit reached|1759770000");
  assert.equal(r.hit, true);
  assert.equal(r.source, "epoch marker");
  assert.equal(r.resetAt.getTime(), 1759770000 * 1000);
});

test("epoch marker in milliseconds", () => {
  const r = detectLimit("blah\nClaude AI usage limit reached|1759770000000\nblah");
  assert.equal(r.hit, true);
  assert.equal(r.resetAt.getTime(), 1759770000000);
});

test("epoch marker with spaces around pipe", () => {
  const r = detectLimit("Claude AI usage limit reached | 1759770000");
  assert.equal(r.hit, true);
  assert.equal(r.resetAt.getTime(), 1759770000 * 1000);
});

test("prose 'resets 3:45pm' -> a future Date", () => {
  const r = detectLimit("You've hit your session limit · resets 3:45pm");
  assert.equal(r.hit, true);
  assert.equal(r.source, "prose time");
  assert.ok(r.resetAt instanceof Date);
});

test("prose 'reset at 2pm (America/New_York)'", () => {
  const r = detectLimit("Claude usage limit reached. Your limit will reset at 2pm (America/New_York)");
  assert.equal(r.hit, true);
  assert.ok(r.resetAt instanceof Date);
});

test("weekly 'resets Mon 12:00am'", () => {
  const r = detectLimit("You've hit your weekly limit · resets Mon 12:00am");
  assert.equal(r.hit, true);
  assert.equal(r.resetAt.getDay(), 1); // Monday
});

test("limit phrase without a time -> hit but no resetAt", () => {
  const r = detectLimit("You've hit your session limit");
  assert.equal(r.hit, true);
  assert.equal(r.resetAt, null);
});

test("normal successful output -> not a limit", () => {
  const r = detectLimit("Done. All 12 tests passed. Committed the change.");
  assert.equal(r.hit, false);
});

test("detectAuthError catches an auth failure (even alongside 'continue')", () => {
  assert.ok(detectAuthError("Authentication failed. Sign in again to continue."));
  assert.ok(detectAuthError("Invalid API key. Please sign in."));
  assert.ok(detectAuthError("Error: not logged in"));
});

test("detectAuthError doesn't flag a normal answer that just mentions login", () => {
  assert.equal(detectAuthError("I added a /login route and a claude login example to the docs."), null);
});

test("detectAuthError ignores normal + limit output", () => {
  assert.equal(detectAuthError("Done. All tests passed."), null);
  assert.equal(detectAuthError("Claude AI usage limit reached|1784376612"), null);
});

test("parseClockTime: a reset time just barely past -> resume now (deterministic clock)", () => {
  const now = new Date("2026-07-18T15:00:00"); // 3:00pm local
  const t = parseClockTime("resets 2:57pm", now); // 3 min ago, within 15m window
  assert.equal(t.getTime(), now.getTime());
});

test("parseClockTime: a future time today is kept as-is", () => {
  const now = new Date("2026-07-18T15:00:00");
  const t = parseClockTime("resets 5:30pm", now); // 17:30 today
  assert.equal(t.getHours(), 17);
  assert.equal(t.getMinutes(), 30);
  assert.equal(t.getDate(), 18);
});

test("parseClockTime: a time well in the past rolls to tomorrow", () => {
  const now = new Date("2026-07-18T15:00:00");
  const t = parseClockTime("resets 9:00am", now); // 6h ago -> tomorrow 9am
  assert.equal(t.getDate(), 19);
  assert.equal(t.getHours(), 9);
});

test("fmtDuration formats nicely", () => {
  assert.equal(fmtDuration(0), "0s");
  assert.equal(fmtDuration(65 * 1000), "1m 5s");
  assert.equal(fmtDuration(3661 * 1000), "1h 1m 1s");
});

test("buildClaudeArgs: default continues most recent session", () => {
  assert.deepEqual(buildClaudeArgs({ prompt: "continue", passthrough: [] }, 2), ["-c", "-p", "continue"]);
});

test("buildClaudeArgs: first cycle with a task starts fresh", () => {
  assert.deepEqual(buildClaudeArgs({ task: "do the thing", prompt: "continue", passthrough: [] }, 1), ["-p", "do the thing"]);
});

test("buildClaudeArgs: --session resumes a specific id", () => {
  assert.deepEqual(
    buildClaudeArgs({ session: "abc123", prompt: "continue", passthrough: [] }, 2),
    ["--resume", "abc123", "-p", "continue"]
  );
});

test("buildClaudeArgs: --unattended appends --dangerously-skip-permissions", () => {
  assert.deepEqual(
    buildClaudeArgs({ session: "abc", prompt: "continue", unattended: true, passthrough: [] }, 2),
    ["--resume", "abc", "-p", "continue", "--dangerously-skip-permissions"]
  );
  // off by default
  assert.deepEqual(buildClaudeArgs({ prompt: "continue", passthrough: [] }, 2), ["-c", "-p", "continue"]);
});

test("buildClaudeArgs: passthrough args are forwarded", () => {
  assert.deepEqual(
    buildClaudeArgs({ prompt: "continue", passthrough: ["--model", "opus"] }, 2),
    ["-c", "-p", "continue", "--model", "opus"]
  );
});

test("encodeDir strips path separators", () => {
  const enc = encodeDir(process.cwd());
  assert.ok(!/[/\\:]/.test(enc), `expected no separators, got: ${enc}`);
});

test("listSessions returns [] for an unknown project", () => {
  assert.deepEqual(listSessions(path.join("/", "no", "such", "project", "xyz123")), []);
});

test("lastAssistantText picks the final assistant text message", () => {
  const lines = [
    JSON.stringify({ type: "user", message: { role: "user", content: "hi" } }),
    JSON.stringify({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "first reply" }] } }),
    JSON.stringify({ type: "user", message: { role: "user", content: "more" } }),
    JSON.stringify({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "the last step I did" }] } }),
  ];
  assert.equal(lastAssistantText(lines), "the last step I did");
});

test("lastAssistantText returns '' when there is no assistant text", () => {
  const lines = [JSON.stringify({ type: "user", message: { role: "user", content: "hi" } })];
  assert.equal(lastAssistantText(lines), "");
});

test("pickActiveSession is consistent with listSessions()[0]", () => {
  const dir = process.cwd();
  const expected = listSessions(dir)[0] || null;
  assert.deepEqual(pickActiveSession(dir), expected);
});

test("pickActiveSession returns null for an unknown project", () => {
  assert.equal(pickActiveSession(path.join("/", "no", "such", "project", "zzz")), null);
});

test("stats: record accumulates resumes and total wait time", () => {
  const f = path.join(os.tmpdir(), "crh-stats-" + process.pid + ".json");
  try { fs.rmSync(f, { force: true }); } catch {}
  statsLib.record(f, "proj-a", 60000, 1);
  const s = statsLib.record(f, "proj-b", 30000, 2);
  assert.equal(s.resumes, 2);
  assert.equal(s.waitMs, 90000);
  assert.equal(statsLib.load(f).history.length, 2);
  try { fs.rmSync(f, { force: true }); } catch {}
});

test("tray PS_SCRIPT is a NotifyIcon shim; startTray is a no-op off Windows", () => {
  assert.ok(PS_SCRIPT.includes("NotifyIcon"));
  assert.ok(PS_SCRIPT.includes("/status") || PS_SCRIPT.includes('"/status"') || PS_SCRIPT.includes("+ \"/status\""));
  if (process.platform !== "win32") {
    assert.equal(startTray("http://127.0.0.1:1").ok, false);
  }
});
