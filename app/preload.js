"use strict";

/**
 * Bridge between the sandboxed renderer and the main process.
 * Only these explicit channels are exposed — the renderer has no Node access.
 */

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  getState: () => ipcRenderer.invoke("getState"),
  getSettings: () => ipcRenderer.invoke("getSettings"),
  saveSettings: (s) => ipcRenderer.invoke("saveSettings", s),
  listSessions: (dir) => ipcRenderer.invoke("listSessions", dir),
  chooseFolder: () => ipcRenderer.invoke("chooseFolder"),
  start: (opts) => ipcRenderer.invoke("start", opts),
  stop: () => ipcRenderer.invoke("stop"),
  getQueue: () => ipcRenderer.invoke("getQueue"),
  openExternal: (url) => ipcRenderer.invoke("openExternal", url),
  testNotify: (cfg) => ipcRenderer.invoke("testNotify", cfg),
  getUpdate: () => ipcRenderer.invoke("getUpdate"),
  getStats: () => ipcRenderer.invoke("getStats"),
  getAccount: () => ipcRenderer.invoke("getAccount"),
  accountLogin: () => ipcRenderer.invoke("accountLogin"),
  accountLogout: () => ipcRenderer.invoke("accountLogout"),

  onState: (cb) => ipcRenderer.on("state", (_e, s) => cb(s)),
  onLog: (cb) => ipcRenderer.on("log", (_e, l) => cb(l)),
  onOutput: (cb) => ipcRenderer.on("output", (_e, chunk) => cb(chunk)),
  onUpdate: (cb) => ipcRenderer.on("update", (_e, info) => cb(info)),
  onQueue: (cb) => ipcRenderer.on("queue", (_e, q) => cb(q)),
  onStats: (cb) => ipcRenderer.on("stats", (_e, s) => cb(s)),
});
