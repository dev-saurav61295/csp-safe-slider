# Validation report

Everything in this report was actually run in this implementation session
on 2026-09-21, on macOS (Darwin 25.6.0, arm64), Node v20.12.2 / npm 10.9.0.
Nothing here is projected or assumed passing.

## Tool versions

| Tool                 | Version                                              |
| -------------------- | ---------------------------------------------------- |
| TypeScript           | 5.9.3                                                |
| tsup                 | 8.5.1                                                |
| vitest               | 2.1.9                                                |
| @playwright/test     | 1.63.0                                               |
| Playwright Chromium  | Chrome for Testing 153.0.8010.12                     |
| Playwright Firefox   | 155.0                                                |
| Playwright WebKit    | 26.6                                                 |
| @axe-core/playwright | 4.x (see package.json for the exact resolved semver) |
| eslint               | 9.39.5 with typescript-eslint 8.70.0                 |

## Commands and results

### Type checking

```sh
npm run typecheck    # tsc --noEmit
```

**Result: PASS.** Zero errors, strict mode (`strict: true`,
`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`).

### Linting

```sh
npx eslint .
```

**Result: PASS.** Zero errors, zero warnings.

### Unit tests

```sh
npm test    # vitest run
```

**Result: PASS. 32/32 tests, 3 files.**
Covers pure index/boundary math (`state.ts`: clamp/wrap/step/goTo/
canPrev/canNext/page helpers), option normalization and validation
(`options.ts`: merge semantics, autoplay expansion, RangeError on invalid
input, non-mutation of the base object), and the event emitter
(`events.ts`: subscribe/unsubscribe, targeted `off()`, mid-emit
unsubscribe safety, `clear()`).

### End-to-end tests (Playwright, real browser instances)

```sh
npx playwright install chromium firefox webkit   # one-time
npm run test:browser   # playwright test (alias: test:e2e)
```

**Result: PASS. 87/87 tests passed, zero skips, across
Chromium + Firefox + WebKit** (4 spec files × 3 browsers).

| Spec file            | Tests × 3 browsers | Result     |
| -------------------- | ------------------ | ---------- |
| `csp.spec.ts`        | 18                 | 18/18 PASS |
| `navigation.spec.ts` | 36                 | 36/36 PASS |
| `a11y.spec.ts`       | 18                 | 18/18 PASS |
| `features.spec.ts`   | 15                 | 15/15 PASS |

The mouse-drag test on WebKit was initially skipped during earlier
development (a stale assumption that Playwright's WebKit driver doesn't
set `pointerType: 'mouse'` reliably on synthetic mouse events). Re-checked
during release preparation and found to actually pass consistently
(verified 3 consecutive runs) — the skip was removed. No test is currently
skipped in this suite.

