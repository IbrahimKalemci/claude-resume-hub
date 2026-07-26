"use strict";

/**
 * claude-resume-hub — desktop app (Electron main process).
 *
 * A tray-resident window that drives the same engine as the CLI: it finds the
 * session you were working in, watches for Claude's usage limit, counts down to
 * the exact reset, and resumes automatically. No terminal window, no tokens.
 */

const { app, BrowserWindow, Tray, Menu, ipcMain, dialog, shell, Notification, nativeImage } = require("electron");
const path = require("path");
const fs = require("fs");

const { AutoResumeEngine, probeLimit } = require("../lib/engine");
const { listSessions, pickActiveSession, lastActiveProjectDir, sessionRecap, smartPrompt, sessionIdleMs, sessionMtimeMs, limitFromTranscript } = require("../lib/sessions");
const { notifyRemote } = require("../lib/notify");
const { checkUpdate } = require("../lib/update");
const account = require("../lib/account");
const stats = require("../lib/stats");
const usage = require("../lib/usage");
const { appIcon } = require("./icon");

const pkg = require("../package.json");
let updateInfo = { available: false };

const COLORS = {
  // idle is the brand terracotta (matches the taskbar icon) so the tray never
  // shows a faint grey blob; phase changes recolour it amber/green/red.
  idle: "#c96442", starting: "#c96442", running: "#c96442",
  waiting: "#d29922", watching: "#58a6ff", done: "#3fb950", error: "#f85149",
};

let win = null;
let tray = null;
let engine = null;
let quitting = false;

let state = { phase: "idle", cycle: 0, maxCycles: 100, resetAt: null, wakeAt: null, message: "" };
let settings = {
  dir: "", smart: true, buffer: 30, autoStart: false,
  notify: { webhook: "", telegram: { botToken: "", chatId: "" } },
  // Multi-account rotation (token-free — each account is its own CLAUDE_CONFIG_DIR
  // that Claude itself signed into; we never read the credentials). accounts holds
  // EXTRA accounts; the default (~/.claude) account is always implicitly present.
  accounts: [], rotate: false, activeAccountId: "default", defaultLabel: "",
  // If a resume stalls with no output (headless can't answer a permission
  // prompt), auto-approve tools and retry so the task actually finishes. This is
  // what makes "walk away" reliably COMPLETE work instead of hanging. On by
  // default because the whole point is hands-off; can be turned off.
  autoApproveOnStall: true,
};

// ---------------------------------------------------------------------------
// settings persistence
// ---------------------------------------------------------------------------

function settingsFile() {
  return path.join(app.getPath("userData"), "settings.json");
}
function statsFile() {
  return path.join(app.getPath("userData"), "stats.json");
}

function loadSettings() {
  try {
    const raw = JSON.parse(fs.readFileSync(settingsFile(), "utf8"));
    settings = Object.assign(settings, raw);
  } catch { /* first run */ }
  if (!settings.dir) settings.dir = lastActiveProjectDir() || app.getPath("home");
}

function saveSettings() {
  try { fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2)); } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// tray + window
// ---------------------------------------------------------------------------

function trayImage(phase) {
  // SAME logo as the taskbar/window (disc + cream clock), just with the disc
  // tinted by phase. 32px source so Windows downscales into the tray crisply.
  return nativeImage.createFromBuffer(appIcon(32, COLORS[phase] || COLORS.idle));
}

function refreshTray() {
  if (!tray) return;
  tray.setImage(trayImage(state.phase));
  const extra = state.phase === "waiting" && state.wakeAt
    ? " — resumes " + new Date(state.wakeAt).toLocaleTimeString()
    : state.message ? " — " + state.message : "";
  tray.setToolTip(("claude-resume-hub · " + state.phase + extra).slice(0, 127));
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Show window", click: showWindow },
    { type: "separator" },
    { label: busy() ? "Stop" : "Start", click: () => (busy() ? stopEngine() : startJobs([buildJob({})])) },
    { type: "separator" },
    { label: "Quit", click: () => { quitting = true; app.quit(); } },
  ]));
}

