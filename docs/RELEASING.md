# Releasing (maintainer guide)

How updates reach users, and how to publish a new version **without touching the terminal**.

## How updates reach users

- **Pushing to GitHub does NOT update users.** GitHub only holds the source.
- Users get updates from **npm**. Once a new version is published to npm:
  - `npx claude-resume-hub@latest` → users get the newest version automatically, every run.
  - Global installs → `npm update -g claude-resume-hub`.

So: **publishing to npm is what actually ships an update.**

## One-time setup: trusted publishing (no tokens)

This repo auto-publishes to npm from GitHub Actions using npm's **trusted publishing** (OIDC) — no npm token stored anywhere. Set it up once:

1. Go to <https://www.npmjs.com/package/claude-resume-hub/access> (Settings → **Trusted Publisher**).
2. Add a **GitHub Actions** trusted publisher:
   - **Organization/user:** `IbrahimKalemci`
   - **Repository:** `claude-resume-hub`
   - **Workflow filename:** `release.yml`
3. Save.

(That's it — no `NPM_TOKEN` secret needed.)

## Publishing a new version (zero terminal)

1. On GitHub: **Releases → Draft a new release**.
2. **Choose a tag** → type a new one, e.g. `v1.1.1` → *Create new tag on publish*.
3. Give it a title/notes → **Publish release**.

The `Publish to npm` workflow then:
- sets `package.json` version from the tag (`v1.1.1` → `1.1.1`),
- runs the tests,
- publishes to npm with provenance.

Within a minute, `npx claude-resume-hub@latest` serves the new version to everyone.

## Prefer the terminal? (optional)

```bash
npm version patch      # bumps version + creates a git tag
git push --follow-tags # pushing the tag triggers the same workflow
```
