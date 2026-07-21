"use strict";

/**
 * Tiny persistent stats: how many times the tool waited out a limit and resumed,
 * and how much waiting that saved you. Stored as plain JSON at a caller-provided
 * path. No secrets, purely local.
 */

const fs = require("fs");

function load(file) {
  try {
    const j = JSON.parse(fs.readFileSync(file, "utf8"));
    return {
      resumes: j.resumes || 0,
      waitMs: j.waitMs || 0,
      history: Array.isArray(j.history) ? j.history : [],
    };
  } catch {
    return { resumes: 0, waitMs: 0, history: [] };
  }
}

function save(file, s) {
  try { fs.writeFileSync(file, JSON.stringify(s)); } catch { /* ignore */ }
}

/** Record one resume-after-waiting event; returns the updated stats. */
function record(file, project, waitMs, at) {
  const s = load(file);
  const w = Math.max(0, Number(waitMs) || 0);
  s.resumes += 1;
  s.waitMs += w;
  s.history.unshift({ t: at || Date.now(), project: project || "", waitMs: w });
  s.history = s.history.slice(0, 50);
  save(file, s);
  return s;
}

module.exports = { load, save, record };