function busy() {
  return state.phase === "running" || state.phase === "waiting" || state.phase === "starting" || state.phase === "watching";
}

function showWindow() {
  if (!win) return createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createWindow() {
  win = new BrowserWindow({
    width: 460,
    height: 700,
    minWidth: 400,
    minHeight: 560,
    show: !settings.autoStart,
    backgroundColor: "#0b0e14",
    autoHideMenuBar: true,
    icon: nativeImage.createFromBuffer(appIcon(256)),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true, // preload only uses contextBridge/ipcRenderer, which work sandboxed
    },
  });

  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, "renderer", "index.html"));

  // Harden navigation: this is a fixed local page. Never let content open new
  // windows or navigate away (a defence-in-depth backstop around the renderer).
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e) => e.preventDefault());

  // Closing hides to tray instead of quitting — it's a background app.
  win.on("close", (e) => {
    if (quitting) return;
    e.preventDefault();
    win.hide();
  });
}

// ---------------------------------------------------------------------------
// engine
// ---------------------------------------------------------------------------

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function pushState(patch) {
  state = Object.assign({}, state, patch);
  send("state", state);
  refreshTray();
}

function notify(title, body) {
  try { if (Notification.isSupported()) new Notification({ title, body }).show(); } catch { /* ignore */ }
  // Fire-and-forget remote notification (phone) if the user configured one.
  try { notifyRemote(settings.notify, title, body); } catch { /* ignore */ }
}

// A queue of projects, processed SEQUENTIALLY. Usage limits are account-level
// (one reset clock for everything), so running projects in parallel would just
// re-burn the freshly-reset budget and re-trip the limit — one at a time is correct.
let queue = [];
let qIndex = -1;
let stopped = false;

function jobLabel(dir) { try { return path.basename(dir) || dir; } catch { return dir; } }

function buildJob(opts) {
  const dir = opts.dir || settings.dir;
  // No task -> resume the chosen (or newest) session. A task -> new session.
  const sessionId = opts.task ? null : (opts.sessionId || (pickActiveSession(dir) || {}).id || null);
  return {
    dir,
    sessionId,
    prompt: opts.prompt || "continue",
    task: opts.task || null,
    smart: !!opts.smart,
    unattended: !!opts.unattended,
    buffer: Number(opts.buffer) || settings.buffer || 30,
    label: opts.label || jobLabel(dir),
    status: "queued",
  };
}

// ---------------------------------------------------------------------------
// Watch mode: sit in the tray and watch the session's transcript for a usage
// limit the user hits in their OWN Claude window — no `claude` calls, no quota
// spent, no tokens read (limitFromTranscript reads the .jsonl only). The moment
// a limit appears, schedule the resume for its reset time. This is the "set it
// and forget it" path: you don't have to be at the machine when the limit hits.
// ---------------------------------------------------------------------------
let watchTimer = null;
let watchStopped = false;
let watchDetectedAt = 0;
let watchedWaitMs = 0; // wait accrued during watch mode, carried into the run's history entry
let jobSleepTimer = null; // the "all accounts limited" wait timer
const WATCH_POLL_MS = 30000;

function stopWatch() {
  watchStopped = true;
  if (watchTimer) { clearTimeout(watchTimer); watchTimer = null; }
}

