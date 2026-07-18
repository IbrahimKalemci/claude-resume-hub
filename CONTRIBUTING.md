# Contributing to claude-resume-hub

Thanks for your interest! 🎉 This is a small, intentionally **dependency-free** tool — contributions that keep it that way are the most welcome.

## Ground rules

- **No runtime dependencies.** The whole point is `npx`-instant, zero-install. Please don't add packages to `dependencies`.
- **Cross-platform.** It must work on Windows, macOS, and Linux. Avoid shell-specific tricks; prefer Node APIs.
- **Keep it small and readable.** Match the existing style.

## Getting started

```bash
git clone https://github.com/IbrahimKalemci/claude-resume-hub.git
cd claude-resume-hub
node bin/cli.js --help     # run it
npm test                   # run the test suite (node --test)
```

Project layout:

```
bin/cli.js        # CLI entry (arg parsing, terminal output)
lib/detect.js     # usage-limit detection (unit-tested)
lib/engine.js     # the wait-and-resume loop (EventEmitter)
lib/dashboard.js  # zero-dep localhost dashboard (SSE + HTML)
test/             # node:test unit tests
```

## Making a change

1. Fork and create a branch: `git checkout -b my-fix`.
2. Make your change. If you touch detection logic in `lib/detect.js`, **add or update a test** in `test/`.
3. Run `npm test` and make sure everything passes.
4. Open a pull request with a clear description of the problem and the fix.

## Reporting bugs

Open an issue with:
- Your OS and `node --version` / `claude --version`
- The exact command you ran
- What you expected vs. what happened (paste output, with the `--verbose` flag if possible)

## Ideas & features

Feature requests are welcome — open an issue describing the use case. Bonus points if it stays dependency-free. 🙌
