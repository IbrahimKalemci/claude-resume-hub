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
  openExternal: (url) => ipcRenderer.invoke("openExternal", url),
  testNotify: (cfg) => ipcRenderer.invoke("testNotify", cfg),
  getUpdate: () => ipcRenderer.invoke("getUpdate"),

  onState: (cb) => ipcRenderer.on("state", (_e, s) => cb(s)),
  onLog: (cb) => ipcRenderer.on("log", (_e, l) => cb(l)),
  onOutput: (cb) => ipcRenderer.on("output", (_e, chunk) => cb(chunk)),
  onUpdate: (cb) => ipcRenderer.on("update", (_e, info) => cb(info)),
});