function startWatch(job) {
  if (engine) return { ok: false, error: "already running" };
  stopWatch();
  watchStopped = false;
  stopped = false;
  const logLine = (line) => send("log", { t: new Date().toLocaleTimeString(), line });

  pushState({ phase: "watching", resetAt: null, wakeAt: null, message: "Watching for a usage limit — I'll resume the moment you hit one." });
  logLine(`Watching “${job.label}” for a usage limit (reading the transcript only — no claude calls, no quota).`);

  const scheduleResume = (resetAt) => {
    const wakeAt = new Date(resetAt.getTime() + (job.buffer || 30) * 1000);
    watchDetectedAt = Date.now();
    pushState({ phase: "waiting", resetAt, wakeAt, message: `Limit detected — resuming at ${wakeAt.toLocaleTimeString()}` });
    notify("⏳ Usage limit detected", `${job.label} — will resume at ${wakeAt.toLocaleTimeString()}`);
    logLine(`Usage limit detected in the transcript. Resets ${resetAt.toLocaleString()} — resuming at ${wakeAt.toLocaleTimeString()} (+${job.buffer || 30}s).`);
    const delay = Math.max(0, wakeAt - Date.now());
    watchTimer = setTimeout(() => {
      if (watchStopped) return;
      const waited = Date.now() - watchDetectedAt;
      watchedWaitMs = waited;
      try { send("stats", stats.record(statsFile(), job.label, waited)); } catch { /* ignore */ }
      startJobs([job]);
    }, delay);
  };

  const tick = () => {
    if (watchStopped) return;
    let l = { limited: false };
    try { l = limitFromTranscript(job.dir, job.sessionId); } catch { /* ignore */ }
    if (l.limited && l.resetAt) {
      // Schedule the resume for the reset time. If that time is already in the
      // past (the limit has since reset), scheduleResume fires immediately
      // (its delay clamps to 0) — so we resume now instead of polling forever.
      return scheduleResume(l.resetAt);
    }
    if (l.limited && !l.resetAt) {
      // Limit but no parseable reset time — try again shortly, then just resume.
      logLine("Usage limit detected but no reset time in the transcript — will retry a resume soon.");
      watchTimer = setTimeout(() => { if (!watchStopped) startJobs([job]); }, 5 * 60 * 1000);
      return;
    }
    watchTimer = setTimeout(tick, WATCH_POLL_MS);
  };
  tick();
  return { ok: true, watching: true };
}

// --- multi-account helpers (token-free: a config dir per account) -----------
function accountsRoot() { return path.join(app.getPath("userData"), "accounts"); }
function configDirFor(id) {
  if (!id || id === "default") return null; // default account = ~/.claude
  return path.join(accountsRoot(), id);
}
function activeConfigDir() { return configDirFor(settings.activeAccountId); }

/** The default account plus any extras, as [{id,label,configDir}]. */
function allAccounts() {
  const def = { id: "default", label: settings.defaultLabel || "Default account", configDir: null };
  const extras = (settings.accounts || []).map((a) => ({
    id: a.id, label: a.label || a.email || a.id, configDir: configDirFor(a.id),
  }));
  return [def, ...extras];
}

/** Rotation order: the active account first, then the rest. */
function rotationOrder() {
  const all = allAccounts();
  const active = all.find((a) => a.id === settings.activeAccountId) || all[0];
  return [active].concat(all.filter((a) => a.id !== active.id));
}

function startJobs(jobs) {
  if (engine) return { ok: false, error: "already running" };
  stopWatch(); // cancel any pending watch timer so it can't fire a stale resume
  const valid = (jobs || []).filter((j) => j && j.dir && fs.existsSync(j.dir));
  if (!valid.length) return { ok: false, error: "no valid project folder" };
  queue = valid;
  qIndex = -1;
  stopped = false;
  send("queue", queue);
  runNext();
  return { ok: true };
}

function switchActive(id) {
  settings.activeAccountId = id;
  saveSettings();
  send("accounts", accountsPayload());
}

function sleepUntil(wakeAt) {
  return new Promise((resolve) => {
    const tick = () => {
      if (stopped) return resolve();
      const remaining = wakeAt - Date.now();
      if (remaining <= 0) return resolve();
      jobSleepTimer = setTimeout(tick, Math.min(remaining, 15 * 60 * 1000));
    };
    tick();
  });
}

