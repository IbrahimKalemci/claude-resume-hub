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
const { listSessions, pickActiveSession, lastActiveProjectDir, sessionRecap, smartPrompt, sessionIdleMs, limitFromTranscript } = require("../lib/sessions");
const { notifyRemote } = require("../lib/notify");
const { checkUpdate } = require("../lib/update");
const account = require("../lib/account");
const stats = require("../lib/stats");
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
      sandbox: false,
    },
  });

  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, "renderer", "index.html"));

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
    if (l.limited && l.resetAt && l.resetAt > new Date()) {
      return scheduleResume(l.resetAt); // stop polling — resume is scheduled
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

function startJobs(jobs) {
  if (engine) return { ok: false, error: "already running" };
  const valid = (jobs || []).filter((j) => j && j.dir && fs.existsSync(j.dir));
  if (!valid.length) return { ok: false, error: "no valid project folder" };
  queue = valid;
  qIndex = -1;
  stopped = false;
  send("queue", queue);
  runNext();
  return { ok: true };
}

function runNext() {
  if (stopped) return;
  qIndex++;
  if (qIndex >= queue.length) {
    send("queue", queue);
    // Keep the engine's nuanced message for a single project (e.g. "no usage
    // limit was active"); only override when several projects ran.
    const msg = queue.length > 1 ? "All projects done." : (state.message || "Done.");
    pushState({ phase: "done", message: msg, queueIndex: qIndex, queueTotal: queue.length });
    return;
  }
  const job = queue[qIndex];
  job.status = "running";
  send("queue", queue);

  const prefix = queue.length > 1 ? `[${qIndex + 1}/${queue.length}] ${job.label}: ` : "";
  const logLine = (line) => send("log", { t: new Date().toLocaleTimeString(), line: prefix + line });

  // Active-session guard: if we're resuming a specific session whose transcript
  // was written seconds ago, it's probably open in another Claude window right
  // now. Resuming it makes two clients fight over the same conversation and hang
  // (the exact footgun behind "it did nothing"). Warn loudly; the watchdog is the
  // backstop if it does hang. (A brand-new task session has no such conflict.)
  if (job.sessionId && !job.task && sessionIdleMs(job.dir, job.sessionId) < 45000) {
    logLine("⚠ This session was active seconds ago — it looks open in another Claude window. Resuming it can hang. Close the other window, or pick a different session.");
    notify("⚠ Session may be open elsewhere", job.label);
  }

  // Smart resume: for a plain "continue" (no task), read the session's last step
  // locally and nudge Claude to pick up exactly there instead of a bare
  // "continue". Mirrors the CLI's --smart. No AI/network — just the transcript.
  let prompt = job.prompt;
  if (job.smart && !job.task && prompt === "continue") {
    const sp = smartPrompt(sessionRecap(job.dir));
    if (sp) prompt = sp;
  }

  engine = new AutoResumeEngine({
    prompt, task: job.task, session: job.sessionId, dir: job.dir,
    buffer: job.buffer, unattended: job.unattended, poll: 5, maxCycles: 100, verbose: false, passthrough: [],
  });

  let last = state.phase;
  let waitStart = 0;
  let jobWaitMs = watchedWaitMs; // carry any wait already accrued while watching
  watchedWaitMs = 0;
  engine.on("state", (s) => {
    pushState(Object.assign({}, s, { queueIndex: qIndex, queueTotal: queue.length, project: job.label }));
    if (s.phase !== last) {
      if (s.phase === "waiting") { waitStart = Date.now(); notify("⏳ Usage limit hit", prefix + (s.message || "Waiting for the reset")); }
      if (s.phase === "running" && last === "waiting") {
        if (waitStart) { const w = Date.now() - waitStart; jobWaitMs += w; try { send("stats", stats.record(statsFile(), job.label, w)); } catch { /* ignore */ } }
        notify("▶ Limit reset — resumed", job.label);
      }
      last = s.phase;
    }
  });
  engine.on("log", (line) => send("log", { t: new Date().toLocaleTimeString(), line: prefix + line }));
  engine.on("output", (chunk) => send("output", chunk));

  pushState({
    phase: "starting",
    message: prefix + (job.task ? "Starting a new session…" : "Resuming session…"),
    queueIndex: qIndex, queueTotal: queue.length, project: job.label,
  });

  // Record the finished run (outcome + "what it did" summary) for the history
  // panel. The summary is Claude's last message, read locally from the
  // transcript — no tokens, no network.
  const logRun = (outcome) => {
    let summary = "";
    try { summary = sessionRecap(job.dir) || ""; } catch { /* ignore */ }
    try { send("stats", stats.recordRun(statsFile(), { project: job.label, outcome, waitMs: jobWaitMs, summary })); } catch { /* ignore */ }
    if (outcome === "done" && summary) logLine("✔ What it did: " + summary.slice(0, 200) + (summary.length > 200 ? "…" : ""));
  };

  engine.run()
    .then((r) => {
      engine = null;
      job.status = r && r.ok ? "done" : "error";
      send("queue", queue);
      if (r && r.ok) { logRun("done"); notify("✅ Done", job.label); return runNext(); }
      // An auth failure hits every project the same way — stop the whole queue.
      if (r && r.reason === "auth") {
        stopped = true;
        logRun("auth");
        notify("🔑 Sign-in needed", state.message || "Run `claude login`, then start again.");
        return;
      }
      logRun(r && r.reason === "stuck" ? "stuck" : "error");
      notify("⚠ " + job.label, state.message || "Stopped");
      runNext(); // other errors: skip to the next project
    })
    .catch(() => { engine = null; job.status = "error"; logRun("error"); send("queue", queue); runNext(); });
}

function stopEngine() {
  stopped = true;
  stopWatch();
  if (engine) { try { engine.stop(); } catch { /* ignore */ } engine = null; }
  queue.forEach((j) => { if (j.status === "running" || j.status === "queued") j.status = "stopped"; });
  send("queue", queue);
  pushState({ phase: "idle", message: "Stopped.", resetAt: null, wakeAt: null });
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
    turns: s.turns, sizeKB: s.sizeKB, preview: s.preview,
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

  // For a PLAIN resume ("continue", no custom instruction), quickly check
  // whether a limit is actually active. If not, tell the user instead of
  // quietly running "continue". A custom task/prompt is an instruction to run
  // NOW — it must never be swallowed by the "no active limit" pre-check.
  const first = jobs[0];
  const isPlainContinue = first && !first.task && (!first.prompt || first.prompt === "continue");
  if (isPlainContinue && first.dir && fs.existsSync(first.dir)) {
    pushState({ phase: "starting", message: "Checking your usage limit…" });
    const p = await probeLimit(first.dir, { timeoutSec: 45 });
    if (!p.error) {
      if (p.auth) {
        pushState({ phase: "error", message: p.authMsg });
        notify("🔑 Sign-in needed", p.authMsg);
        return { ok: false, reason: "auth" };
      }
      if (!p.limited) {
        // Watch mode: instead of giving up, sit and watch for the limit to
        // appear (reading the transcript, no quota), then auto-resume on reset.
        if (opts.watch) return startWatch(first);
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
ipcMain.handle("openExternal", (_e, url) => shell.openExternal(url));
ipcMain.handle("getUpdate", () => updateInfo);
ipcMain.handle("getStats", () => stats.load(statsFile()));
ipcMain.handle("getAccount", () => account.status());
ipcMain.handle("accountLogin", () => account.login());
ipcMain.handle("accountLogout", async () => { const r = await account.logout(); return { ok: r.code === 0 }; });
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
  app.on("before-quit", () => { quitting = true; try { stopWatch(); if (engine) engine.stop(); } catch { /* ignore */ } });
}