A **flaky-test root cause worth recording**: two negative-control tests
initially raced (violation-event dispatch can trail the triggering
action — click or parse — by a task tick under parallel worker load,
even though it doesn't on an unloaded single run). Fixed by polling for
the violation via `page.waitForFunction()` instead of asserting
immediately after the action. Re-ran the full suite three times after the
fix with zero flakes.

### CSP compliance — the mandatory checks (brief §7, items 1-3)

Run as part of `csp.spec.ts` above, specifically:

1. **`securitypolicyviolation` capture from before init**: a classic
   (non-module, blocking) script attaches the listener before the parser
   reaches any package code or later HTML; `strict.init.js` runs after.
   **Result across a full interaction flow (init → next/prev/goTo →
   update(mode) → refresh → mouse drag → keyboard nav → autoplay
   play/pause → destroy), both the primary and fallback CSP policies:
   zero violations.**
2. **Negative control** (`negative-control.html`): intentional inline
   `style` and `onclick` attributes. **Result: both confirmed blocked**
   (computed style never applies; handler never runs) **and both reported**
   via `securitypolicyviolation` (`style-src-attr` / `script-src-attr`),
   proving the policy is actually enforcing rather than silently
   permissive or report-only.
3. **Continuous mutation instrumentation**, not just a final snapshot: a
   `MutationObserver` (in `csp-monitor.js`, attached before init) watches
   every attribute and childList mutation for the whole page for the
   entire interaction flow, flagging any `style` attribute set, any `on*`
   attribute set, or any `<style>`/inline `<script>` inserted — including
   ones later removed. **Result: zero forbidden mutations recorded**
   across the full flow above, on both CSP policies.

Both the primary (`*-attr`/`*-elem` granular) and fallback (coarse
`script-src`/`style-src` only) policies were run as fully separate
fixture loads, not inferred from one — see `tests/e2e/fixtures/server.mjs`
(`STRICT_CSP` / `FALLBACK_CSP`).

### Server-side import safety

```sh
npm run test:ssr
```

**Result: PASS.** `scripts/verify-ssr.mjs` runs in a plain Node process
(genuinely no `window`/`document` globals present at all — not a jsdom
simulation) and imports both `dist/index.js` (ESM) and `dist/index.cjs`
(CJS), asserting `createSlider` is a function in both. No import-time
throw.

### Packed-tarball consumer test

```sh
npm run test:pack
```

**Result: PASS.** `scripts/verify-pack.sh` builds, runs `npm pack`
for real (not `--dry-run`), installs _that tarball_ into a throwaway
`npm install`-based consumer fixture in a temp directory, and verifies:
`require.resolve('csp-safe-slider/styles.css')` and `.../theme.css`
both resolve to real files with expected content, `index.d.ts` exists
next to the CJS entry, and both `require('csp-safe-slider')` and
`import 'csp-safe-slider'` return a working `createSlider`. Cleans up the
tarball and temp directory on exit via a trap.

### Accessibility

```sh
npx playwright test tests/e2e/a11y.spec.ts
```

**Result: PASS, 18/18 across 3 browsers.** Automated `@axe-core/playwright`
scan against the strict-CSP fixture: **zero violations**. Additional
targeted assertions: region/carousel/slide roles and labels present;
prev/next are real disableable buttons with accessible names; reduced
motion disables autoplay; focus entering the carousel stops autoplay and
blur alone does not resume it; keyboard-only Home/End/arrow navigation
reaches the correct index.

**Automated scope only** — see
[ACCESSIBILITY.md](ACCESSIBILITY.md#manual-verification-checklist) for the
explicit list of real screen-reader/device checks not run this session,
tracked separately as pending rather than silently assumed passing.

### Build and packaging

```sh
npm run build        # tsup -> dist/{index.js,index.cjs,index.d.ts,index.d.cts} + CSS copy
npm pack --dry-run
```

**Result: PASS.** Verified tarball contents (12 files, 63.1 kB packed /
259.4 kB unpacked): `dist/` (JS × 2 formats + sourcemaps, `.d.ts` × 2,
both CSS files), `README.md`, `LICENSE`, `CHANGELOG.md`, `package.json`.
`src/`, `tests/`, `examples/`, `docs/`, and config files are excluded via
the `files` allow-list, not merely `.npmignore`.

### Bundle size (measured, not estimated)

| Artifact                                 | Raw     | Minified | Minified + gzip |
| ---------------------------------------- | ------- | -------- | --------------- |
| Core JS (`src/index.ts`, esbuild bundle) | —       | 18,568 B | 5,706 B         |
| Structural CSS (`csp-safe-slider.css`)   | 4,354 B | —        | 1,515 B         |
| Optional theme CSS (`theme.css`)         | 670 B   | —        | 383 B           |

No arbitrary size budget was set before measuring (the brief says to set
one _after_ prototyping); ~5.7 KB gzipped core JS with zero runtime
dependencies is the number to budget against for a first release.

## Requirement-to-code/test traceability

| Requirement (brief §)                                           | Implemented in                                                                  | Tested by                                                                                  |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| No generated inline styles/handlers, ever (§2)                  | `src/core/*.ts` (no `.style` writes anywhere — verified by absence, see CSP.md) | `csp.spec.ts` (all specs), continuous `MutationObserver`                                   |
| Strict + fallback CSP fixtures (§2)                             | `tests/e2e/fixtures/server.mjs`                                                 | `csp.spec.ts`                                                                              |
| Negative control (§7.2)                                         | `tests/e2e/fixtures/negative-control.html`                                      | `csp.spec.ts`                                                                              |
| TypeScript strict, ESM+CJS, SSR-safe (§3)                       | `tsconfig.json`, `tsup.config.ts`, `src/**` (no top-level DOM access)           | `npm run typecheck`, `test:ssr`                                                            |
| Layout/theme in CSS, behavior in JS (§3)                        | `css/csp-safe-slider.css` custom properties + `src/core/options.ts`             | `docs/API.md` contract table; example pages                                                |
| finite/rewind/loop boundary modes (§4)                          | `src/core/state.ts` (`computeStep`, `resolveGoTo`), `src/core/loop.ts`          | `state.test.ts`, `navigation.spec.ts`                                                      |
| Horizontal/vertical, LTR/RTL (§4)                               | `src/core/geometry.ts`, `src/core/keyboard.ts`                                  | `navigation.spec.ts`                                                                       |
| slidesToScroll grouping, alignment (§4)                         | `src/core/state.ts`, `src/core/geometry.ts` (`targetScrollFor`)                 | `state.test.ts`, `navigation.spec.ts`                                                      |
| Drag/keyboard/snap/free-scroll (§4)                             | `src/core/drag.ts`, `src/core/keyboard.ts`, CSS scroll-snap                     | `features.spec.ts`, `navigation.spec.ts`                                                   |
| Slide/fade transitions (§4)                                     | `src/core/slider.ts` (`resolveScrollTarget`, fade grid CSS)                     | `features.spec.ts`                                                                         |
| Autoplay + pause rules (§4)                                     | `src/core/autoplay.ts`                                                          | `a11y.spec.ts` (focus-stop), `features.spec.ts` (leak proxy)                               |
| Lifecycle incl. idempotent destroy (§4)                         | `src/core/slider.ts` public API                                                 | `navigation.spec.ts`, `features.spec.ts`                                                   |
| WAI carousel roles/labels/focus (§5)                            | `src/core/slider.ts` (`setupA11y`, `labelSlides`)                               | `a11y.spec.ts`                                                                             |
| Reduced motion (§5)                                             | `src/core/dom.ts` (`prefersReducedMotion`), `slider.ts`                         | `a11y.spec.ts`                                                                             |
| Public API contract (§6)                                        | `src/index.ts`, `src/core/types.ts`, `src/core/slider.ts`                       | `state.test.ts`, `options.test.ts`, `events.test.ts`, all e2e specs                        |
| Runnable examples (§6)                                          | `examples/*`                                                                    | Manual smoke test (console-error check, this session) — not part of the automated CI suite |
| Framework integration guidance (§6)                             | `examples/framework-integration/README.md`                                      | Not build-tested — explicitly labeled illustrative                                         |
| Unit + e2e test coverage (§7)                                   | —                                                                               | 32 unit + 87 e2e, 119/119 pass, zero skips                                                 |
| SSR import check (§7.9)                                         | —                                                                               | `scripts/verify-ssr.mjs`                                                                   |
| Packed tarball check (§7.10)                                    | —                                                                               | `scripts/verify-pack.sh`                                                                   |
| npm packaging metadata (§8)                                     | `package.json` (`exports`, `types`, `files`, `sideEffects`)                     | `npm pack --dry-run`                                                                       |
| Size/performance measurement (§8)                               | —                                                                               | esbuild minify + gzip, this report                                                         |
| Docs: README/API/CSP/a11y/compat/changelog/license/release (§8) | `README.md`, `docs/*.md`, `CHANGELOG.md`, `LICENSE`                             | This report                                                                                |

## Reconciliation: implemented / tested / constrained / deferred

**Implemented and tested**: the CSP contract itself (positioning, styling,
event binding, no injected style/script), finite/rewind/loop boundary
modes, slide/fade effects, horizontal/vertical/RTL, slidesToScroll
grouping, alignment, drag/keyboard/free-scroll, autoplay with its pause
rules, full lifecycle API, WAI carousel roles/labels, reduced motion,
multiple independent instances, edge slide counts (0/1), SSR-safe import,
packed-tarball consumer resolution, npm packaging metadata.

**Implemented, lightly or not separately tested**: variable-width slides
(shares the same measured-geometry code path as the tested uniform-width
case, but no dedicated test asserts unequal widths specifically); autoplay
hover/hidden-document/offscreen suspension (implemented in
`autoplay.ts`'s state machine, but only the focus-stop rule has a
dedicated assertion — the others share the same `reconcile()` mechanism).
Mouse drag is now verified in Chromium, Firefox, _and_ WebKit (Playwright)
— real, non-headless Safari on macOS/iOS specifically was not exercised,
since that requires an actual device/OS, not just a different browser
engine build.

**Constrained by design, not a bug**: `effect: 'fade'` rejects
dragging and loop clones (no scroll axis exists in that mode); native
smooth-scroll duration/easing isn't JS-configurable (a CSSOM View spec
limitation); a `goTo()`/multi-step jump across a loop wrap boundary lands
correctly but as a direct jump rather than a seamless scroll (only
single-step `next()`/`prev()` at the exact boundary gets that treatment).
Full detail and reasoning in [COMPATIBILITY.md](COMPATIBILITY.md).

**Deferred, explicitly out of scope for this release**: tested/shipped
React/Vue/Angular adapter packages (illustrative snippets only), a
built-in thumbnail-sync helper (composable manually via the existing
public API), a build-time CSS preset generator (the custom-property
contract covers the same use case by hand), virtualization, grid/multi-row
layouts, parallax/3D, zoom/lightbox, history/deep-linking, and real
assistive-technology manual verification (tracked as a pending checklist,
not assumed). A CI workflow (`.github/workflows/ci.yml`) has since been
added post-release and is no longer deferred.

**Not run, marked as such rather than PASS**: real VoiceOver/NVDA/TalkBack
testing; real Safari (non-headless) mouse-drag verification; any browser
or platform not listed in "Tool versions" above.