// Run ONE engine attempt for `job` on `account`. When stopOnLimit is true the
// engine hands a limit straight back (reason:"limit") so the caller can rotate
// to another account instead of waiting. Resolves the engine result.
function runAttempt(job, account, stopOnLimit, ctx) {
  return new Promise((resolve) => {
    let prompt = job.prompt;
    if (job.smart && !job.task && prompt === "continue") {
      const sp = smartPrompt(sessionRecap(job.dir));
      if (sp) prompt = sp;
    }
    engine = new AutoResumeEngine({
      prompt, task: job.task, session: job.sessionId, dir: job.dir,
      buffer: job.buffer, unattended: job.unattended, poll: 5, maxCycles: 100,
      verbose: false, passthrough: [], configDir: account.configDir, stopOnLimit,
    });

    const acctTag = allAccounts().length > 1 ? ` · ${account.label}` : "";
    let last = state.phase;
    let waitStart = 0;
    engine.on("state", (s) => {
      pushState(Object.assign({}, s, { queueIndex: qIndex, queueTotal: queue.length, project: job.label + acctTag }));
      if (s.phase !== last) {
        if (s.phase === "waiting") { waitStart = Date.now(); notify("⏳ Usage limit hit", ctx.prefix + (s.message || "Waiting for the reset")); }
        if (s.phase === "running" && last === "waiting") {
          if (waitStart) { const w = Date.now() - waitStart; ctx.jobWaitMs += w; try { send("stats", stats.record(statsFile(), job.label, w)); } catch { /* ignore */ } }
          notify("▶ Limit reset — resumed", job.label);
        }
        last = s.phase;
      }
    });
    engine.on("log", (line) => send("log", { t: new Date().toLocaleTimeString(), line: ctx.prefix + line }));
    engine.on("output", (chunk) => send("output", chunk));

    pushState({
      phase: "starting",
      message: ctx.prefix + (job.task ? "Starting a new session…" : "Resuming session…") + acctTag,
      queueIndex: qIndex, queueTotal: queue.length, project: job.label,
    });

    engine.run()
      .then((r) => { engine = null; resolve(r || { ok: false, reason: "error" }); })
      .catch(() => { engine = null; resolve({ ok: false, reason: "error" }); });
  });
}

