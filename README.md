<h1 align="center">claude-resume-hub</h1>

<p align="center">
  <b>Never babysit a Claude Code usage limit again.</b><br>
  Run Claude Code, and when you hit a usage/session limit it <b>waits until the exact reset time and continues automatically</b> — with a live dashboard and desktop alerts so you can walk away entirely.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/claude-resume-hub"><img src="https://img.shields.io/npm/v/claude-resume-hub?color=c96442" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/claude-resume-hub"><img src="https://img.shields.io/npm/dm/claude-resume-hub?color=c96442" alt="npm downloads"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D16-3fb950" alt="node >= 16">
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-8b93a7" alt="platforms">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
</p>

<p align="center">
  <img src="docs/dashboard.svg" alt="claude-resume-hub live dashboard: a large countdown timer, status pill, and streaming log" width="640">
</p>

> **Hit a limit at 2am? Wake up to a finished task.**

```bash
npx claude-resume-hub --web
```

That one command works on **Windows, macOS, and Linux**. No install, no dependencies, no config.

---

## Table of contents

- [Why this exists](#why-this-exists)
- [Install](#install)
- [Quick start](#quick-start)
- [The live dashboard](#the-live-dashboard---web)
- [Usage & examples](#usage--examples)
- [Options](#options)
- [How it works](#how-it-works)
- [Troubleshooting](#troubleshooting)
- [FAQ](#faq)
- [Requirements](#requirements)
- [Prior art](#prior-art)
- [Contributing](#contributing)
- [License](#license)

---

## Why this exists

When Claude Code hits your subscription limit, it prints something like:

```
Claude AI usage limit reached|1784376612
```

…and then it **stops**. It won't wait and continue on its own — you have to come back and type `continue`. If your window resets at 3am, your work just sits idle until you're back at the keyboard.

**claude-resume-hub** wraps the Claude Code CLI, detects the limit, reads the **exact reset time** straight from the message, sleeps until then, and continues for you — looping until the task is actually done. Optionally it opens a live dashboard that counts down and fires a desktop notification the moment your task starts moving again.

---

## Install

### Prerequisites

1. **[Claude Code](https://docs.claude.com/en/docs/claude-code)** installed and on your `PATH`, and **logged in with your Pro/Max subscription**. Check with:
   ```bash
   claude --version
   ```
2. **Node.js ≥ 16** — you already have it if Claude Code is installed. Check with:
   ```bash
   node --version
   ```

### Option A — Run instantly with npx (recommended)

No installation needed. Just run it from your project folder:

```bash
npx claude-resume-hub --web
```

### Option B — Install globally

If you'll use it often, install it once to get the short `crh` command:

```bash
npm install -g claude-resume-hub
```

Then from any project:

```bash
claude-resume-hub --web     # or the short alias:
crh --web
```

Verify the install:

```bash
crh --version
crh --help
```

---

## Quick start

1. Open a terminal **in your project folder** (the same folder where you use Claude Code).
2. Start a task with Claude Code as usual, or let this tool drive it. The simplest flow:

   ```bash
   # Attach to your most recent Claude Code session and keep it alive across limits:
   npx claude-resume-hub --web
   ```

3. A dashboard opens in your browser. Click **“Enable alerts”** once so it can send desktop notifications.
4. Walk away. When you hit a limit, the countdown starts; when the window resets, Claude continues automatically and you get a notification.

That's it. 🎉

---

## The live dashboard (`--web`)

Most tools for this are terminal-only. Add `--web` and you get a **live local dashboard**:

- ⏱️ **Big countdown** to the exact resume time
- 🔔 **Desktop notifications** when the limit is hit, when it resumes, and when the task completes
- 📜 **Live streaming log** and a cycle counter
- 🔒 Runs entirely on `localhost` — nothing leaves your machine, zero dependencies

```bash
npx claude-resume-hub --web
```

Leave the tab open and go do something else. It'll ping you the moment your task is moving again.

---

## Usage & examples

```bash
# Keep the latest session in this folder going across limit resets:
npx claude-resume-hub

# ...with the live dashboard + desktop alerts:
npx claude-resume-hub --web

# Kick off a brand-new long task and let it ride through every limit until done:
npx claude-resume-hub --web -t "refactor the auth module and run the full test suite"

# Point at a specific project folder:
npx claude-resume-hub --web -d "C:\path\to\project"

# Forward extra flags straight to claude (everything after -- goes to claude):
npx claude-resume-hub -- --model opus
```

---

## Options

| Flag | Default | Description |
|------|---------|-------------|
| `-p, --prompt <text>` | `continue` | Message sent to resume the session after a reset |
| `-t, --task <text>` | — | Initial task; starts a fresh session on the first run, then continues it |
| `-d, --dir <path>` | current dir | Working directory / project |
| `-w, --web` | off | Open the live dashboard with desktop alerts |
| `--port <n>` | `4177` | Dashboard port |
| `--no-open` | | Don't auto-open the browser (just print the URL) |
| `-b, --buffer <seconds>` | `30` | Safety margin added after the reset time before resuming |
| `--poll <minutes>` | `5` | Retry interval if a reset time can't be determined |
| `-m, --max-cycles <n>` | `100` | Max limit → wait → continue cycles |
| `--verbose` | | Print detection diagnostics |
| `-h, --help` | | Show help |
| `-v, --version` | | Show version |

---

## How it works

```
┌─ run  claude -c -p "continue"   (output streams live)
│
├─ scan output for a usage-limit signal
│     ├─ no limit + clean exit ─────────────▶  task complete ✅
│     ├─ no limit + error exit ─────────────▶  stop & surface it (auth/network/…)
│     └─ limit hit:
│           ├─ "…limit reached|<epoch>"  ──▶  exact reset time  ┐
│           ├─ "resets 3:45pm"           ──▶  parsed clock time ├─▶ sleep till then (+buffer)
│           └─ limit phrase, no time     ──▶  poll every N min  ┘
│
└─ wake up ──▶ loop   (dashboard + notifications reflect every step)
```

Detection is layered for reliability. The primary signal is the machine-readable marker Claude emits — `Claude AI usage limit reached|<unix_timestamp>` — which gives an **exact, timezone-proof** reset time. If that's absent, it falls back to parsing human prose (`resets 3:45pm`), and finally to periodic polling.

Crucially, a non-zero exit **without** a limit marker is treated as a real error (auth, network, bad flags) and **stops** the loop — so it never spins forever on a genuine failure.

---

## Troubleshooting

**`claude: command not found` / `claude not found on PATH`**
Claude Code isn't installed or isn't on your PATH. Install it and confirm `claude --version` works in the same terminal.

**It says "task complete" immediately without doing anything**
`-c` continues the **most recent** session *in the current folder*. Make sure you run the tool in the same project directory where you use Claude Code, or pass `-d /path/to/project`. If there's no prior session, use `-t "your task"` to start one.

**Desktop notifications don't fire**
Click **“Enable alerts”** in the dashboard once to grant permission, and keep the dashboard tab open — notifications are sent from that page.

**`--web` says the port is in use**
Another process holds port 4177. Pick another: `--port 4188`.

**It waited ~24h instead of a few minutes**
Older bug — fixed. If the reset time has just passed, it now resumes promptly instead of assuming tomorrow. Make sure you're on the latest version (`crh --version`).

**Corporate proxy / it loops on an error**
If Claude exits non-zero for a reason other than a usage limit (e.g. network/auth), the tool stops and prints the exit code rather than retrying. Fix the underlying `claude` issue first.

---

## FAQ

**Does this use my API key / cost extra?**
No. It just runs the `claude` CLI you already use. If you're on a Pro/Max subscription (not `--bare` API-key mode), it handles your **subscription** session/weekly limits.

**Does my computer need to stay on?**
Yes — it sleeps locally until the reset time, so the machine must be awake to wake it back up.

**Is any of my data sent anywhere?**
No. The dashboard runs on `localhost` and the tool has zero network dependencies of its own.

**Will it run forever?**
It stops when the task completes, when a non-limit error occurs, or after `--max-cycles` (default 100) resets.

---

## Requirements

- [Claude Code](https://docs.claude.com/en/docs/claude-code) installed, on `PATH`, logged in with a Pro/Max subscription.
- Node.js ≥ 16 (ships with Claude Code anyway).
- The machine left awake so it can resume at reset time.

---

## Prior art

Inspired by the bash community tools, notably [terryso/claude-auto-resume](https://github.com/terryso/claude-auto-resume). This project aims to be the **cross-platform, `npx`-friendly, dashboard-equipped** take that also serves Windows users. Related upstream request: [anthropics/claude-code#36320](https://github.com/anthropics/claude-code/issues/36320).

---

## Contributing

Issues and PRs welcome! Please keep it small and dependency-free. Run the tests with:

```bash
npm test
```

---

## License

[MIT](LICENSE) © Ibrahim Kalemci
