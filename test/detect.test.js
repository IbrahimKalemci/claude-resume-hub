"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { detectLimit, parseClockTime, fmtDuration } = require("../lib/detect.js");

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

test("parseClockTime: past same-day time within 15m -> resume now-ish", () => {
  // Build a string with a time 5 minutes ago
  const past = new Date(Date.now() - 5 * 60 * 1000);
  let h = past.getHours(); const m = past.getMinutes();
  const ap = h >= 12 ? "pm" : "am"; let h12 = h % 12; if (h12 === 0) h12 = 12;
  const s = `resets ${h12}:${String(m).padStart(2, "0")}${ap}`;
  const t = parseClockTime(s);
  // should be ~now (not +1 day)
  assert.ok(Math.abs(t - new Date()) < 16 * 60 * 1000);
});

test("fmtDuration formats nicely", () => {
  assert.equal(fmtDuration(0), "0s");
  assert.equal(fmtDuration(65 * 1000), "1m 5s");
  assert.equal(fmtDuration(3661 * 1000), "1h 1m 1s");
});