// Run a job to completion, rotating across accounts when enabled: try each
// account; the first that ISN'T limited runs it. Only if EVERY account is
// limited do we wait — for the soonest reset — then resume on that account.
//
// IMPORTANT: rotation only applies to account-INDEPENDENT work (a task / fresh
// session). A specific-session resume (job.sessionId) is tied to ONE account —
// each account has its own transcripts under its own CLAUDE_CONFIG_DIR, so
// `--resume <id>` on a different account would open an empty/wrong conversation.
// For those we stay on the active account (waiting it out if limited).
async function runJob(job, ctx) {
  const rotate = settings.rotate && allAccounts().length > 1 && !job.sessionId;
  if (settings.rotate && job.sessionId && allAccounts().length > 1) {
    ctx.logLine("Rotation skipped: resuming a specific session stays on its own account (a session doesn't exist under another account). Rotation applies to new tasks.");
  }
  if (!rotate) {
    const acct = (allAccounts().find((a) => a.id === settings.activeAccountId)) || allAccounts()[0];
    return runAttempt(job, acct, false, ctx);
  }

  const order = rotationOrder();
  let best = null;    // { account, resetAt } — earliest reset among limited accounts
  let lastErr = null; // last non-limit failure, in case NO account is usable
  for (const acct of order) {
    if (stopped) return { ok: false, reason: "stopped" };
    ctx.logLine(`Trying account “${acct.label}”…`);
    const r = await runAttempt(job, acct, true, ctx);
    if (stopped || r.reason === "stopped") return { ok: false, reason: "stopped" }; // user hit Stop — do NOT switch account or try the next
    if (r.ok) {
      if (acct.id !== settings.activeAccountId) { switchActive(acct.id); ctx.logLine(`Switched active account to “${acct.label}”.`); }
      return r;
    }
    if (r.reason === "limit") {
      ctx.logLine(`“${acct.label}” is limited${r.resetAt ? ` (resets ${r.resetAt.toLocaleTimeString()})` : ""}. Trying the next account…`);
      if (r.resetAt && (!best || !best.resetAt || r.resetAt < best.resetAt)) best = { account: acct, resetAt: r.resetAt };
      else if (!best) best = { account: acct, resetAt: r.resetAt };
      continue;
    }
    if (r.reason === "stuck") return r; // session open elsewhere — another account won't help
    // auth / other error is specific to THIS account (e.g. it was never signed
    // in). Skip it and keep trying the others — don't let a half-set-up account
    // abort the whole job when a known-limited account could still resume.
    ctx.logLine(`“${acct.label}” isn't usable (${r.reason}) — skipping to the next account…`);
    lastErr = r;
  }

  // No account ran. If any were merely limited, wait for the soonest reset and
  // resume that one; otherwise surface the last real error.
  if (best && best.resetAt) {
    const wakeAt = new Date(best.resetAt.getTime() + (job.buffer || 30) * 1000);
    ctx.jobWaitMs += Math.max(0, wakeAt - Date.now());
    pushState({ phase: "waiting", resetAt: best.resetAt, wakeAt, message: `All accounts limited — resuming “${best.account.label}” at ${wakeAt.toLocaleTimeString()}` });
    notify("⏳ All accounts limited", `Resuming “${best.account.label}” at ${wakeAt.toLocaleTimeString()}`);
    ctx.logLine(`All accounts are limited. Waiting for the soonest reset (“${best.account.label}”, ${best.resetAt.toLocaleTimeString()}).`);
    await sleepUntil(wakeAt);
    if (stopped) return { ok: false, reason: "stopped" };
    if (best.account.id !== settings.activeAccountId) switchActive(best.account.id);
    return runAttempt(job, best.account, false, ctx);
  }
  return lastErr || { ok: false, reason: "limit" };
}

