"use strict";

/**
 * Token-free local usage analytics. Claude Code records a `message.usage` object
 * (input/output/cache token COUNTS) on assistant turns in the transcript. Those
 * are plain numbers in your own conversation log — NOT a credential — so summing
 * them reads no tokens and touches no auth, exactly like the rest of this tool.
 *
 * IMPORTANT (honesty): this reports how many tokens you've USED. It cannot show
 * your plan's quota or "% remaining" — that lives on the account, not in the
 * transcript — so we never pretend to. It's a consumption/burn-rate signal only.
 */

const fs = require("fs");
const path = require("path");
const { projectsRoot, findProjectFolder, newestTranscript } = require("./sessions");

/**
 * Token counts on one transcript entry (zeros if it has no usage block).
 *   input  = fresh input + cache CREATION (context newly written) — real work
 *   output = generated tokens — real work
 *   cached = cache READ tokens — the context re-read each turn. This is re-counted
 *            on EVERY turn and is heavily discounted, so summing it across a long
 *            session balloons into a meaningless number. Tracked separately and
 *            kept OUT of `total`, which stays an honest "new tokens" figure.
 */
function entryTokens(o) {
  const u = o && o.message && o.message.usage;
  if (!u) return { input: 0, output: 0, cached: 0, total: 0 };
  const input = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0);
  const output = u.output_tokens || 0;
  const cached = u.cache_read_input_tokens || 0;
  return { input, output, cached, total: input + output };
}

function addInto(acc, t) { acc.input += t.input; acc.output += t.output; acc.cached += t.cached; acc.total += t.total; }

/** Sum token usage across a session's transcript (newest in `dir`, or a given id). */
function sessionTokens(dir, id) {
  const acc = { input: 0, output: 0, cached: 0, total: 0, turns: 0 };
  const file = newestTranscript(dir, id);
  if (!file) return acc;
  let lines = [];
  try { lines = fs.readFileSync(file, "utf8").split("\n"); } catch { return acc; }
  for (const l of lines) {
    if (!l) continue;
    let o; try { o = JSON.parse(l); } catch { continue; }
    if (!o || o.type !== "assistant") continue;
    const t = entryTokens(o);
    if (t.total > 0) { addInto(acc, t); acc.turns += 1; }
  }
  return acc;
}

/**
 * Token usage across ALL projects for entries timestamped at/after `sinceMs` — a
 * "burn rate" over a recent window (e.g. the last 24h). Cheap: only transcripts
 * whose file mtime is within the window are opened.
 */
function recentTokens(sinceMs) {
  const acc = { input: 0, output: 0, cached: 0, total: 0 };
  const root = projectsRoot();
  if (!fs.existsSync(root)) return acc;
  let folders = [];
  try { folders = fs.readdirSync(root); } catch { return acc; }
  for (const folder of folders) {
    const dir = path.join(root, folder);
    let files = [];
    try { files = fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl")); } catch { continue; }
    for (const f of files) {
      const full = path.join(dir, f);
      try { if (fs.statSync(full).mtimeMs < sinceMs) continue; } catch { continue; }
      let lines = [];
      try { lines = fs.readFileSync(full, "utf8").split("\n"); } catch { continue; }
      for (const l of lines) {
        if (!l) continue;
        let o; try { o = JSON.parse(l); } catch { continue; }
        if (!o || o.type !== "assistant") continue;
        const ts = o.timestamp ? Date.parse(o.timestamp) : NaN;
        if (!Number.isNaN(ts) && ts < sinceMs) continue;
        addInto(acc, entryTokens(o));
      }
    }
  }
  return acc;
}

/** Convenience snapshot for the app: this session + a recent window. */
function usageSnapshot(dir, id, sinceMs) {
  return { session: sessionTokens(dir, id), recent: recentTokens(sinceMs) };
}

module.exports = { entryTokens, sessionTokens, recentTokens, usageSnapshot };
