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
  getRecentSessions: (limit) => ipcRenderer.invoke("getRecentSessions", limit),
  chooseFolder: () => ipcRenderer.invoke("chooseFolder"),
  start: (opts) => ipcRenderer.invoke("start", opts),
  stop: () => ipcRenderer.invoke("stop"),
  getQueue: () => ipcRenderer.invoke("getQueue"),
  openExternal: (url) => ipcRenderer.invoke("openExternal", url),
  testNotify: (cfg) => ipcRenderer.invoke("testNotify", cfg),
  getUpdate: () => ipcRenderer.invoke("getUpdate"),
  getStats: () => ipcRenderer.invoke("getStats"),
  getUsage: (opts) => ipcRenderer.invoke("getUsage", opts),
  getAccount: () => ipcRenderer.invoke("getAccount"),
  accountLogin: () => ipcRenderer.invoke("accountLogin"),
  accountLogout: () => ipcRenderer.invoke("accountLogout"),
  switchDefaultAccount: () => ipcRenderer.invoke("switchDefaultAccount"),
  vaultAvailable: () => ipcRenderer.invoke("vaultAvailable"),
  vaultList: () => ipcRenderer.invoke("vaultList"),
  vaultSaveCurrent: () => ipcRenderer.invoke("vaultSaveCurrent"),
  vaultSwitch: (id) => ipcRenderer.invoke("vaultSwitch", id),
  vaultRemove: (id) => ipcRenderer.invoke("vaultRemove", id),
  vaultAddStart: () => ipcRenderer.invoke("vaultAddStart"),
  vaultAddCode: (code) => ipcRenderer.invoke("vaultAddCode", code),
  vaultAddCancel: () => ipcRenderer.invoke("vaultAddCancel"),
  onVaultAddUrl: (cb) => ipcRenderer.on("vaultAddUrl", (_e, u) => cb(u)),
  vaultUsage: () => ipcRenderer.invoke("vaultUsage"),

  // multi-account
  getAccounts: () => ipcRenderer.invoke("getAccounts"),
  refreshAccounts: () => ipcRenderer.invoke("refreshAccounts"),
  setRotate: (on) => ipcRenderer.invoke("setRotate", on),
  switchAccount: (id) => ipcRenderer.invoke("switchAccount", id),
  addAccount: (label) => ipcRenderer.invoke("addAccount", label),
  removeAccount: (id) => ipcRenderer.invoke("removeAccount", id),

  onState: (cb) => ipcRenderer.on("state", (_e, s) => cb(s)),
  onAccounts: (cb) => ipcRenderer.on("accounts", (_e, a) => cb(a)),
  onLog: (cb) => ipcRenderer.on("log", (_e, l) => cb(l)),
  onOutput: (cb) => ipcRenderer.on("output", (_e, chunk) => cb(chunk)),
  onUpdate: (cb) => ipcRenderer.on("update", (_e, info) => cb(info)),
  onQueue: (cb) => ipcRenderer.on("queue", (_e, q) => cb(q)),
  onStats: (cb) => ipcRenderer.on("stats", (_e, s) => cb(s)),
});