async function runNext() {
  if (stopped) return;
  qIndex++;
  if (qIndex >= queue.length) {
    send("queue", queue);
    const msg = queue.length > 1 ? "All projects done." : (state.message || "Done.");
    pushState({ phase: "done", message: msg, queueIndex: qIndex, queueTotal: queue.length });
    return;
  }
  const job = queue[qIndex];
  job.status = "running";
  send("queue", queue);

  const prefix = queue.length > 1 ? `[${qIndex + 1}/${queue.length}] ${job.label}: ` : "";
  const logLine = (line) => send("log", { t: new Date().toLocaleTimeString(), line: prefix + line });
  const ctx = { prefix, logLine, jobWaitMs: watchedWaitMs };
  watchedWaitMs = 0;

  // Active-session guard — WAIT AND GRAB. Resuming a session another Claude
  // client (your IDE — Antigravity/Cursor/VS Code — or another terminal) is
  // actively driving makes two clients fight over one conversation and hang. But
  // instead of giving up, the app's JOB is to get the continue through — so if the
  // session is being written right now, we WAIT for that client to go quiet (it
  // hit its own limit, finished, or you closed it) and then resume. We poll,
  // detecting "being written" by two mtime samples. Capped so we never wait
  // forever on a genuinely-in-use session. (A new task session has no conflict.)
  if (job.sessionId && !job.task) {
    const CAP_MS = 30 * 60 * 1000; // give up waiting after 30 min of continuous other-client activity
    const startedWaiting = Date.now();
    let announced = false;
    for (;;) {
      if (stopped) return;
      const m1 = sessionMtimeMs(job.dir, job.sessionId);
      await new Promise((r) => setTimeout(r, 2500));
      if (stopped) return;
      const m2 = sessionMtimeMs(job.dir, job.sessionId);
      if (!(m1 && m2 && m2 !== m1)) break; // quiet → free to resume
      if (Date.now() - startedWaiting >= CAP_MS) {
        const msg = "That session has been in active use by another Claude client (your IDE / Antigravity) for 30+ min, so I can't safely take it over. Close that Claude window, or pick a session that isn't open elsewhere.";
        logLine("⛔ " + msg); notify("⛔ Session busy elsewhere", job.label);
        job.status = "error"; send("queue", queue);
        try { send("stats", stats.recordRun(statsFile(), { project: job.label, outcome: "skipped", waitMs: ctx.jobWaitMs, summary: "" })); } catch { /* ignore */ }
        pushState({ phase: "error", message: msg, resetAt: null, wakeAt: null });
        return runNext();
      }
      if (!announced) {
        announced = true;
        logLine("⏳ This session is open in another Claude window right now — waiting for it to go quiet, then I'll resume it here.");
        notify("⏳ Waiting for your IDE", job.label);
        pushState({ phase: "waiting", resetAt: null, wakeAt: null, message: "Waiting for another Claude window to release this session…" });
      }
      await new Promise((r) => setTimeout(r, 15000)); // re-check every 15s
    }
  }

  let r = await runJob(job, ctx);
  if (stopped) return;

  // Stall recovery — the app's job is to get continue DONE, whatever it takes.
  // A "stuck" (no output for the whole watchdog window) headless is almost always
  // a permission prompt Claude can't get answered. Auto-approve tools and retry
  // once so the task actually finishes instead of silently doing nothing.
  if (r && r.reason === "stuck" && !job.unattended && settings.autoApproveOnStall !== false) {
    logLine("⟳ It stalled with no output — headless it can't answer a tool-permission prompt. Retrying with auto-approve so it can finish the job.");
    notify("⟳ Auto-approving so it can finish", job.label);
    job.unattended = true;
    r = await runJob(job, ctx);
    if (stopped) return;
  }

  // Record the finished run (outcome + "what it did" summary) for history — the
  // summary is Claude's last message, read locally from the transcript.
  const outcome = r && r.ok ? "done" : r && r.reason === "auth" ? "auth" : r && r.reason === "stuck" ? "stuck" : r && r.reason === "limit" ? "error" : "error";
  let summary = "";
  try { summary = sessionRecap(job.dir) || ""; } catch { /* ignore */ }
  try { send("stats", stats.recordRun(statsFile(), { project: job.label, outcome, waitMs: ctx.jobWaitMs, summary })); } catch { /* ignore */ }
  if (outcome === "done" && summary) logLine("✔ What it did: " + summary.slice(0, 200) + (summary.length > 200 ? "…" : ""));

  job.status = r && r.ok ? "done" : "error";
  send("queue", queue);
  if (r && r.ok) { notify("✅ Done", job.label); return runNext(); }
  if (r && r.reason === "auth") {
    stopped = true;
    notify("🔑 Sign-in needed", state.message || "Run `claude login`, then start again.");
    return;
  }
  notify("⚠ " + job.label, state.message || "Stopped");
  runNext(); // other errors: skip to the next project
}

function stopEngine() {
  stopped = true;
  stopWatch();
  if (jobSleepTimer) { clearTimeout(jobSleepTimer); jobSleepTimer = null; }
  if (engine) { try { engine.stop(); } catch { /* ignore */ } engine = null; }
  queue.forEach((j) => { if (j.status === "running" || j.status === "queued") j.status = "stopped"; });
  send("queue", queue);
  pushState({ phase: "idle", message: "Stopped.", resetAt: null, wakeAt: null });
}

