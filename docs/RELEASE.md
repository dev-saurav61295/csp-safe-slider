# Maintainer release checklist

This package has **not** been published. No publish command was run as
part of this implementation, per the brief's explicit instruction not to
publish or reserve the name without separate authorization.

## Before publishing

- [ ] **Confirm package-name availability again, immediately before
      publish** — availability can change between now and then. Use:
      ```sh
      npm view csp-safe-slider name version --registry=https://registry.npmjs.org/
      ```
      or an exact HTTP check:
      ```sh
      curl -s -o /dev/null -w '%{http_code}\n' https://registry.npmjs.org/csp-safe-slider
      ```
      A `404`/`E404` is evidence of absence; a timeout, access error, or
      empty search result is **not** — retry with the exact command above
      rather than trusting an ambiguous result.

      Last checked during this implementation session: **2026-09-21
      07:08:34 UTC**, HTTP `404`, body `{"error":"Not found"}`. This is
      now stale by the time you read it — recheck.

- [ ] **Confirm copyright/ownership for `LICENSE`.** It currently reads
      "Copyright (c) 2026 csp-safe-slider contributors" as a placeholder —
      replace with the actual publishing individual/org name before
      publishing under their identity.

- [ ] **Confirm `package.json` `repository`/`bugs`/`homepage` fields** — not
      set in this implementation since no repository host was specified.
      Add them once the package has a real repository URL; npm and
      consumers both expect these for a public package.

- [ ] **Bump `version`** per semver. `0.1.0` is a placeholder initial
      version; decide whether the first publish should be `0.1.0`
      (signals "not yet API-stable," matches the honest "what's deferred"
      scope in `docs/COMPATIBILITY.md`) or `1.0.0` (signals a stability
      commitment this session's scope doesn't fully back yet, given
      deferred items like framework adapters and full manual a11y
      verification).

- [ ] **npm auth**: `npm login` / configure an automation token via
      `NPM_TOKEN` in CI. Not performed here — no credentials were touched
      or requested during this implementation.

- [ ] **Provenance**: if publishing from CI, add
      `npm publish --provenance` (requires a supported CI environment like
      GitHub Actions with OIDC configured) so consumers get npm's
      supply-chain provenance attestation. Not configured in this
      repository — no CI workflow file exists yet (see below).

- [ ] **CI**: no `.github/workflows/*.yml` was added in this session. Set
      one up running, at minimum: `npm run typecheck && npm run lint &&
      npm test && npm run build && npm run test:e2e && npm run test:ssr &&
      npm run test:pack` on your target Node version(s) before merging to
      the default branch and before every publish.

## Pre-publish verification (run these, don't skip)

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e     # requires: npx playwright install (already done in this session's environment)
npm run test:ssr
npm run test:pack
npm pack --dry-run   # inspect the file list — see below for what to expect
```

Expected `npm pack --dry-run` contents (verified this session):
`dist/` (JS, `.d.ts`, `.css`), `README.md`, `LICENSE`, `CHANGELOG.md`, plus
the auto-included `package.json`. `src/`, `tests/`, `examples/`, `docs/`,
and config files are excluded via the `files` field in `package.json` —
verify this list hasn't silently grown to include something unintended
(e.g. a stray `.env`) before every publish, since `files` allow-listing is
the actual safety mechanism, not `.npmignore`.

## Publishing

```sh
npm publish --access public
```

This repository intentionally does not run this command. Do not publish a
placeholder release merely to reserve the name — see the brief's explicit
instruction against squatting.

## Post-publish

- [ ] Tag the release in git (`git tag vX.Y.Z && git push --tags`) — only
      after confirming with whoever owns push access; this session did not
      push or tag anything.
- [ ] Update `CHANGELOG.md` for the next unreleased section.
- [ ] Smoke-test the *published* (not local) package in a throwaway
      project: `npm install csp-safe-slider@latest` and re-run the
      `test:pack`-style checks against the real registry tarball, not just
      the local one.
