"use strict";

/**
 * Claude OAuth token refresh — the same exchange Claude Code does internally, and
 * the same endpoint ClaudeSwitch uses to keep stored accounts alive. Given an
 * account's refresh token it returns a FRESH access token + a NEW refresh token.
 *
 * ⚠️ Refresh tokens are ONE-TIME USE: each refresh rotates the refresh token and
 * invalidates the old one. So the caller MUST persist the returned refreshToken —
 * dropping it strands the account (next refresh 400s "invalid_grant"). This is
 * exactly why a set-once vault goes stale: only by refreshing AND saving the
 * rotated token do stored accounts stay switchable.
 */

const https = require("https");

// The Claude Code OAuth client id (public; from the sign-in URL's client_id).
const CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";

function refresh(refreshToken, timeoutMs) {
  return new Promise((resolve) => {
    if (!refreshToken) return resolve({ ok: false, error: "no refresh token" });
    const payload = JSON.stringify({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: CLIENT_ID });
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };
    const req = https.request(
      { hostname: "console.anthropic.com", path: "/v1/oauth/token", method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload), "User-Agent": "claude-resume-hub" } },
      (res) => {
        let d = "";
        res.on("data", (x) => (d += x));
        res.on("end", () => {
          if (res.statusCode === 400 || res.statusCode === 401) return done({ ok: false, invalid: true, status: res.statusCode });
          if (res.statusCode !== 200) return done({ ok: false, status: res.statusCode });
          let j; try { j = JSON.parse(d); } catch { return done({ ok: false, error: "parse" }); }
          const now = Date.now();
          done({
            ok: true,
            oauth: {
              accessToken: j.access_token,
              refreshToken: j.refresh_token,
              expiresAt: now + (Number(j.expires_in) || 0) * 1000,
              refreshTokenExpiresAt: now + (Number(j.refresh_token_expires_in) || 0) * 1000,
              scopes: j.scope ? String(j.scope).split(" ") : undefined,
              subscriptionType: (j.account && (j.account.subscription_type || j.account.subscriptionType)) || undefined,
            },
            email: (j.account && (j.account.email_address || j.account.email)) || null,
            org: (j.organization && (j.organization.name || j.organization.organization_name)) || null,
          });
        });
      }
    );
    req.on("error", (e) => done({ ok: false, error: String(e && e.message || e) }));
    req.setTimeout(timeoutMs || 12000, () => { req.destroy(); done({ ok: false, error: "timeout" }); });
    req.write(payload);
    req.end();
  });
}

module.exports = { refresh, CLIENT_ID };