// Snapshot of accounts for the renderer: the list (default + extras), which is
// active, and whether rotation is on. Emails/labels only — never tokens.
function accountsPayload() {
  return { accounts: allAccounts(), activeId: settings.activeAccountId, rotate: !!settings.rotate };
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------

ipcMain.handle("getState", () => state);
ipcMain.handle("getSettings", () => settings);
ipcMain.handle("saveSettings", (_e, s) => { settings = Object.assign(settings, s || {}); saveSettings(); });
ipcMain.handle("listSessions", (_e, dir) => {
  const list = listSessions(dir || settings.dir) || [];
  return list.map((s) => ({
    id: s.id, mtime: s.mtime instanceof Date ? s.mtime.toISOString() : String(s.mtime),
    turns: s.turns, sizeKB: s.sizeKB, title: s.title, preview: s.preview,
  }));
});
ipcMain.handle("getRecentSessions", (_e, limit) => {
  const list = require("../lib/sessions").recentSessions(limit || 5) || [];
  return list.map((s) => ({
    id: s.id, dir: s.dir, project: s.project, turns: s.turns, sizeKB: s.sizeKB, title: s.title,
    mtime: s.mtime instanceof Date ? s.mtime.toISOString() : String(s.mtime), preview: s.preview,
  }));
});
ipcMain.handle("chooseFolder", async () => {
  const r = await dialog.showOpenDialog(win, { properties: ["openDirectory"], defaultPath: settings.dir });
  if (r.canceled || !r.filePaths.length) return null;
  settings.dir = r.filePaths[0];
  saveSettings();
  return settings.dir;
});
ipcMain.handle("start", async (_e, opts) => {
  opts = opts || {};
  const jobs = (opts.jobs && opts.jobs.length)
    ? opts.jobs.map((j) => buildJob(j))
    : [buildJob(opts)];

  const first = jobs[0];
  const isPlainContinue = first && !first.task && (!first.prompt || first.prompt === "continue");
  const havePlain = isPlainContinue && first.dir && fs.existsSync(first.dir);

  // Watch mode takes precedence and is independent of rotation: sit and watch the
  // transcript for a limit (no claude calls, no quota) and auto-resume. Its own
  // poll handles an already-active limit as well as a future one — so we don't
  // pre-probe here (pre-probing under rotation is exactly what BUG-3 spent quota
  // doing). A custom task is never watched — it runs now.
  if (havePlain && opts.watch) return startWatch(first);

  // For a PLAIN resume with rotation OFF, quickly check whether a limit is
  // actually active. If not, say so instead of quietly running "continue". A
  // custom task/prompt is an instruction to run NOW — never swallowed here.
  // (With rotation on, runJob probes each account itself, so we skip this.)
  if (havePlain && !settings.rotate) {
    pushState({ phase: "starting", message: "Checking your usage limit…" });
    const p = await probeLimit(first.dir, { timeoutSec: 45, configDir: activeConfigDir() });
    if (!p.error) {
      if (p.auth) {
        pushState({ phase: "error", message: p.authMsg });
        notify("🔑 Sign-in needed", p.authMsg);
        return { ok: false, reason: "auth" };
      }
      if (!p.limited) {
        pushState({ phase: "idle", resetAt: null, wakeAt: null, message: "No usage limit is active right now — nothing to wait for. Turn on Watch to auto-resume when you hit one, or give it a task to run now." });
        notify("ℹ No active limit", "You're not limited right now — nothing to resume.");
        return { ok: true, noLimit: true };
      }
    }
  }
  return startJobs(jobs);
});
ipcMain.handle("stop", () => stopEngine());
ipcMain.handle("getQueue", () => queue);
ipcMain.handle("openExternal", (_e, url) => {
  // Only ever open http(s) links (the update banner's GitHub URL). Refuse file:,
  // ms-*, custom protocol handlers etc. — a compromised renderer must not be able
  // to launch arbitrary OS handlers via this channel.
  try { const u = new URL(String(url)); if (u.protocol === "http:" || u.protocol === "https:") return shell.openExternal(u.href); } catch { /* ignore */ }
  return false;
});
ipcMain.handle("getUpdate", () => updateInfo);
ipcMain.handle("getStats", () => stats.load(statsFile()));
// Token-free local usage analytics (counts from transcripts, not the account).
ipcMain.handle("getUsage", (_e, opts) => {
  opts = opts || {};
  const dir = opts.dir || settings.dir;
  try { return usage.usageSnapshot(dir, opts.sessionId || null, Date.now() - 24 * 3600 * 1000); }
  catch { return { session: { input: 0, output: 0, cached: 0, total: 0, turns: 0 }, recent: { input: 0, output: 0, cached: 0, total: 0 } }; }
});
ipcMain.handle("getAccount", () => account.status());
ipcMain.handle("accountLogin", () => account.login());
ipcMain.handle("accountLogout", async () => { const r = await account.logout(); return { ok: r.code === 0 }; });
// Token-free global switch (logout+login on the default config → CLI + IDE).
ipcMain.handle("switchDefaultAccount", () => account.switchDefault());

// --- multi-account IPC (token-free) -----------------------------------------
ipcMain.handle("getAccounts", () => accountsPayload());
ipcMain.handle("setRotate", (_e, on) => { settings.rotate = !!on; saveSettings(); return accountsPayload(); });
ipcMain.handle("switchAccount", (_e, id) => { switchActive(id || "default"); return accountsPayload(); });
// Refresh the label of an account by reading its (non-secret) email.
ipcMain.handle("refreshAccounts", async () => {
  try {
    const d = await account.status(null);
    settings.defaultLabel = d.email || "Default account";
  } catch { /* ignore */ }
  for (const a of settings.accounts || []) {
    try { const s = await account.status(configDirFor(a.id)); if (s.email) { a.email = s.email; a.label = s.email; } } catch { /* ignore */ }
  }
  saveSettings();
  return accountsPayload();
});
// Add an account: mint a config dir and launch Claude's own sign-in into it.
ipcMain.handle("addAccount", (_e, label) => {
  const id = "acct-" + Date.now().toString(36);
  const dir = configDirFor(id);
  try { fs.mkdirSync(dir, { recursive: true }); } catch { /* ignore */ }
  settings.accounts = (settings.accounts || []).concat([{ id, label: label || "New account", email: null }]);
  saveSettings();
  account.login(dir); // interactive OAuth INTO this dir — we never see the token
  send("accounts", accountsPayload());
  return { ok: true, id };
});
ipcMain.handle("removeAccount", (_e, id) => {
  settings.accounts = (settings.accounts || []).filter((a) => a.id !== id);
  if (settings.activeAccountId === id) settings.activeAccountId = "default";
  try { fs.rmSync(configDirFor(id), { recursive: true, force: true }); } catch { /* ignore */ }
  saveSettings();
  return accountsPayload();
});
ipcMain.handle("testNotify", async (_e, cfg) => {
  const res = await notifyRemote(cfg || settings.notify, "🔔 claude-resume-hub", "Test notification — it works!");
  if (!res.length) return { ok: false, error: "no channel configured" };
  const bad = res.find((r) => !r.ok);
  return bad ? { ok: false, error: bad.error || ("HTTP " + bad.status) } : { ok: true };
});

// ---------------------------------------------------------------------------
// lifecycle
// ---------------------------------------------------------------------------

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", showWindow);

  app.whenReady().then(() => {
    loadSettings();
    createWindow();

    tray = new Tray(trayImage("idle"));
    tray.on("click", showWindow);
    refreshTray();

    // Non-blocking update check (read-only, public GitHub API).
    checkUpdate(pkg.version, "IbrahimKalemci/claude-resume-hub").then((r) => {
      updateInfo = r || { available: false };
      if (updateInfo.available) send("update", updateInfo);
    });

    app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); else showWindow(); });
  });

  // Background app: don't quit when the window is closed.
  app.on("window-all-closed", (e) => { if (e && e.preventDefault) e.preventDefault(); });
  app.on("before-quit", () => { quitting = true; stopped = true; try { stopWatch(); if (engine) engine.stop(); } catch { /* ignore */ } });
}
