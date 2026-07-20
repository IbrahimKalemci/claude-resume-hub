"use strict";

/**
 * Zero-dependency remote notifications: fire a one-way message to a user-supplied
 * webhook and/or Telegram bot when the run changes phase. Outgoing only — no
 * Claude credentials involved, nothing read back.
 *
 * config = {
 *   webhook?: "https://…",                       // generic; also fits Slack/Discord/ntfy
 *   telegram?: { botToken: "…", chatId: "…" },   // the user's OWN bot, for their own chat
 * }
 */

const https = require("https");
const http = require("http");
const { URL } = require("url");

function post(urlStr, body, headers) {
  return new Promise((resolve) => {
    let u;
    try { u = new URL(urlStr); } catch { return resolve({ ok: false, error: "invalid URL" }); }
    const lib = u.protocol === "http:" ? http : https;
    const data = Buffer.from(body, "utf8");
    const req = lib.request(
      u,
      { method: "POST", headers: Object.assign({ "Content-Type": "application/json", "Content-Length": data.length }, headers || {}) },
      (res) => { res.resume(); resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode }); }
    );
    req.on("error", (e) => resolve({ ok: false, error: e.message }));
    req.setTimeout(8000, () => { req.destroy(); resolve({ ok: false, error: "timeout" }); });
    req.write(data);
    req.end();
  });
}

/** Send `title — message` to whatever channels are configured. Never throws. */
async function notifyRemote(config, title, message) {
  const cfg = config || {};
  const text = message ? `${title} — ${message}` : title;
  const out = [];

  if (cfg.webhook) {
    // Send several common keys so one payload fits generic hooks, Slack, Discord and ntfy.
    out.push(await post(cfg.webhook, JSON.stringify({ text, content: text, title, message, body: message })));
  }
  if (cfg.telegram && cfg.telegram.botToken && cfg.telegram.chatId) {
    const url = `https://api.telegram.org/bot${cfg.telegram.botToken}/sendMessage`;
    out.push(await post(url, JSON.stringify({ chat_id: cfg.telegram.chatId, text })));
  }
  return out;
}

function hasChannels(cfg) {
  return !!(cfg && (cfg.webhook || (cfg.telegram && cfg.telegram.botToken && cfg.telegram.chatId)));
}

module.exports = { notifyRemote, hasChannels, post };
