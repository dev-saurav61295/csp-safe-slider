# Changelog

All notable changes to this project are documented here. Format loosely
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this
project has not yet published a `1.0.0` and has no stability guarantee
until it does (see `docs/RELEASE.md`).

## [Unreleased]

## [0.1.0] — 2026-09-21

Initial implementation.

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
- Mouse click-and-drag, native touch swipe (via CSS, not JS), keyboard
  navigation (arrows, Home/End), scoped to not intercept text editing or
  unrelated page shortcuts.
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
- 115 automated tests: 32 unit (pure index/option logic) + 83 Playwright
  (CSP compliance incl. negative control, navigation, accessibility,
  feature-specific) across Chromium/Firefox/WebKit, plus standalone SSR
  import and packed-tarball consumer verification scripts.
- Runnable examples: basic gallery, autoplay + custom theme, RTL/vertical/
  loop (three independent instances), framework-integration snippets.
- Documentation: API reference, CSP contract explanation, accessibility
  guide with manual-verification checklist, compatibility matrix with
  honestly-scoped known limitations, release checklist.

### Known limitations

See `docs/COMPATIBILITY.md` for the full list — notably: no tested
framework adapter packages, no thumbnail-sync helper (composable manually
via the public API), native smooth-scroll duration isn't
JS-configurable (a platform limitation), and WebKit's headless synthetic
mouse events don't reliably exercise the mouse-drag path in this session's
CI (real Safari unverified for that specific interaction).
