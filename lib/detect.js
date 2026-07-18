"use strict";

/**
 * Usage-limit detection for Claude Code output.
 *
 * Detection priority:
 *   1. Machine-readable marker "Claude AI usage limit reached|<unix_ts>"
 *      -> exact, timezone-proof reset time.
 *   2. Human prose "…resets 3:45pm" / "reset at 2pm" / "resets Mon 12:00am".
 *   3. A limit phrase with no time -> caller falls back to polling.
 */

/** Inspect combined stdout+stderr. Returns { hit, resetAt: Date|null, source }. */
function detectLimit(text) {
  if (!text) return { hit: false };

  // 1) Machine-readable marker (seconds or milliseconds epoch).
  const marker = text.match(/Claude AI usage limit reached\s*\|\s*(\d{10,13})/i);
  if (marker) {
    let n = parseInt(marker[1], 10);
    if (n < 1e12) n *= 1000; // seconds -> ms
    return { hit: true, resetAt: new Date(n), source: "epoch marker" };
  }

  // 2) Prose limit phrase, optionally with a clock time.
  if (/hit your.*limit|usage limit reached|reached your.*limit|limit .*(reset|reached)/i.test(text)) {
    const t = parseClockTime(text);
    return { hit: true, resetAt: t, source: t ? "prose time" : "prose (no time)" };
  }

  return { hit: false };
}

/**
 * Parse a human reset time such as "resets 3:45pm", "reset at 2pm",
 * "resets Mon 12:00am". Best-effort fallback; the epoch marker is authoritative.
 * Returns a Date (local) or null.
 */
function parseClockTime(text, now = new Date()) {
  const m = text.match(
    /reset(?:s|\s+at)?\s+(?:(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i
  );
  if (!m) return null;

  const day = m[1];
  let h = parseInt(m[2], 10);
  const min = m[3] ? parseInt(m[3], 10) : 0;
  const ap = m[4].toLowerCase();
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;

  const target = new Date(now);
  target.setHours(h, min, 0, 0);

  if (day) {
    const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const want = map[day.slice(0, 3)];
    while (target.getDay() !== want || target <= now) {
      target.setDate(target.getDate() + 1);
    }
  } else if (target <= now) {
    // Session windows are only a few hours long, never a full day.
    if (now - target <= 15 * 60 * 1000) return now; // just reset -> resume now
    target.setDate(target.getDate() + 1); // else it's a past-midnight time (tomorrow)
  }
  return target;
}

function fmtDuration(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return [h ? `${h}h` : "", m ? `${m}m` : "", `${sec}s`].filter(Boolean).join(" ") || "0s";
}

module.exports = { detectLimit, parseClockTime, fmtDuration };
