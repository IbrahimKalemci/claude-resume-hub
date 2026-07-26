# Changelog

All notable changes to this project are documented here.
This project adheres to [Semantic Versioning](https://semver.org/).

## [1.9.0] — 2026-07-26

### Added
- **Switch account (CLI + IDE), token-free.** A one-button account switch that
  changes the account Claude uses *everywhere* — the CLI and your IDE
  (Antigravity/Cursor/VS Code), which all read the default `~/.claude`. It runs
  Claude's own `claude auth logout` + `claude auth login` in one console; Claude
  owns the whole token exchange and **this app still never reads or stores your
  tokens**. `lib/account.js: switchDefault()`.
- Reorganized the Account panel: the global switch up top; the existing
  per-config-dir accounts moved under "Auto-rotation · advanced" (for unattended
  overnight rotation across your own accounts).

### Notes
- We deliberately did **not** port a credential-vault switcher (à la ClaudeSwitch)
  that stores your OAuth tokens for instant, no-prompt switching — that would
  break this project's core, audited promise never to read or store your tokens.
  The honest, token-free price is one browser confirm per switch.

## [1.8.4] — 2026-07-26

### Changed
- **Sessions show their real name, not the first line.** The Start picker (and the
  in-folder list + active-session display) now use the session's actual title —
  the `ai-title` Claude Code/IDE assigns, e.g. "Explore Fable model" — instead of a
  raw, often-useless first message like `<local-command-caveat>…` or "ok". Falls
  back to the first message, then the id, when a session has no title.
  `lib/sessions.js: sessionTitle()`.

## [1.8.3] — 2026-07-26

### Added
- **Start → "which session?" picker.** Pressing Start now shows a modal of your
  most-recently-active sessions across **every** project (Claude Code, IDE,
  terminal — anything under `~/.claude/projects`), each with its folder, last
  activity, prompt count and a preview. Pick one and it resumes that exact
  conversation from where it left off — so choosing a folder is no longer the only
  lever, and there's no ambiguity about which session continues. A brand-new
  session skips the picker. `lib/sessions.js: recentSessions()`.

## [1.8.2] — 2026-07-26

### Changed / the app handles the conflict itself
- **Session busy in your IDE → wait and grab (instead of skip).** When the session
  you want to resume is being actively driven by another Claude client (Antigravity
  / Cursor / another terminal), the app no longer just gives up — it's the app's
  job to get the continue through. It now **waits for that client to go quiet**
  (it hit its own limit, finished, or you closed it) and then resumes, polling in
  the background. Capped at 30 min of continuous other-client activity, after which
  it reports clearly rather than fighting an in-use session. Supersedes 1.8.1's
  hard skip.
- **Stall recovery.** If a resume ever stalls with no output for the whole watchdog
  window, the app auto-approves tools and retries once so the task actually
  finishes instead of silently doing nothing (`autoApproveOnStall`, on by default,
  toggle in Settings). A safety net for hands-off runs.

## [1.8.1] — 2026-07-26

### Fixed
- **The #1 real-world failure: resuming a session that's open in your IDE.** If a
  session is held open by another Claude client (Antigravity / Cursor / VS Code /
  another terminal), two clients fight over one conversation — it hangs, the
  watchdog kills it, and the reset is wasted (the recurring "I left it overnight
  and nothing happened"). The active-session guard is now a **hard skip**: it
  samples the transcript's mtime twice ~2.5s apart, and if the file is being
  written **right now** by another client, it refuses to resume that session and
  says so clearly — instead of the old soft warning that still tried and hung.
  (A truly stopped/closed session is unaffected and resumes normally.)
  New `sessionMtimeMs()`; the run is logged with a `skipped` outcome.

## [1.8.0] — 2026-07-26

### Added
- **"Walk away" preset** — one click sets the full set-and-forget flow (continue +
  smart + watch + unattended) so the headline scenario works without hunting for
  toggles. A `reset` link clears it. It configures the controls (doesn't
  auto-start), so the Unattended warning stays visible before you commit.
- **Local usage analytics (token-free)** — a tile showing tokens used **this
  session** and in the **last 24h**, summed from the `message.usage` counts in
  your own transcripts. No credentials, no account calls — and it's honest about
  what it can't show: this is consumption, **not** your plan's quota/percent.
  `lib/usage.js`. Cache-read tokens are tracked separately (they're re-counted
  every turn) so the headline number stays meaningful.

### Fixed / robustness (cross-platform)
- **macOS binary now runs on Apple Silicon** — the SEA build is ad-hoc codesigned
  after `postject` (an unsigned/invalid binary is SIGKILLed on launch on arm64).
- **`killTree` no longer orphans `claude` on macOS/Linux** — the child is spawned
  in its own process group and the whole group is killed (previously only the
  shell wrapper died, leaving `claude` running — the very thing the function
  promises to prevent). Unchanged on Windows (`taskkill /T`).
- **Hang-guard is less trigger-happy** — the no-output watchdog default is now
  **10 min** (was 4), and configurable via `--stuck-minutes`, so a long silent
  tool (a big test run/build) isn't mistaken for a hang.
- `postject` is now a pinned devDependency (reproducible SEA builds).

## [1.7.1] — 2026-07-26

Hardening release after a 6-auditor + 5-advisor review of the 1.7.0 features.

### Security
- **Fixed a stored XSS that could reach code execution.** The History (and queue/
  session/account) rows rendered untrusted strings — Claude's own transcript text,
  task strings, filenames — via `innerHTML`. A crafted assistant message could
  inject markup that reached `window.api` and launched `claude
  --dangerously-skip-permissions`. All dynamic rows now build DOM with
  `textContent`; the renderer's inline script was moved to `renderer.js` and
  `script-src 'unsafe-inline'` was dropped (now `'self'`).
- **Electron hardened:** `sandbox: true`; `openExternal` only opens http(s) URLs;
  new-window and in-page navigation are denied.

### Fixed
- A run **stopped by the user** (Stop / quit) no longer reports success. It
  returned `{ok:true}`, so account rotation read it as a win and silently switched
  the active account on Stop, and the queue logged a false "Done".
- **Watch mode** no longer misses a real limit when a `tool_result` line follows
  the `rate_limit` entry in the transcript (it was masking the limit).
- **Multi-account rotation** now applies only to account-independent **task** jobs;
  a specific-session resume stays on its own account (sessions live per
  `CLAUDE_CONFIG_DIR`, so `--resume <id>` on another account would open the wrong
  conversation).

### Changed
- Multi-account rotation is labelled **experimental** in the UI, with a note that
  it is for your own separate accounts and applies to new tasks.

## [1.7.0] — 2026-07-25

### Added
- **Watch mode** — sit in the tray and detect a usage limit you hit in your OWN
  Claude window by reading the transcript's structured `error:"rate_limit"`
  entry (no `claude` calls, no quota, no tokens). On detect, the resume is
  scheduled for the exact reset time. The true set-and-forget path — you don't
  have to be at the machine when the limit lands.
- **Multi-account rotation** — when one account hits its limit, rotate to
  another signed-in account and keep going instead of waiting hours. Each
  account is its own `CLAUDE_CONFIG_DIR` that Claude itself signed into; the app
  sets the env var per run and **never reads the credentials**. Only wait — for
  the soonest reset — if *every* account is limited. Manage accounts + a
  "Rotate when limited" toggle in Settings.
- **Run history + "what it did" summary** — every finished run is logged (when,
  project, outcome, how long it waited, and Claude's last message read locally
  from the transcript), shown as a collapsible History panel; the summary is
  also echoed into the Activity log on success.

### Fixed
- **Active-session guard** — before resuming a specific session whose transcript
  was written seconds ago (i.e. it's open in another Claude window), the app now
  warns that resuming it can hang — the footgun behind a resume that "did
  nothing" (two clients fighting over one conversation). The stuck-watchdog
  remains the backstop.

## [1.6.0] — 2026-07-21

### Added
- **Unattended mode** (`--unattended` / a toggle in the app): auto-approves all
  tools (`--dangerously-skip-permissions`) so a resumed task actually *finishes*
  headless instead of hanging on a permission prompt. Opt-in, clearly warned.
- **Stats**: the app tracks how many times it auto-resumed and how much waiting it
  saved you (sum of wait durations), shown as a live tile. `lib/stats.js`.
- **Limit pre-check on Start**: a plain resume now first checks whether a usage
  limit is actually active. If not, it tells you ("no active limit — nothing to
  wait for") instead of quietly running "continue". `probeLimit()`.
- **Bilingual UI (English / Türkçe)** with a language switcher in Settings; the
  choice is persisted. Static labels + the main dynamic strings are translated.

### Changed
- Desktop `.exe` is smaller (~70MB → ~64MB) via `compression: maximum` and shipping
  only the en-US locale.

### Fixed
- **"Give it a task" now actually runs.** A custom task was being treated like a
  plain "continue" resume and swallowed by the "no active limit" pre-check, so it
  reported "nothing to wait for" and never sent the instruction to Claude. A task
  is an instruction to run *now* and is no longer gated on an active limit.
- **"Smart resume" now works in the desktop app.** The toggle (on by default) was a
  no-op in the GUI — smart context-building lived only in the CLI, so the app always
  sent a bare "continue". The recap-building is now shared, so the app resumes from
  your last step exactly like `--smart` on the CLI.

## [1.5.0] — 2026-07-20

### Added (desktop app)
- **Phone / chat alerts** — optional outgoing notifications to a webhook
  (Discord/Slack/ntfy/any) and/or your own Telegram bot on limit / resume / done /
  error, with a "Send test" button. Outgoing only; still reads no credentials.
- **Multi-project queue** — add several projects and they resume **sequentially**
  on the single account-level reset clock (parallel would just re-burn the reset
  budget). Per-project status in the UI.
- **Live Claude output** — the app streams Claude's actual text into the Activity
  log, so you can see what it did (including while you were away).
- **Update banner** — a read-only GitHub Releases check shows a "Download" banner
  when a newer version exists (no auto-install, no auth).
- **Fix:** an auth failure ("Authentication failed / sign in again") that Claude
  Code can print while still exiting 0 was being reported as a successful "task
  complete". It's now detected and surfaced as a clear error — "run `claude auth
  login`, then start again" — with a notification; in a queue it stops all projects (the
  same account auth is broken for every one).
- Decision recorded: usage-% bars for other accounts are intentionally NOT added —
  there's no token-free source, and reading the OAuth token would break the audited
  "never reads your tokens" promise. Surfaced that promise as a shield in the UI.

## [1.4.2] — 2026-07-20

### Changed
- Release assets are now the **raw executables** (`claude-resume-hub-windows-x64.exe`,
  and the macOS/Linux binaries) instead of `.zip` archives — download and run, no unzip step.

## [1.4.0] — 2026-07-20

### Added
- **Standalone executables.** `npm run build:exe` (Node SEA + esbuild) produces a
  `claude-resume-hub` binary that runs without Node installed. CI now builds one
  per OS (Windows/macOS-arm64/Linux) and attaches them to each GitHub Release, so
  users can `npx` **or** download an .exe. (The exe still needs the `claude` CLI on PATH.)
- **`--tray`** — a genuine Windows system-tray icon (zero bundled deps, via a
  PowerShell NotifyIcon shim that rides built-in .NET): colours by phase, balloon
  notifications, right-click menu [Open dashboard, Quit]. Implies `--web`; on
  macOS/Linux it falls back to the browser dashboard. Self-exits when the run ends.
- **`--smart`** — context-aware resume. Reads the session's last step from the
  transcript (locally, no AI/network) and nudges Claude to pick up exactly there,
  and to say so if the task is already done rather than invent new work (so a
  fresh window isn't wasted). Falls back to plain "continue".
- Dashboard `/status` JSON endpoint (what the tray polls).

### Changed
- **Reliable resume (pin-and-track).** On a plain run the CLI now resolves the
  active session, **pins its id**, prints it, and resumes with `--resume <id>`
  every cycle instead of a blind `-c` — killing the footgun where "most recent"
  silently switched to the wrong session. Override with `--list` / `--session`.
- `--list` turn counts are now real human-prompt counts (tool traffic no longer inflates them).
- Clearer `--task`: it starts a **new** session, and the CLI now prints a note
  saying so (with resume alternatives) — real users hit `-t` expecting it to
  continue an existing session. `--help` wording sharpened.
- `parseClockTime` is clock-injectable (deterministic, midnight-safe tests).

### Notes
- Antigravity auto-resume is intentionally **not** supported: its state is opaque
  protobuf with no on-disk limit signal and a different (Google) quota system.
  This tool scopes to Claude Code, where resume is reliable.
- Rolls up everything since 1.2.0 (the 1.3.x work was never published to npm).

## [1.2.0] — 2026-07-18

### Added
- `-l, --list` — list this project's Claude Code sessions (newest first) with
  their ids, last-used time, turn count, size, and a preview of the first
  message. Marks the one plain `-c` resumes. Pair it with `--session <id>` to
  resume an exact one.

## [1.1.0] — 2026-07-18

### Added
- `-s, --session <id>` — resume a **specific** session instead of only the most
  recent one in the folder. Find ids with `claude --resume`.
- Automated npm publishing via GitHub Actions on release (npm trusted publishing
  / OIDC — no stored token). See `docs/RELEASING.md`.

## [1.0.0] — 2026-07-18

### Added
- Auto wait-and-resume loop around the Claude Code CLI (`claude -c -p`) that
  continues automatically the moment a usage/session limit resets.
- Robust limit detection via the machine-readable
  `Claude AI usage limit reached|<unix_timestamp>` marker (exact, timezone-proof),
  with human-prose (`resets 3:45pm`) and periodic-poll fallbacks.
- Live `--web` dashboard (zero-dependency, Server-Sent Events): big countdown,
  status pill, streaming log, and desktop notifications on limit / resume / complete.
- Cross-platform support (Windows, macOS, Linux); zero-install via `npx`.
- `node:test` unit suite for detection logic.

### Notes
- A non-zero exit without a limit marker is treated as a real error (auth,
  network, bad flags) and stops the loop instead of retrying forever.
