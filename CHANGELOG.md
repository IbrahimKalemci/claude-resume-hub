# Changelog

All notable changes to this project are documented here.
This project adheres to [Semantic Versioning](https://semver.org/).

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
