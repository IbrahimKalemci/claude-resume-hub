"use strict";

/**
 * Zero-dependency update check: ask the public GitHub Releases API whether a
 * newer version exists. Read-only, no auth, no auto-install — the app just shows
 * a "download" banner. Never throws; resolves { available:false } on any problem.
 */

const https = require("https");

function cmp(a, b) {
  const pa = String(a).split("."), pb = String(b).split(".");
  for (let i = 0; i < 3; i++) {
    const x = parseInt(pa[i], 10) || 0, y = parseInt(pb[i], 10) || 0;
    if (x !== y) return x - y;
  }
  return 0;
}

function checkUpdate(current, repo) {
  return new Promise((resolve) => {
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };
    let settled = false;
    const req = https.get(
      `https://api.github.com/repos/${repo}/releases/latest`,
      { headers: { "User-Agent": "claude-resume-hub", Accept: "application/vnd.github+json" } },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => {
          try {
            const j = JSON.parse(d);
            const latest = (j.tag_name || "").replace(/^v/, "");
            if (!latest) return done({ available: false });
            done({ available: cmp(latest, current) > 0, latest, current, url: j.html_url });
          } catch { done({ available: false }); }
        });
      }
    );
    req.on("error", () => done({ available: false }));
    req.setTimeout(6000, () => { req.destroy(); done({ available: false }); });
  });
}

module.exports = { checkUpdate, cmp };
