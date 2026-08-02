"use strict";

/**
 * ClaudeSwitch-style account vault (Windows).
 *
 * ⚠️ Unlike the rest of this tool, this DOES read and store your Claude OAuth
 * tokens — that is the whole point of instant, no-re-login account switching, and
 * it was an explicit, informed choice by the project owner. Tokens are stored
 * encrypted at rest with Windows DPAPI (CurrentUser scope: only your Windows
 * login can decrypt them, only on this machine). Nothing leaves the machine.
 *
 * Mechanism (identical to ClaudeSwitch):
 *   - Live account lives in ~/.claude/.credentials.json (claudeAiOauth = the
 *     tokens) and ~/.claude.json (userID + oauthAccount = identity).
 *   - "Save current" snapshots those into an encrypted per-account blob.
 *   - "Switch" writes a saved snapshot back into those two files — instant, the
 *     CLI and your IDE both pick it up (they read the same files).
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

function credPath() { return path.join(os.homedir(), ".claude", ".credentials.json"); }
function claudeJsonPath() { return path.join(os.homedir(), ".claude.json"); }

function readJson(p) { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } }

/** Atomic write (temp + rename) so a crash never leaves a half-written creds file. */
function writeJsonAtomic(p, obj) {
  const tmp = p + ".crh-tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, p);
}

// --- DPAPI encrypt/decrypt via PowerShell (zero npm deps) --------------------
// Uses temp files for I/O so we never hit command-line length/escaping limits.
function ps(script) {
  return execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8", windowsHide: true,
  });
}

function dpapiEncryptToFile(plaintext, outFile) {
  const inTmp = outFile + ".in";
  fs.writeFileSync(inTmp, plaintext, "utf8");
  try {
    ps(
      "Add-Type -AssemblyName System.Security;" +
      "$t=[IO.File]::ReadAllText('" + inTmp.replace(/'/g, "''") + "',[Text.Encoding]::UTF8);" +
      "$b=[Text.Encoding]::UTF8.GetBytes($t);" +
      "$e=[Security.Cryptography.ProtectedData]::Protect($b,$null,'CurrentUser');" +
      "[IO.File]::WriteAllText('" + outFile.replace(/'/g, "''") + "',[Convert]::ToBase64String($e))"
    );
  } finally { try { fs.unlinkSync(inTmp); } catch { /* ignore */ } }
}

function dpapiDecryptFromFile(inFile) {
  const out = ps(
    "Add-Type -AssemblyName System.Security;" +
    "$b64=[IO.File]::ReadAllText('" + inFile.replace(/'/g, "''") + "');" +
    "$e=[Convert]::FromBase64String($b64);" +
    "$d=[Security.Cryptography.ProtectedData]::Unprotect($e,$null,'CurrentUser');" +
    "[Console]::Out.Write([Text.Encoding]::UTF8.GetString($d))"
  );
  return out;
}

// --- live account read/write -------------------------------------------------

/** The account currently in the live files, or null if not signed in. */
function readLive() {
  const cred = readJson(credPath());
  const cj = readJson(claudeJsonPath());
  const oauth = cred && cred.claudeAiOauth;
  if (!oauth) return null;
  const acct = (cj && cj.oauthAccount) || {};
  return {
    email: acct.emailAddress || null,
    plan: oauth.subscriptionType || acct.seatTier || null,
    org: acct.organizationName || null,
    snapshot: { claudeAiOauth: oauth, userID: cj && cj.userID, oauthAccount: cj && cj.oauthAccount },
  };
}

/** Write a snapshot back into the live files — THE SWITCH. Preserves every other
 *  key in ~/.claude.json (it holds 50+ unrelated settings). Backs up once. */
function writeLive(snapshot) {
  // one-time backups so the user can always recover their original files
  for (const p of [credPath(), claudeJsonPath()]) {
    try { if (fs.existsSync(p) && !fs.existsSync(p + ".crh-bak")) fs.copyFileSync(p, p + ".crh-bak"); } catch { /* ignore */ }
  }
  const cred = readJson(credPath()) || {};
  cred.claudeAiOauth = snapshot.claudeAiOauth;
  writeJsonAtomic(credPath(), cred);

  const cj = readJson(claudeJsonPath()) || {};
  if (snapshot.userID !== undefined) cj.userID = snapshot.userID;
  if (snapshot.oauthAccount !== undefined) cj.oauthAccount = snapshot.oauthAccount;
  writeJsonAtomic(claudeJsonPath(), cj);
}

// --- vault (per-account encrypted snapshots) ---------------------------------

function idFor(email) { return (email || "account").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "account"; }
function metaFile(dir, id) { return path.join(dir, id + ".json"); }
function credFile(dir, id) { return path.join(dir, id + ".cred"); }

/** Snapshot the CURRENT live account into the encrypted vault. Returns its meta. */
function saveCurrent(dir) {
  const live = readLive();
  if (!live) return { ok: false, error: "not signed in — nothing to save" };
  fs.mkdirSync(dir, { recursive: true });
  const id = idFor(live.email);
  dpapiEncryptToFile(JSON.stringify(live.snapshot), credFile(dir, id));
  const meta = { id, email: live.email, plan: live.plan, org: live.org, savedAt: Date.now() };
  fs.writeFileSync(metaFile(dir, id), JSON.stringify(meta, null, 2));
  return { ok: true, id, meta };
}

/** All saved accounts (metadata only — no tokens), with the active one flagged. */
function list(dir) {
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")); } catch { return []; }
  const live = readLive();
  const activeEmail = live && live.email;
  return files.map((f) => {
    const m = readJson(path.join(dir, f)) || {};
    return { id: m.id || f.replace(/\.json$/, ""), email: m.email || null, plan: m.plan || null, org: m.org || null, savedAt: m.savedAt || 0, active: !!(activeEmail && m.email === activeEmail) };
  }).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
}

/** Instant switch: decrypt a saved account and write it into the live files. */
function switchTo(dir, id) {
  const cf = credFile(dir, id);
  if (!fs.existsSync(cf)) return { ok: false, error: "account not found" };
  let snap;
  try { snap = JSON.parse(dpapiDecryptFromFile(cf)); }
  catch (e) { return { ok: false, error: "could not decrypt (different Windows user or machine?)" }; }
  if (!snap || !snap.claudeAiOauth) return { ok: false, error: "corrupt snapshot" };
  try { writeLive(snap); } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
  return { ok: true };
}

function remove(dir, id) {
  try { fs.unlinkSync(credFile(dir, id)); } catch { /* ignore */ }
  try { fs.unlinkSync(metaFile(dir, id)); } catch { /* ignore */ }
  return { ok: true };
}

/** Is the DPAPI vault available on this OS? (Windows-only, like ClaudeSwitch.) */
function available() { return process.platform === "win32"; }

module.exports = { readLive, writeLive, saveCurrent, list, switchTo, remove, available, idFor };
