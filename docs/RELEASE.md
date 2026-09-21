# Maintainer release checklist

This package has **not** been published. No `npm publish` (or
`--dry-run` variant that talks to npm as the owner) has been run — that
step is left to the owner, on the owner's machine, with the owner's npm
credentials.

## Resolved during release preparation

- [x] **Package name**: `csp-safe-slider`, unscoped, confirmed available.
      Last checked **2026-09-21 09:04:55 UTC**: HTTP `404`,
      body `{"error":"Not found"}` from
      `https://registry.npmjs.org/csp-safe-slider`. **This is stale by the
      time you read it — recheck immediately before publishing** (see
      below).
- [x] **Copyright/ownership for `LICENSE`**: set to "Saurav Kaushik" (2026),
      taken from this repository's own `git config user.name`/`user.email`
      and matching commit authorship — not invented.
- [x] **`package.json` `repository`/`bugs`/`homepage`**: set from the
      repository's actual `origin` remote
      (`github.com/dev-saurav61295/csp-safe-slider`).
- [x] **`author`**: set to "Saurav Kaushik" for the same reason as the
      license holder above.
- [x] **`version`**: set to `1.0.0`. All mandatory automated release gates
      pass with zero skips (119/119 — see
      [VALIDATION_REPORT.md](VALIDATION_REPORT.md)), the public API
      surface is intentionally stable, and the previously-open WebKit
      mouse-drag test gap was closed (it turned out to be a stale
      assumption from an earlier Playwright/WebKit build combination, not
      a real product limitation — re-verified passing 3x in a row across
      all three browsers). The one thing still genuinely incomplete —
      real assistive-technology manual testing — is an ongoing-practice
      item rather than a mandatory behavior gap in the shipped code, and
      is called out explicitly below and in
      `COMPATIBILITY.md`/`ACCESSIBILITY.md` rather than silently assumed
      done.
- [x] **CI**: `.github/workflows/ci.yml` runs install → lint → typecheck
      → unit tests → build on every push/PR to `main` (matrixed across
      Node 18.x/20.x/22.x), then verifies the built package once (Node
      20.x) via the full Playwright suite (Chromium, Firefox, WebKit,
      including CSP tests) and separately via SSR-import and
      packed-tarball verification. It never publishes anything.
- [x] **`publishConfig`**: `{ "access": "public", "registry":
"https://registry.npmjs.org/" }` added — defensive metadata for an
      unscoped package, not strictly required, but explicit.

## Still open — owner decisions/actions needed

- [ ] **npm auth**: `npm login` (interactive, 2FA) or an `NPM_TOKEN` for
      CI. Not performed here — no credentials were touched, requested, or
      should ever be pasted into an agent session.
- [ ] **`--provenance` for `npm publish`**: add it once publishing runs
      inside the `.github/workflows/ci.yml` GitHub Actions environment
      with OIDC, for supply-chain attestation. Not required for a manual
      publish from the owner's machine.

- [ ] **Real assistive-technology verification**: see the pending
      checklist in [ACCESSIBILITY.md](ACCESSIBILITY.md#manual-verification-checklist)
      (VoiceOver, NVDA, TalkBack, real zoomed layouts, real forced-colors
      mode). Automated `axe-core` scans pass; they don't substitute for
      this.
- [ ] **Recheck the package name immediately before publishing** — the
      check above is already stale. Re-run:

  ```sh
  npm view csp-safe-slider name version --registry=https://registry.npmjs.org/
  ```

  An `E404` is real evidence of absence. A timeout, auth error, or empty
  search result is not — retry the exact command rather than trusting an
  ambiguous result. If the name is now taken and not owned by you,
  **stop** — do not rename automatically or publish under a different
  identity without updating every reference (`package.json`, imports,
  docs, tests, consumer fixtures) consistently first.

## Pre-publish verification (run these, don't skip)

```sh
npm ci
npm run lint --if-present
npm run typecheck --if-present
npm test
npm run build
npm run test:browser   # requires: npx playwright install chromium firefox webkit (one-time)
npm run test:ssr
npm run test:pack
npm pack --dry-run
```

Expected `npm pack --dry-run` contents (verified during release prep, 12
files, ~63.1 kB packed / ~259.4 kB unpacked): `dist/` (JS × 2 formats +
sourcemaps, `.d.ts` × 2, both CSS files), `README.md`, `LICENSE`,
`CHANGELOG.md`, plus the auto-included `package.json`. `src/`, `tests/`,
`examples/`, `docs/`, and config files are excluded via the `files`
allow-list in `package.json` — verify this list hasn't silently grown to
include something unintended (a stray `.env`, a local log) before every
publish, since `files` allow-listing is the actual safety mechanism here,
not `.npmignore` (none exists, by design).

## Publishing (owner only, on the owner's machine)

```sh
PACKAGE_DIR="/absolute/path/to/csp-safe-slider"
cd "$PACKAGE_DIR"

node --version
npm --version
npm config get registry

npm login
npm whoami

npm pkg get name version private publishConfig

npm ci
npm run lint --if-present
npm run typecheck --if-present
npm test
npm run build

npm pack --dry-run
npm publish --dry-run

npm view csp-safe-slider name version --registry=https://registry.npmjs.org/
```

For a first release, that final `npm view` is expected to return `E404` —
confirm it's a genuine npm `E404`, not a connection or auth failure, then:

```sh
npm publish --registry=https://registry.npmjs.org/
```

npm may prompt for a two-factor code — enter it only in that local prompt,
never share it with anything else, including an agent session.

## Post-publish

```sh
npm view csp-safe-slider name version dist-tags.latest \
  --registry=https://registry.npmjs.org/

npm install csp-safe-slider
```

- [ ] Confirm the public page: `https://www.npmjs.com/package/csp-safe-slider`
- [ ] Tag the release: `git tag v1.0.0 && git push --tags` — only after
      confirming with whoever owns push access; this repository has not
      tagged or pushed a release tag.
- [ ] Add a new `## [Unreleased]` section to `CHANGELOG.md` for the next
      round of changes.
- [ ] Re-run the `test:pack`-style checks against the real registry
      tarball (`npm install csp-safe-slider@latest` in a throwaway
      project), not just the local `.tgz`, since the registry tarball is
      what consumers actually get.

If npm says the name is unavailable or you lack permission, **stop**. Do
not retry with a different package name until every reference —
`package.json`, imports, examples, documentation, tests, and consumer
fixtures — has been updated consistently for the replacement name first.
