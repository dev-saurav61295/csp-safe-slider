# Maintainer release checklist

**Current state**: `csp-safe-slider` **is already published** — `npm view
csp-safe-slider versions` returns `['1.0.0', '1.0.1']` from the live
registry (checked in this release-prep session; re-verify immediately
before publishing, per the recheck step below). `1.0.1` was an
unannotated version bump with no source changes from `1.0.0` (confirmed
via `git show` on that commit) — it shipped the same defects `1.0.0` had,
which is what a static review of that published artifact found and this
release (`1.1.0`) fixes. No `npm publish` has been run **by this
session** — that step remains the owner's, on the owner's machine, with
the owner's npm credentials.

## Resolved during this release's preparation

- [x] **Package name**: already registered and owned (see above) —
      nothing to check for availability this time; just confirm you're
      still authenticated as the right owner (`npm whoami`) before
      publishing.
- [x] **`version`**: bumped `1.0.1` → **`1.1.0`** (minor, not patch). Every
      fix in this release corrects a documented-but-nonfunctional
      behavior (seamless looping, touch scrolling, most of `update()`)
      rather than a purely internal bug with no visible behavior change —
      see [CHANGELOG.md](../CHANGELOG.md#110--2026-09-21) for the
      version-rationale note and the full fix list, and
      [VALIDATION_REPORT.md](VALIDATION_REPORT.md) for the finding-to-fix
      table with regression evidence for each item. No public API was
      renamed, removed, or given an incompatible signature — the `duration`
      option is deprecated but still accepted with no behavior change
      either way, so nothing here is a breaking change requiring a major
      bump.
- [x] All mandatory automated release gates pass with zero unexplained
      failures: 32/32 unit tests, 202/210 e2e (8 intentional,
      documented skips — see [VALIDATION_REPORT.md](VALIDATION_REPORT.md)),
      typecheck, lint, format, SSR-import check, packed-tarball consumer
      check (including a byte-for-byte diff of the packed tarball's
      `dist/` against the repo's built `dist/`). One pre-existing,
      environment-attributable flake (WebKit mouse-drag under heavy
      parallel load) was investigated, bisected to the unmodified `1.0.1`
      baseline to confirm it isn't a regression, and documented rather
      than silently retried away.
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
- [ ] **Confirm real touch input on a physical device.** This release's
      touch-scrolling fix was verified with Chromium's CDP touch-event
      dispatch and a cross-engine `touch-action` CSS assertion (see
      `tests/e2e/touch.spec.ts`), which is real engine-level touch
      emulation but not a physical iOS/Android device. Worth a manual
      pass on an actual phone before or shortly after this release.
- [ ] **Recheck the published version state immediately before
      publishing** — package ownership was already confirmed live in this
      session, but re-run right before you actually publish, since that
      check goes stale the moment it's made:

  ```sh
  npm view csp-safe-slider versions --registry=https://registry.npmjs.org/
  npm whoami
  ```

  Confirm `1.1.0` is **not** already in the returned `versions` list
  (npm refuses to republish an existing version anyway, but check first
  rather than finding out from a failed publish) and that `npm whoami`
  is the account that owns this package. A timeout or auth error from
  either command is not the same as a clean result — retry rather than
  proceeding on an ambiguous answer.

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

Expected `npm pack --dry-run` contents (verified during this release's
prep, 12 files, ~78.9 kB packed / ~312.8 kB unpacked — grew from `1.0.1`'s
~63.1 kB/~259.4 kB with the loop/controller-coherence/fade-focus fixes):
`dist/` (JS × 2 formats + sourcemaps, `.d.ts` × 2, both CSS files),
`README.md`, `LICENSE`, `CHANGELOG.md`, plus the auto-included
`package.json`. `src/`, `tests/`, `examples/`, `docs/`, and config files
are excluded via the `files` allow-list in `package.json` — verify this
list hasn't silently grown to include something unintended (a stray
`.env`, a local log) before every publish, since `files` allow-listing is
the actual safety mechanism here, not `.npmignore` (none exists, by
design). This release's prep additionally diffed the packed tarball's
extracted `dist/` byte-for-byte against the repo's own built `dist/` —
identical — confirming the browser test suite (which serves `/dist/*`
directly) exercises the same bytes that get published.

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

npm view csp-safe-slider versions --registry=https://registry.npmjs.org/
```

This is **not** a first release — the package is already published
(`1.0.0`, `1.0.1` live). That final `npm view` should list both existing
versions and confirm `1.1.0` isn't already among them; once confirmed:

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
- [ ] Tag the release: `git tag v1.1.0 && git push --tags` — only after
      confirming with whoever owns push access. `v1.0.1` is already
      tagged and pushed to `origin` (pointing at the version-bump-only
      commit `de638c5`); there is no `v1.0.0` tag, so this project's
      tagging history is already inconsistent — worth the owner's
      attention independent of this release, but not something to
      silently "fix" by retagging history here.
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
