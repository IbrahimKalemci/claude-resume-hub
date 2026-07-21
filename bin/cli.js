#!/usr/bin/env node
"use strict";

/**
 * claude-auto-resume — run Claude Code and auto-continue the moment a usage/
 * session limit resets. Optional live dashboard with desktop notifications.
 *
 * Zero dependencies. Windows / macOS / Linux.
 */

const { AutoResumeEngine } = require("../lib/engine");
const { startDashboard } = require("../lib/dashboard");
const VERSION = require("../package.json").version;

function parseArgs(argv) {
  const opts = {
    prompt: "continue",
    task: null,
    session: null,
    dir: process.cwd(),
    buffer: 30,
    poll: 5,
    maxCycles: 100,
    verbose: false,
    list: false,
    smart: false,
    unattended: false,
    web: false,
    tray: false,
    port: 4177,
    open: true,
    passthrough: [],
  };
  const args = [...argv];
  const sep = args.indexOf("--");
  if (sep !== -1) { opts.passthrough = args.splice(sep + 1); args.splice(sep, 1); }

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = () => args[++i];
    switch (a) {
      case "-p": case "--prompt": opts.prompt = next(); break;
      case "-t": case "--task": opts.task = next(); break;
      case "-s": case "--session": opts.session = next(); break;
      case "-d": case "--dir": opts.dir = next(); break;
      case "-b": case "--buffer": opts.buffer = parseInt(next(), 10); break;
      case "--poll": opts.poll = parseInt(next(), 10); break;
      case "-m": case "--max-cycles": opts.maxCycles = parseInt(next(), 10); break;
      case "-l": case "--list": opts.list = true; break;
      case "--smart": opts.smart = true; break;
      case "--unattended": case "--yolo": opts.unattended = true; break;
      case "-w": case "--web": opts.web = true; break;
      case "--tray": opts.tray = true; opts.web = true; break;
      case "--port": opts.port = parseInt(next(), 10); break;
      case "--no-open": opts.open = false; break;
      case "--verbose": opts.verbose = true; break;
      case "-h": case "--help": printHelp(); process.exit(0);
      case "-v": case "--version": console.log(VERSION); process.exit(0);
      default:
        console.error(`Unknown option: ${a}\nRun with --help for usage.`);
        process.exit(2);
    }
  }
  return opts;
}

function printHelp() {
  console.log(`
claude-resume-hub v${VERSION}

Run Claude Code and auto-continue the moment a usage/session limit resets.

USAGE
  claude-resume-hub [options] [-- <extra claude args>]

OPTIONS
  -p, --prompt <text>     Message sent to continue after a reset (default: "continue")
  -t, --task <text>       Start a NEW session with this task (NOT for resuming an
                          existing one). To continue your stopped session, omit -t
                          and use plain run / --smart / --session instead.
  -s, --session <id>      Resume a specific session id (instead of the most recent).
                          Find ids by running: claude --resume
  -d, --dir <path>        Working directory / project (default: current dir)
  -b, --buffer <seconds>  Safety margin added after the reset time (default: 30)
      --poll <minutes>    Retry interval if a reset time can't be determined (default: 5)
  -m, --max-cycles <n>    Max limit->wait->continue cycles (default: 100)
  -l, --list              List Claude Code sessions in this project and exit
      --smart             Context-aware resume: reads the session's last step and
                          nudges Claude to pick up exactly there (instead of a bare
                          "continue"). Reads the transcript locally; no AI/network.
      --unattended        Auto-approve ALL tools (--dangerously-skip-permissions) so
                          a resumed task finishes headless instead of hanging on a
                          prompt. Bypasses every permission check — use with care.
  -w, --web               Open a live dashboard (countdown + desktop alerts)
      --tray              Run a system-tray icon (Windows; implies --web). On
                          macOS/Linux this falls back to the browser dashboard.
      --port <n>          Dashboard port (default: 4177)
      --no-open           Don't auto-open the browser for the dashboard
      --verbose           Print detection diagnostics
  -h, --help              Show this help
  -v, --version           Show version

EXAMPLES
  claude-resume-hub                 # keep the latest session going across resets
  claude-resume-hub --web           # ...with a live dashboard + desktop alerts
  claude-resume-hub --tray          # background system-tray icon (Windows)
  claude-resume-hub --list          # see this project's sessions and their ids
  claude-resume-hub --web --smart   # context-aware resume (picks up your last step)
  claude-resume-hub -s <id>         # resume a specific session id
  claude-resume-hub -t "run all the tests and fix failures"
  claude-resume-hub -- --model opus # forward flags to claude
`);
}

const C = { cyan: "\x1b[36m", dim: "\x1b[2m", green: "\x1b[32m", yellow: "\x1b[33m", red: "\x1b[31m", reset: "\x1b[0m" };
const stamp = () => new Date().toLocaleString();

