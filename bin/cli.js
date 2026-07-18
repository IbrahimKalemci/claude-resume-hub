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
    web: false,
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
      case "-w": case "--web": opts.web = true; break;
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
  -t, --task <text>       Initial task; starts a fresh session on the first run,
                          then continues it. Omit to attach to the most recent session.
  -s, --session <id>      Resume a specific session id (instead of the most recent).
                          Find ids by running: claude --resume
  -d, --dir <path>        Working directory / project (default: current dir)
  -b, --buffer <seconds>  Safety margin added after the reset time (default: 30)
      --poll <minutes>    Retry interval if a reset time can't be determined (default: 5)
  -m, --max-cycles <n>    Max limit->wait->continue cycles (default: 100)
  -w, --web               Open a live dashboard (countdown + desktop alerts)
      --port <n>          Dashboard port (default: 4177)
      --no-open           Don't auto-open the browser for the dashboard
      --verbose           Print detection diagnostics
  -h, --help              Show this help
  -v, --version           Show version

EXAMPLES
  claude-resume-hub                 # keep the latest session going across resets
  claude-resume-hub --web           # ...with a live dashboard + desktop alerts
  claude-resume-hub -t "run all the tests and fix failures"
  claude-resume-hub -- --model opus # forward flags to claude
`);
}

const C = { cyan: "\x1b[36m", dim: "\x1b[2m", green: "\x1b[32m", yellow: "\x1b[33m", red: "\x1b[31m", reset: "\x1b[0m" };
const stamp = () => new Date().toLocaleString();

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const engine = new AutoResumeEngine(opts);

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
    const { url, error } = await startDashboard(engine, { port: opts.port, open: opts.open });
    if (url) console.log(`${C.green}[auto-resume]${C.reset} Dashboard: ${url}  (leave it open for desktop alerts)`);
    else console.log(`${C.red}[auto-resume]${C.reset} Could not start dashboard: ${error && error.message}`);
  }

  process.on("SIGINT", () => { console.log("\n[auto-resume] Interrupted. Bye."); engine.stop(); process.exit(130); });

  const result = await engine.run();
  // Keep the process (and dashboard) alive briefly so the browser sees the final state.
  if (opts.web) setTimeout(() => process.exit(result.code), 1500);
  else process.exit(result.code);
}

main().catch((err) => { console.error("[auto-resume] Fatal:", err); process.exit(1); });
