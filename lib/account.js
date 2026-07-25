"use strict";

/**
 * Token-free account helpers. We NEVER read or write Claude's credentials
 * (~/.claude/.credentials.json / keychain). We only invoke Claude Code's own
 * `claude auth …` commands — Claude owns the tokens — and read the non-secret
 * `claude auth status` (which reports the account email, not the token).
 */

const { spawn } = require("child_process");
const { claudeEnv } = require("./engine");

function run(args, configDir) {
  return new Promise((resolve) => {
    const cmd = ["claude", ...args].join(" ");
    const child = spawn(cmd, { shell: true, windowsHide: true, env: claudeEnv(configDir) });
    let out = "", err = "";
    if (child.stdout) child.stdout.on("data", (d) => (out += d));
    if (child.stderr) child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => resolve({ code: -1, out, err: String(e && e.message || e) }));
    child.on("close", (code) => resolve({ code, out, err }));
  });
}

/**
 * { loggedIn, email, plan } — from `claude auth status` (JSON, no secrets).
 * With a `configDir` it reports THAT account's status (multi-account), else the
 * default (~/.claude) account.
 */
async function status(configDir) {
  const r = await run(["auth", "status"], configDir);
  try {
    const j = JSON.parse((r.out || "").trim());
    return { loggedIn: !!j.loggedIn, email: j.email || null, plan: j.subscriptionType || null };
  } catch {
    return { loggedIn: false, email: null, plan: null };
  }
}

/** Sign out of an account (non-interactive). */
function logout(configDir) { return run(["auth", "logout"], configDir); }

/**
 * Start Claude's own interactive sign-in (browser OAuth). We just launch it —
 * the token exchange happens inside Claude Code, never through us. On Windows we
 * open a visible console so the user sees the URL / success message. A
 * `configDir` signs a SEPARATE account into that dir (multi-account setup).
 */
function login(configDir) {
  try {
    if (process.platform === "win32") {
      const prefix = configDir ? `set CLAUDE_CONFIG_DIR=${configDir}&& ` : "";
      spawn("cmd", ["/c", "start", "", "cmd", "/k", `${prefix}claude auth login`], { detached: true }).unref();
    } else {
      spawn("claude auth login", { shell: true, detached: true, stdio: "ignore", env: claudeEnv(configDir) }).unref();
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}

module.exports = { status, login, logout };
