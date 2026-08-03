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
function login(configDir, opts) {
  opts = opts || {};
  try {
    // opts.browser: a launcher claude should use instead of the default browser
    // (Claude Code honours the BROWSER env var). We point it at a private/incognito
    // window so the sign-in page can't reuse the cookies of the account you're
    // already logged into — forcing the "which account?" picker (add-account).
    const env = Object.assign({}, process.env);
    if (configDir) env.CLAUDE_CONFIG_DIR = configDir;
    if (opts.browser) env.BROWSER = opts.browser;
    if (process.platform === "win32") {
      // A visible console so the user can paste the code the callback page shows.
      spawn("cmd", ["/c", "start", "", "cmd", "/k", "claude auth login"], { detached: true, env }).unref();
    } else {
      spawn("claude auth login", { shell: true, detached: true, stdio: "ignore", env }).unref();
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}

/**
 * Token-free "switch account" for the DEFAULT (~/.claude) config — the one the
 * CLI *and* your IDE (Antigravity / Cursor / VS Code) all read, so this changes
 * the account everywhere at once (the ClaudeSwitch-style scope). It runs
 * `claude auth logout` then `claude auth login` in a single visible console, so
 * you finish sign-in in the browser and pick the other account. Claude owns the
 * entire token exchange — we store nothing and never read the credentials.
 *
 * (It is NOT the instant, no-prompt switch a credential vault gives, because that
 * requires storing your tokens — which this tool refuses to do. One browser
 * confirm per switch is the honest, token-free price.)
 */
function switchDefault() {
  try {
    if (process.platform === "win32") {
      // `&` (not `&&`) so login still runs even if logout reports "not logged in".
      spawn("cmd", ["/c", "start", "", "cmd", "/k", "claude auth logout & claude auth login"], { detached: true }).unref();
    } else {
      spawn("claude auth logout ; claude auth login", { shell: true, detached: true, stdio: "ignore" }).unref();
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}

module.exports = { status, login, logout, switchDefault };
