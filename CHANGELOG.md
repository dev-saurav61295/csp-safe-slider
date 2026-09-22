# Changelog

All notable changes to this project are documented here. Format loosely
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [1.1.1] — 2026-09-22

Follow-up patch addressing lifecycle, accessibility, form-safety,
reduced-motion, and autoplay/loop-teardown defects found in a review of
the `1.1.0` implementation. See
[docs/VALIDATION_REPORT.md](docs/VALIDATION_REPORT.md#111-validation)
for root cause, files changed, and regression evidence on every item
below.

### Fixed

- **Loop clones could duplicate form submissions.** `inert` excludes a
  clone from the accessibility tree and focus order, but not from HTML
  form submission — a `name`d, `inert` control is still a "successful
  control." Every clone now also has every `name` attribute stripped (on
  the clone root and every descendant) and every native form control
  disabled, so `FormData` contains each real control exactly once
  regardless of `mode: 'loop'`. Real controls are untouched.
- **`destroy()` left almost everything behind.** It removed listeners,
  controls, observers, and loop clones, but not the `role`,
  `aria-roledescription`, `aria-label`, `data-slider-*`, `data-state`,
  `aria-hidden`, `tabindex`, `aria-live`, or active-slide class this
  package had applied to the root, track, or slides — most harmful for a
  fade slider, where stale effect/state attributes could leave slides
  visually or semantically hidden after teardown. `destroy()` now restores
  everything it changed on the root, track, and every slide it has ever
  managed (including slides added later via `refresh()`, and one detached
  from the DOM before `destroy()` runs), without ever replacing a real
  slide DOM node, and without clobbering an attribute a consumer
  deliberately overwrote after init.
- **`animate: false` was not actually immediate.** `scrollTo({ behavior:
'auto' })` is not on its own a guarantee of an instant jump — the CSSOM
  View spec permits a UA to still defer to the computed `scroll-behavior`,
  which stays `smooth` on the structural CSS. Every non-animated scroll
  (`goTo`, initial `startIndex`, `refresh()`/`update()`/resize
  realignment) now applies an external track class that forces
  `scroll-behavior: auto` for the duration of the jump, consolidated with
  the loop engine's own boundary-correction mechanism.
