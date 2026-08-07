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
const oauth = require("./oauth");

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

/**
 * Find the [start,end) character span of a top-level member's VALUE in JSON text,
 * WITHOUT parsing the file (à la ClaudeSwitch's "JsonSurgeon"). Walks the value —
 * string, object/array (brace/bracket-balanced, string-aware), or primitive —
 * and returns its exact byte span, or null if the key isn't found.
 */
function memberValueSpan(text, key) {
  const re = new RegExp('"' + key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '"\\s*:\\s*');
  const m = re.exec(text);
  if (!m) return null;
  let i = m.index + m[0].length;
  const start = i, c = text[i];
  if (c === '"') {
    i++;
    while (i < text.length) { if (text[i] === "\\") { i += 2; continue; } if (text[i] === '"') { i++; break; } i++; }
    return [start, i];
  }
  if (c === "{" || c === "[") {
    const open = c, close = c === "{" ? "}" : "]";
    let depth = 0, inStr = false;
    while (i < text.length) {
      const ch = text[i];
      if (inStr) { if (ch === "\\") { i += 2; continue; } if (ch === '"') inStr = false; i++; continue; }
      if (ch === '"') { inStr = true; i++; continue; }
      if (ch === open) depth++;
      else if (ch === close) { depth--; if (depth === 0) { i++; break; } }
      i++;
    }
    return [start, i];
  }
  while (i < text.length && !/[,}\]\s]/.test(text[i])) i++;
  return [start, i];
}

/** Replace a top-level member's value in-place, touching no other byte. Returns
 *  the new text, or null if the member isn't present. */
function spliceMember(text, key, valueJson) {
  const span = memberValueSpan(text, key);
  if (!span) return null;
  return text.slice(0, span[0]) + valueJson + text.slice(span[1]);
}

/**
 * Write a snapshot back into the live files — THE SWITCH. `.credentials.json` is a
 * single key, so we rewrite it. `.claude.json` holds 50+ keys the IDE actively
 * uses, so we SPLICE only `userID` + `oauthAccount` and leave every other byte
 * untouched (ClaudeSwitch's approach) — a full reformat/rewrite races with the
 * IDE's own writes and makes it re-authenticate. Backs up once; verifies the
 * spliced JSON parses before writing, else falls back to a safe rewrite.
 */
function writeLive(snapshot) {
  for (const p of [credPath(), claudeJsonPath()]) {
    try { if (fs.existsSync(p) && !fs.existsSync(p + ".crh-bak")) fs.copyFileSync(p, p + ".crh-bak"); } catch { /* ignore */ }
  }
  const cred = readJson(credPath()) || {};
  cred.claudeAiOauth = snapshot.claudeAiOauth;
  writeJsonAtomic(credPath(), cred);

  const cjPath = claudeJsonPath();
  let raw = null;
  try { raw = fs.readFileSync(cjPath, "utf8"); } catch { raw = null; }
  if (raw) {
    let out = raw;
    if (snapshot.userID !== undefined) { const s = spliceMember(out, "userID", JSON.stringify(snapshot.userID)); if (s) out = s; }
    if (snapshot.oauthAccount !== undefined) { const s = spliceMember(out, "oauthAccount", JSON.stringify(snapshot.oauthAccount)); if (s) out = s; }
    let valid = false;
    try { JSON.parse(out); valid = true; } catch { valid = false; }
    if (valid) { const tmp = cjPath + ".crh-tmp"; fs.writeFileSync(tmp, out); fs.renameSync(tmp, cjPath); return; }
  }
  // Fallback (member missing or splice produced invalid JSON): safe parse+rewrite.
  const cj = readJson(cjPath) || {};
  if (snapshot.userID !== undefined) cj.userID = snapshot.userID;
  if (snapshot.oauthAccount !== undefined) cj.oauthAccount = snapshot.oauthAccount;
  writeJsonAtomic(cjPath, cj);
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

/** The access token stored for a saved account (decrypt only, no switch) — used
 *  to query that account's live usage. Stays in the main process; never exposed
 *  to the renderer. Returns null on any failure. */
function tokenFor(dir, id) {
  const cf = credFile(dir, id);
  if (!fs.existsSync(cf)) return null;
  try {
    const snap = JSON.parse(dpapiDecryptFromFile(cf));
    return (snap && snap.claudeAiOauth && snap.claudeAiOauth.accessToken) || null;
  } catch { return null; }
}

/**
 * Refresh a STORED (inactive) account's token via Claude's OAuth endpoint and
 * save the rotated token back into its encrypted blob. This is what keeps a
 * vaulted account switch-able: without it the stored refresh token eventually
 * can't mint a valid access token and switching to it lands logged-out. Because
 * refresh tokens are one-time-use, persisting the NEW refresh token is essential.
 * Returns { ok } | { ok:false, invalid } (invalid = the saved login is dead → the
 * user must re-add the account). Async (network).
 */
async function refreshStored(dir, id) {
  const cf = credFile(dir, id);
  if (!fs.existsSync(cf)) return { ok: false, error: "not found" };
  let snap;
  try { snap = JSON.parse(dpapiDecryptFromFile(cf)); } catch { return { ok: false, error: "decrypt" }; }
  const o = snap && snap.claudeAiOauth;
  if (!o || !o.refreshToken) return { ok: false, error: "no refresh token" };
  const r = await oauth.refresh(o.refreshToken);
  if (!r.ok) return { ok: false, invalid: !!r.invalid, status: r.status };
  o.accessToken = r.oauth.accessToken;
  o.refreshToken = r.oauth.refreshToken;                 // MUST persist the rotated token
  o.expiresAt = r.oauth.expiresAt;
  o.refreshTokenExpiresAt = r.oauth.refreshTokenExpiresAt;
  if (r.oauth.scopes) o.scopes = r.oauth.scopes;
  if (r.oauth.subscriptionType) o.subscriptionType = r.oauth.subscriptionType;
  try { dpapiEncryptToFile(JSON.stringify(snap), cf); } catch (e) { return { ok: false, error: "encrypt" }; }
  try {
    const m = readJson(metaFile(dir, id)) || {};
    m.refreshedAt = Date.now();
    if (r.email) { m.email = r.email; } if (r.org) { m.org = r.org; }
    fs.writeFileSync(metaFile(dir, id), JSON.stringify(m, null, 2));
  } catch { /* ignore */ }
  return { ok: true };
}

function remove(dir, id) {
  try { fs.unlinkSync(credFile(dir, id)); } catch { /* ignore */ }
  try { fs.unlinkSync(metaFile(dir, id)); } catch { /* ignore */ }
  return { ok: true };
}

/** Is the DPAPI vault available on this OS? (Windows-only, like ClaudeSwitch.) */
function available() { return process.platform === "win32"; }

module.exports = { readLive, writeLive, saveCurrent, list, switchTo, remove, refreshStored, available, idFor, tokenFor, memberValueSpan, spliceMember };