function printSessions(dir) {
  const { listSessions, findProjectFolder } = require("../lib/sessions");
  if (!findProjectFolder(dir)) {
    console.log(`No Claude Code sessions found for:\n  ${dir}`);
    console.log(`${C.dim}(Looked in ~/.claude/projects. Run this in your project folder, or pass -d <path>.)${C.reset}`);
    return;
  }
  const sessions = listSessions(dir);
  if (!sessions.length) { console.log("No sessions in this project yet."); return; }

  console.log(`\nClaude Code sessions for ${C.cyan}${dir}${C.reset}  ${C.dim}(newest first)${C.reset}\n`);
  sessions.forEach((s, i) => {
    const dot = i === 0 ? `${C.green}●${C.reset}` : " ";
    console.log(`${dot} ${s.id}`);
    console.log(`   ${C.dim}${s.mtime.toLocaleString()} · ${s.turns} turns · ${s.sizeKB} KB${C.reset}`);
    if (s.preview) console.log(`   ${C.dim}"${s.preview}${s.preview.length >= 80 ? "…" : ""}"${C.reset}`);
    console.log("");
  });
  console.log(`${C.green}●${C.reset} ${C.dim}= what plain "continue" (-c) resumes (the most recent).${C.reset}`);
  console.log(`${C.dim}Resume a specific one:  ${C.reset}crh --session <id>`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.list) {
    printSessions(opts.dir);
    process.exit(0);
  }

  // --task starts a fresh session; warn so people don't use it expecting a resume.
  if (opts.task) {
    console.log(`${C.yellow}[auto-resume] Note: --task starts a NEW session with this task — it does NOT resume an existing one.${C.reset}`);
    console.log(`${C.dim}   To continue your existing (stopped) session instead, run without -t:  claude-resume-hub --smart   (or pick one with --list / --session)${C.reset}`);
  }

  // Pin the target session up front so every cycle resumes the SAME conversation.
  // Plain "-c" means "most recent by mtime" and can silently switch to the wrong
  // session (the tool's own prior run, or a second terminal). Resolving + pinning
  // a concrete id, and printing it, makes resume predictable.
  if (!opts.session && !opts.task) {
    const { pickActiveSession } = require("../lib/sessions");
    const active = pickActiveSession(opts.dir);
    if (active) {
      opts.session = active.id;
      console.log(`${C.cyan}[auto-resume]${C.reset} Resuming session ${C.green}${active.id}${C.reset}`);
      console.log(`${C.dim}   last activity ${active.mtime.toLocaleString()} · ${active.turns} prompts${active.preview ? ` · "${active.preview.slice(0, 48)}…"` : ""}${C.reset}`);
      console.log(`${C.dim}   not this one? →  claude-resume-hub --list   then   --session <id>${C.reset}`);
    } else {
      console.log(`${C.dim}[auto-resume] No prior session found here — will use "claude -c" (most recent).${C.reset}`);
    }
  }

  // --smart: build a context-aware resume prompt from the session's last step.
  if (opts.smart && !opts.task) {
    const { sessionRecap } = require("../lib/sessions");
    const recap = sessionRecap(opts.dir);
    if (recap) {
      opts.prompt =
        `Continue where you left off and finish the task you were working on. ` +
        `If it is already complete, say so instead of inventing new work. ` +
        `For context, your last message was: "${recap.slice(0, 300)}${recap.length > 300 ? "…" : ""}"`;
      console.log(`${C.dim}[auto-resume] smart mode: resuming with context from your last step.${C.reset}`);
    } else {
      console.log(`${C.dim}[auto-resume] smart mode: no prior session found — using plain "continue".${C.reset}`);
    }
  }

  const engine = new AutoResumeEngine(opts);
  let trayChild = null;
  const cleanup = () => { if (trayChild) { try { trayChild.kill(); } catch {} trayChild = null; } };

  // Colorize a few known log lines for the terminal.
  engine.on("log", (line) => {
    let color = C.cyan;
    if (/^Done|complete/i.test(line)) color = C.green;
    else if (/limit hit|Waiting|Retrying/i.test(line)) color = C.yellow;
    else if (/not found|error|Stopping/i.test(line)) color = C.red;
    console.log(`${color}[auto-resume ${stamp()}]${C.reset} ${line}`);
  });
  engine.on("output", (chunk) => process.stdout.write(chunk));

  if (opts.web) {
    // When running the tray, don't also pop a browser tab — the tray is the UI.
    const { url, error } = await startDashboard(engine, { port: opts.port, open: opts.open && !opts.tray });
    if (url) {
      console.log(`${C.green}[auto-resume]${C.reset} Dashboard: ${url}  (leave it open for desktop alerts)`);
      if (opts.tray) {
        const { startTray } = require("../lib/tray");
        const t = startTray(url);
        if (t.ok) { trayChild = t.child; console.log(`${C.green}[auto-resume]${C.reset} Tray icon started — check your system tray; right-click for options.`); }
        else console.log(`${C.yellow}[auto-resume]${C.reset} Tray unavailable (${t.reason}); the dashboard is still at ${url}`);
      }
    } else {
      console.log(`${C.red}[auto-resume]${C.reset} Could not start dashboard: ${error && error.message}`);
    }
  }

  process.on("SIGINT", () => { console.log("\n[auto-resume] Interrupted. Bye."); cleanup(); engine.stop(); process.exit(130); });

  const result = await engine.run();
  // Keep the process (and dashboard) alive briefly so the browser sees the final
  // state; the tray self-exits once /status stops responding, but kill it too.
  if (opts.web) setTimeout(() => { cleanup(); process.exit(result.code); }, 1500);
  else { cleanup(); process.exit(result.code); }
}

main().catch((err) => { console.error("[auto-resume] Fatal:", err); process.exit(1); });
