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

const { AutoResumeEngine } = require("../lib/engine");
const { listSessions, pickActiveSession, lastActiveProjectDir } = require("../lib/sessions");
const { appIcon, clockIcon } = require("./icon");

const COLORS = {
  idle: "#8b93a7", starting: "#c96442", running: "#c96442",
  waiting: "#d29922", done: "#3fb950", error: "#f85149",
};

let win = null;
let tray = null;
let engine = null;
let quitting = false;

let state = { phase: "idle", cycle: 0, maxCycles: 100, resetAt: null, wakeAt: null, message: "" };
let settings = { dir: "", smart: true, buffer: 30, autoStart: false };

// ---------------------------------------------------------------------------
// settings persistence
// ---------------------------------------------------------------------------

function settingsFile() {
  return path.join(app.getPath("userData"), "settings.json");
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
  // The clock mark in the phase colour: branded, and legible at 16px.
  return nativeImage.createFromBuffer(clockIcon(COLORS[phase] || COLORS.idle, 16));
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
    { label: busy() ? "Stop" : "Start", click: () => (busy() ? stopEngine() : startEngine({})) },
    { type: "separator" },
    { label: "Quit", click: () => { quitting = true; app.quit(); } },
  ]));
}

function busy() {
  return state.phase === "running" || state.phase === "waiting" || state.phase === "starting";
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
}

function startEngine(opts) {
  if (engine) return { ok: false, error: "already running" };

  const dir = opts.dir || settings.dir;
  if (!dir || !fs.existsSync(dir)) return { ok: false, error: "project folder not found" };

  // No task -> resume the chosen (or newest) session. A task -> new session.
  let sessionId = opts.task ? null : (opts.sessionId || (pickActiveSession(dir) || {}).id || null);

  engine = new AutoResumeEngine({
    prompt: opts.prompt || "continue",
    task: opts.task || null,
    session: sessionId,
    dir,
    buffer: Number(opts.buffer) || settings.buffer || 30,
    poll: 5,
    maxCycles: 100,
    verbose: false,
    passthrough: [],
  });

  let last = state.phase;
  engine.on("state", (s) => {
    pushState(s);
    if (s.phase !== last) {
      if (s.phase === "waiting") notify("⏳ Usage limit hit", s.message || "Waiting for the reset");
      if (s.phase === "running" && last === "waiting") notify("▶ Limit reset — resumed", "Claude is continuing your task.");
      if (s.phase === "done") notify("✅ Task complete", s.message || "All done.");
      if (s.phase === "error") notify("⚠ Stopped", s.message || "An error occurred.");
      last = s.phase;
    }
  });
  engine.on("log", (line) => send("log", { t: new Date().toLocaleTimeString(), line }));

  pushState({ phase: "starting", message: opts.task ? "Starting a new session…" : "Resuming session…" });

  engine.run()
    .then((r) => { engine = null; pushState({ phase: r && r.ok ? "done" : "error" }); })
    .catch((e) => { engine = null; pushState({ phase: "error", message: String(e && e.message || e) }); });

  return { ok: true };
}

function stopEngine() {
  if (!engine) return;
  try { engine.stop(); } catch { /* ignore */ }
  engine = null;
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
ipcMain.handle("start", (_e, opts) => startEngine(opts || {}));
ipcMain.handle("stop", () => stopEngine());
ipcMain.handle("openExternal", (_e, url) => shell.openExternal(url));

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

    app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); else showWindow(); });
  });

  // Background app: don't quit when the window is closed.
  app.on("window-all-closed", (e) => { if (e && e.preventDefault) e.preventDefault(); });
  app.on("before-quit", () => { quitting = true; try { if (engine) engine.stop(); } catch { /* ignore */ } });
}
