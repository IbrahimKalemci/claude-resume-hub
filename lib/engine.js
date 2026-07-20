"use strict";

const { spawn } = require("child_process");
const { EventEmitter } = require("events");
const { detectLimit, detectAuthError, fmtDuration } = require("./detect");

/**
 * Build the argument list passed to `claude` for a given cycle.
 *   - First cycle with an initial task  -> start a fresh session with that task
 *   - A specific session id (--session) -> resume exactly that session
 *   - Otherwise                         -> continue the most recent session (-c)
 */
function buildClaudeArgs(opts, cycle) {
  const extra = opts.passthrough || [];
  if (cycle === 1 && opts.task) {
    return ["-p", opts.task, ...extra];
  }
  if (opts.session) {
    return ["--resume", opts.session, "-p", opts.prompt, ...extra];
  }
  return ["-c", "-p", opts.prompt, ...extra];
}

/**
 * AutoResumeEngine runs Claude Code in a loop, waiting out usage limits.
 *
 * Events:
 *   "log"   (line)                        human-readable log line
 *   "state" ({phase, cycle, maxCycles, resetAt, wakeAt, message})
 *            phase ∈ starting|running|waiting|done|error
 *   "output"(chunk)                       raw claude stdout/stderr passthrough
 */
class AutoResumeEngine extends EventEmitter {
  constructor(opts) {
    super();
    this.opts = opts;
    this.state = {
      phase: "starting",
      cycle: 0,
      maxCycles: opts.maxCycles,
      resetAt: null,
      wakeAt: null,
      message: "",
    };
    this._timer = null;
    this._stopped = false;
  }

  _setState(patch) {
    this.state = { ...this.state, ...patch };
    this.emit("state", this.state);
  }

  log(line) {
    this.emit("log", line);
  }

  quoteArg(s) {
    s = String(s);
    if (process.platform === "win32") return `"${s.replace(/"/g, '""')}"`;
    return `'${s.replace(/'/g, `'\\''`)}'`;
  }

  _runClaude(claudeArgs) {
    return new Promise((resolve) => {
      const cmd = ["claude", ...claudeArgs.map((a) => this.quoteArg(a))].join(" ");
      // stdin is "ignore", not "inherit": claude always runs in -p/print mode here,
      // and inheriting a console that doesn't exist (e.g. the GUI app) makes Windows
      // kill the child with STATUS_CONTROL_C_EXIT (0xC000013A).
      const child = spawn(cmd, {
        cwd: this.opts.dir,
        shell: true,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      this._child = child;

      let output = "";
      const tee = (stream) =>
        stream.on("data", (d) => {
          const s = d.toString();
          output += s;
          this.emit("output", s);
        });
      tee(child.stdout);
      tee(child.stderr);

      child.on("error", (err) => resolve({ code: -1, output, error: err }));
      child.on("close", (code) => resolve({ code, output }));
    });
  }

  _sleepUntil(wakeAt) {
    return new Promise((resolve) => {
      const tick = () => {
        if (this._stopped) return resolve();
        const remaining = wakeAt - new Date();
        if (remaining <= 0) return resolve();
        this.log(`Waiting ${fmtDuration(remaining)} — will resume at ${wakeAt.toLocaleTimeString()}`);
        this._timer = setTimeout(tick, Math.min(remaining, 15 * 60 * 1000));
      };
      tick();
    });
  }

  stop() {
    this._stopped = true;
    if (this._timer) clearTimeout(this._timer);
    if (this._child) try { this._child.kill(); } catch {}
  }

  async run() {
    const o = this.opts;
    this.log(`Starting. dir="${o.dir}"  prompt="${o.prompt}"`);
    if (o.task) this.log(`Initial task: "${o.task}"`);
    if (o.session) this.log(`Resuming session: ${o.session}`);

    for (let cycle = 1; cycle <= o.maxCycles && !this._stopped; cycle++) {
      const claudeArgs = buildClaudeArgs(o, cycle);

      this._setState({ phase: "running", cycle, resetAt: null, wakeAt: null, message: "Running Claude…" });
      this.log(`Cycle ${cycle}/${o.maxCycles} — running claude…`);

      const { code, output, error } = await this._runClaude(claudeArgs);
      if (this._stopped) break;

      if (error && error.code === "ENOENT") {
        this._setState({ phase: "error", message: "`claude` not found on PATH." });
        this.log("`claude` not found on PATH. Install Claude Code: https://docs.claude.com/en/docs/claude-code");
        return { ok: false, code: 127 };
      }

      const limit = detectLimit(output);
      if (o.verbose) this.log(`detect: ${JSON.stringify({ code, ...limit })}`);

      if (!limit.hit) {
        // Auth failure first — Claude can print "Authentication failed" and STILL
        // exit 0, which must NOT be reported as a successful "task complete".
        const authErr = detectAuthError(output);
        if (authErr) {
          this._setState({ phase: "error", message: authErr });
          this.log(authErr);
          return { ok: false, code: code === -1 ? 1 : code || 1, reason: "auth" };
        }
        if (code === 0) {
          this._setState({ phase: "done", message: "Task complete — no limit hit." });
          this.log("Done — no limit hit, task complete.");
          return { ok: true, code: 0 };
        }
        this._setState({ phase: "error", message: `claude exited ${code} (not a limit error).` });
        this.log(`claude exited with code ${code} and no usage-limit marker. Stopping (not a limit error).`);
        return { ok: false, code: code === -1 ? 1 : code || 1 };
      }

      // Limit hit — schedule resume.
      let wakeAt;
      if (limit.resetAt) {
        wakeAt = new Date(limit.resetAt.getTime() + o.buffer * 1000);
        this._setState({ phase: "waiting", resetAt: limit.resetAt, wakeAt, message: `Limit hit — resuming at ${wakeAt.toLocaleTimeString()}` });
        this.log(`Usage limit hit (via ${limit.source}). Resets ${limit.resetAt.toLocaleString()} — resuming at ${wakeAt.toLocaleTimeString()} (+${o.buffer}s).`);
      } else {
        wakeAt = new Date(Date.now() + o.poll * 60 * 1000);
        this._setState({ phase: "waiting", resetAt: null, wakeAt, message: `Limit hit — retrying in ${o.poll} min` });
        this.log(`Usage limit hit but reset time unknown (${limit.source}). Retrying in ${o.poll} min.`);
      }
      await this._sleepUntil(wakeAt);
    }

    if (!this._stopped) {
      this._setState({ phase: "done", message: `Reached max cycles (${o.maxCycles}).` });
      this.log(`Reached max cycles (${o.maxCycles}). Stopping.`);
    }
    return { ok: true, code: 0 };
  }
}

module.exports = { AutoResumeEngine, buildClaudeArgs };