- **A previously-masked RTL loop boundary-correction bug**, surfaced only
  once the fix above made scrolling genuinely instant:
  `LoopEngine.correctBoundary()` assumed a positive `realBlockSize` (true
  in `ltr`, but `realBlockSize` is negative in `rtl` — see
  [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#seamless-loop-measured-clones-not-assumed-geometry)),
  so it silently never corrected RTL loop wraps at all. The old, still-
  animated "immediate" scroll had accidentally masked this by letting the
  browser's own smooth-scroll-plus-snap coordination land on a valid
  position by itself.
- **Fade-mode and loop-clone neutralization missed a focusable slide
  root.** Both scanned only `slide.querySelectorAll(...)`, which never
  matches the slide element itself — a slide such as `<a href="..."
data-slider-slide>` or a root with an author `tabindex` stayed
  keyboard-focusable while inactive/hidden or cloned. Both now also check
  and neutralize the slide root itself, restoring its exact original
  `tabindex` on activation/`destroy()`.
- **Reduced-motion was read once at init and permanently erased the
  configured `autoplay` option.** `prefers-reduced-motion` is now watched
  live; a runtime change to `reduce` stops active autoplay immediately,
  and switching back to `no-preference` never silently resumes it — an
  explicit `play()` is always required. The configured `autoplay` option
  itself is never mutated, so `update({ reducedMotion: false })` can make
  it available again immediately.
- **Autoplay could report itself as running after `destroy()`.**
  `AutoplayController.detach()` cleared the timer and listeners but not
  its own `running`/suspension state, and a queued `IntersectionObserver`
  callback could still call `reconcile()` after `disconnect()`. Teardown
  is now final: `detach()` resets all internal state, and every path back
  into scheduling a timer checks the controller is still attached first.
- **Loop-correction animation-frame callbacks could outlive their
  instance.** `teardown()` removed clones but never cancelled the
  in-flight `requestAnimationFrame` pair scheduled to remove the
  `--correcting` class, so a stale callback from a destroyed or rebuilt
  instance could later interfere with a newer correction. Cleanup is now
  identity-tracked and cancelled outright in `teardown()`.

### Changed

- `docs/API.md#destroy` documents exactly what is now restored.
- `docs/ACCESSIBILITY.md#reduced-motion` documents the live-subscription
  semantics in full.
- `css/theme.css` gives `.csp-slider__slide` an explicit text `color`
  (previously relied on inherited/UA default), avoiding an
  insufficient-contrast pairing against its light default background on a
  page with a different global text color.

## [1.1.0] — 2026-09-21

Corrects defects found by a static review of the published `1.0.1`
artifact (itself an unannotated version bump over `1.0.0` with no code
changes — see the finding table in
[docs/VALIDATION_REPORT.md](docs/VALIDATION_REPORT.md) for full detail,
root cause, and regression evidence on every item below). Released as
`1.1.0` rather than a patch release: several of these fixes make a
previously-documented-but-nonfunctional feature actually work for the
first time (seamless looping, touch scrolling, most of `update()`), which
is a meaningful behavior change even though no public API was renamed,
removed, or given an incompatible signature.

### Fixed

- **Seamless `loop` mode was completely non-functional.** The loop engine
  never received the real slide list (`new LoopEngine(track, [], axis)`),
  so no clones were ever built and boundary correction was a silent
  no-op for the entire life of every instance — `mode: 'loop'` only ever
  worked by clamping/wrapping the logical index, with a full hard jump
  across the whole track underneath. Fixing this surfaced three more
  latent defects only reachable once clones actually built: reversed
  head-clone insertion order, a boundary check that missed the exact
  pixel a seamless wrap lands on, and an "instant" correction jump that
  silently animated because it inherited `scroll-behavior: smooth` from
  the track. All four fixed together; loop mode now does what it always
  claimed to.
- **A related, independently-discovered RTL scroll-math bug**: an
  incorrect extra coordinate shift in `targetScrollFor()`/
  `nearestSlideIndex()`, previously masked by mandatory scroll-snap
  silently correcting ordinary single-step navigation to the right slide
  regardless. Broke outright for `loop` + RTL, which needs to land on a
  _specific_ clone rather than "whichever slide is closest."
- **Touch users could not swipe the slider at all.** `touch-action:
pan-y` (horizontal) / `pan-x` (vertical) permitted native panning only
  on the axis perpendicular to the slider's own scroll direction — the
  opposite of what was intended — while the JS drag controller
  intentionally ignores non-mouse pointers. Fixed the CSS to permit
  native panning on both axes (`pan-x pan-y pinch-zoom`); mouse dragging,
  page-scroll passthrough, and pinch/double-tap zoom are unaffected.
- **`update()` silently ignored most option changes after creation.**
  `axis` and `dragThreshold` changes never reached the drag/keyboard
  controllers (they read a config snapshot captured at construction);
  autoplay could not be turned on or off, nor have its interval/pause
  rules changed, after initial creation; changing `effect` didn't rebuild
  loop clones or reset fade accessibility state. All now take effect
  live. Enabling autoplay via `update()` mirrors initial creation
  (establishes listeners/controls, auto-starts unless reduced motion
  applies); an explicit prior `pause()` is never silently overridden by
  an unrelated `update()` call.
- **The `direction` option was accepted but never applied** — direction
  was always read from the resolved computed `dir`, even when the caller
  passed `direction: 'ltr'`/`'rtl'` explicitly. Now sets the `dir`
  attribute on the root element (restoring whatever was there before, on
  `destroy()` or a later `update()` back to `'auto'`).
- **Fade-mode focus/tabindex handling could permanently lose track of
  custom-tabindex content and discard a consumer's own tabindex value.**
  Reactivating a slide unconditionally called `removeAttribute('tabindex')`
  regardless of what the element originally had, and the rescan selector
  excluded already-neutralized elements, so a `<div tabindex="0">` inside
  an inactive fade slide could never be found again to reactivate.
  Original values are now tracked and restored exactly; switching away
  from `fade` (via `update()`) clears every such restriction in one pass.
- **`refresh()` never renumbered a slide's default `"N of M"` label once
  set once**, even after the slide count changed. A library-owned default
  label is now tracked and kept current; a label the consumer has since
  set or overwritten is left alone from that point on.
- **A pending resize-triggered rebuild could still run after `destroy()`**
  — the debounce `requestAnimationFrame` id lived where `destroy()`
  couldn't reach it to cancel. Fixed.
- **Pagination dots used a half-implemented ARIA tablist pattern**
  (`role="tablist"`/`role="tab"`/`aria-selected`/roving `tabindex`)
  without the focus-follows-selection behavior a real tablist requires.
  Simplified to a plain labeled button group (`aria-label` +
  `aria-current="true"`), an explicitly valid alternative that needs
  neither.
- **The README quick-start example would not run under its own documented
  CSP.** It used an inline `<script type="module">` block — blocked by
  the very `script-src 'self'` policy shown two sections later, inline
  module or not — importing a bare package specifier browsers don't
  resolve on their own. Replaced with an external `<link>` + external
  `<script src="...">` example that mirrors the actually-CSP-tested
  fixture.

### Changed

- The JS `duration` option is now documented as deprecated and explicitly
  has no runtime effect (it never did — a previous release's docs
  incorrectly claimed it drove `effect: 'fade'` crossfade timing
  directly). It's still accepted and validated for backward compatibility.
  Fade timing is, and always was, controlled exclusively by the
  `--slider-duration` CSS custom property.

### Added

- Regression coverage for all of the above: `tests/e2e/loop.spec.ts`
  (clone structure, wrap-direction target selection, frame-level
  boundary-correction proof, RTL/vertical/variable-width loop
  combinations), `tests/e2e/touch.spec.ts` (real CDP touch input, the
  `touch-action` contract, mouse drag unaffected), `tests/e2e/update.spec.ts`
  (every documented updateable option), and additions to
  `tests/e2e/a11y.spec.ts` (fade focus lifecycle, direction option,
  label ownership, destroy idempotency/reinit, pagination semantics).

## [1.0.1] — 2026-09-21

Version bump only — no source changes from `1.0.0`.

## [1.0.0] — 2026-09-21

Initial public release.

### Added

- Core `createSlider(root, options)` engine: no runtime dependencies,
  ESM + CJS, TypeScript strict mode, SSR-safe import.
- CSP-safe positioning via native `scrollLeft`/`scrollTo` — zero generated
  inline styles, zero inline event handlers, zero injected `<style>`/
  inline `<script>`, verified against a real enforcing CSP header in
  Chromium, Firefox, and WebKit.
- Boundary modes: `finite`, `rewind`, and a genuinely seamless `loop`
  (DOM-clone-based, measured from real layout so it works with
  variable-width slides).
- `slide` and `fade` transition effects.
- Horizontal/vertical axis, LTR/RTL, `slidesToScroll` grouping/paging,
  start/center/end alignment, `freeScroll` mode.
- Mouse click-and-drag (verified in Chromium, Firefox, and WebKit), native
  touch swipe (via CSS, not JS), keyboard navigation (arrows, Home/End),
  scoped to not intercept text editing or unrelated page shortcuts.
- Autoplay with hover/focus/hidden-document/offscreen pause rules and a
  WAI-carousel-pattern-conformant focus-stops-rotation behavior.
- Built-in accessible controls: prev/next, page dots, fraction readout,
  progress element, rotation toggle — all real, labeled, focusable DOM
  nodes.
- Full lifecycle: `next`/`prev`/`goTo`/`refresh`/`update`/`getState`/
  `play`/`pause`/`stop`/`on`/`off`/`destroy`, with idempotent destroy and
  documented destroyed-instance behavior.
- External structural stylesheet (`csp-safe-slider.css`) plus an optional
  default theme (`theme.css`), both driven by a documented CSS
  custom-property contract.
- 119 automated tests, all passing with zero skips: 32 unit (pure
  index/option logic) + 87 Playwright (CSP compliance incl. negative
  control, navigation, accessibility, feature-specific) across
  Chromium/Firefox/WebKit, plus standalone SSR-import and packed-tarball
  consumer verification scripts.
- Runnable examples: basic gallery, autoplay + custom theme, RTL/vertical/
  loop (three independent instances), framework-integration snippets.
- Documentation: API reference, CSP contract explanation, architecture
  decisions, accessibility guide with manual-verification checklist,
  compatibility matrix with honestly-scoped known limitations, validation
  report, release checklist.

### Known limitations

See `docs/COMPATIBILITY.md` for the full list — notably: no tested
framework adapter packages (illustrative snippets only), no built-in
thumbnail-sync helper (composable manually via the public API), native
smooth-scroll duration isn't JS-configurable (a CSSOM View platform
limitation, not an oversight), and real assistive-technology (screen
reader/device) manual verification is tracked as pending in
`docs/ACCESSIBILITY.md` rather than assumed complete.
