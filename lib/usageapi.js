"use strict";

/**
 * Live plan-usage for an account, from Claude's own OAuth usage endpoint — the
 * same one Claude Code's `/usage` command reads. Given an account's access token
 * it returns the 5-hour and 7-day utilization percentages and their reset times,
 * which is what the account cards show (ClaudeSwitch-style).
 *
 * This is a network call to api.anthropic.com with the user's OWN token to read
 * the user's OWN usage — nothing is sent anywhere else. Zero npm deps.
 */

const https = require("https");

function getUsage(accessToken, timeoutMs) {
  return new Promise((resolve) => {
    if (!accessToken) return resolve({ ok: false, error: "no token" });
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };
    const req = https.request(
      {
        hostname: "api.anthropic.com",
        path: "/api/oauth/usage",
        method: "GET",
        headers: {
          Authorization: "Bearer " + accessToken,
          "Content-Type": "application/json",
          "anthropic-beta": "oauth-2025-04-20",
          "User-Agent": "claude-resume-hub",
        },
      },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => {
          if (res.statusCode === 401 || res.statusCode === 403) return done({ ok: false, expired: true, status: res.statusCode });
          if (res.statusCode !== 200) return done({ ok: false, status: res.statusCode });
          try {
            const j = JSON.parse(d);
            const pick = (o) => o ? { pct: Math.round(Number(o.utilization) || 0), resetsAt: typeof o.resets_at === "string" ? o.resets_at : null } : null;
            done({ ok: true, fiveHour: pick(j.five_hour), sevenDay: pick(j.seven_day) });
          } catch (e) { done({ ok: false, error: "parse" }); }
        });
      }
    );
    req.on("error", (e) => done({ ok: false, error: String(e && e.message || e) }));
    req.setTimeout(timeoutMs || 12000, () => { req.destroy(); done({ ok: false, error: "timeout" }); });
    req.end();
  });
}

module.exports = { getUsage };
