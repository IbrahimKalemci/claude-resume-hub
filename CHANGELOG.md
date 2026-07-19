# Changelog

All notable changes to this project are documented here.
This project adheres to [Semantic Versioning](https://semver.org/).

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
