# Accessibility

Follows the [WAI-ARIA APG carousel pattern](https://www.w3.org/WAI/ARIA/apg/patterns/carousel/)
and [carousel tutorial](https://www.w3.org/WAI/tutorials/carousels/),
adapted to the actual interaction model rather than attaching every ARIA
role indiscriminately.

## What's implemented

- **Naming**: the root gets `role="region"`, `aria-roledescription="carousel"`,
  and a default `aria-label` if you didn't provide `aria-label`/
  `aria-labelledby` yourself (always provide your own describing the
  carousel's _content_).
- **Slide semantics**: each real slide gets `role="group"` and
  `aria-roledescription="slide"`, with a default `aria-label` like
  `"2 of 5"` if you haven't set one.
- **Native controls**: prev/next, dots, and the rotation toggle are real
  `<button type="button">` elements with `aria-label`s, not `<div
onclick>`. Prev/next are `disabled` (not just visually hidden) at the
  boundary in `finite` mode. Pagination dots are a plain labeled button
  group (`aria-label="Go to slide N"` + `aria-current="true"` on the
  active one), not a `role="tablist"`/`role="tab"` pattern — a tablist
  requires roving `tabindex` _and_ moving DOM focus to the newly active
  tab on every arrow-key-driven change, which this carousel's global
  (not per-control) arrow-key handling doesn't do; a half-implemented
  tablist (the previous behavior: `role="tab"` + `aria-selected` +
  roving `tabindex`, but no focus-follows-selection) is worse than a
  plain button group, so this release simplifies to the latter.
- **Keyboard operation**: the track is explicitly `tabindex="0"` (see
  `src/core/slider.ts` — this was made explicit after finding that
  reliance on implicit "scrollable containers are focusable" browser
  behavior is inconsistent: Chromium/Firefox do it, WebKit didn't in
  testing). Arrow keys navigate (flipped correctly for RTL), Home/End jump
  to the first/last slide. Key handling bails out for editable targets
  (`<input>`, `<textarea>`, `<select>`, `contenteditable`) so it never
  steals normal text-editing keys, and only listens within the carousel's
  own DOM subtree so it doesn't intercept unrelated page shortcuts.
- **Autoplay discipline**: off by default. When enabled, focus entering the
  carousel **stops** rotation (not just pauses) and requires an explicit
  `play()` call to resume — it does not silently resume on blur. Hover,
  hidden document, and offscreen visibility transiently suspend and
  auto-resume the timer without changing play/pause intent. A visible
  rotation toggle button is provided whenever autoplay is configured.
  `aria-live` on the track is `"off"` while autoplay is actively rotating
  and `"polite"` otherwise, so manual navigation is announced but rotation
  doesn't flood a live region.
- **Reduced motion**: `prefers-reduced-motion: reduce` disables autoplay by
  default (`reducedMotion: true` is the default option) and forces instant
  (non-smooth) scrolling for programmatic navigation; the fade-effect CSS
  transition is also removed under this media query in
  `css/csp-safe-slider.css`.
- **Loop clones excluded from the a11y tree and tab order**: `aria-hidden`,
  the `inert` property, and `tabindex="-1"` on focusable descendants — see
  [CSP.md](CSP.md#how-seamless-loop-stays-csp-safe).
- **Focus preservation**: navigation never moves or removes the
  currently-focused element; `refresh()`/`update()` don't rebuild slide
  DOM nodes, only re-scan/re-label them.
- **Fade-mode focus lifecycle**: inactive slides under `effect: 'fade'`
  get `aria-hidden="true"` and every focusable descendant forced to
  `tabindex="-1"`; activating a slide restores each descendant's
  _original_ tabindex exactly (removing the attribute if it had none,
  restoring a consumer-set value like `tabindex="0"` if it had one — not
  just blanket-removing the attribute, which would silently strip a
  consumer's own tabindex the first time their content became inactive).
  Switching from `fade` to `slide` (via `update()`) restores every
  currently-neutralized element in one pass, so no stale
  `aria-hidden`/`tabindex="-1"` survives an effect change.
- **Forced-colors / high-contrast**: `@media (forced-colors: active)`
  rules keep control borders visible in `css/csp-safe-slider.css`.
- **RTL / direction**: `direction: 'auto'` (the default) reads the
  resolved `dir` (via `getComputedStyle`); `direction: 'ltr'`/`'rtl'`
  explicitly sets the `dir` attribute on the root element (restoring
  whatever was there before once you go back to `'auto'`, or on
  `destroy()`), so an explicit option isn't silently ignored the way a
  previous release's static-CSS-only read left it. Arrow-key direction
  and scroll-position math both key off the same resolved value either
  way, so layout, navigation, keyboard behavior, and `getState().direction`
  always agree.

## Automated checks

`tests/e2e/a11y.spec.ts` runs an `@axe-core/playwright` scan against the
strict-CSP fixture (zero violations, all three browsers) plus targeted
assertions for the semantics above (roles, labels, disabled state, reduced
motion, focus-stops-autoplay, keyboard-only Home/End/arrow navigation).
**Automated axe scans catch a meaningful subset of issues, not full
conformance** — see the manual checklist below for what they can't catch.

## Manual verification checklist

This is the tracking list required by the implementation brief, honestly
split into what was actually exercised this session vs. what's pending
real assistive-technology testing.

### Executed this session (via Playwright, simulating the interaction but not a real AT)

- [x] Tab reaches the track and each control in a sensible order
- [x] Arrow keys move focus/selection correctly in LTR and RTL
- [x] Home/End jump to first/last slide
- [x] Focus never gets trapped in a loop-mode clone
- [x] Reduced-motion preference disables autoplay
- [x] Focus entering the carousel stops autoplay; blur alone doesn't resume it
- [x] `disabled` state on prev/next reflects actual boundary reachability

### Pending — requires a real screen reader + real device, not run this session

- [ ] VoiceOver (macOS Safari) reads the carousel name, role, and each
      slide's position announcement sensibly during arrow-key navigation
- [ ] VoiceOver (iOS Safari) — swipe gesture navigation and rotor behavior
- [ ] NVDA (Windows Firefox/Chrome) — same, plus verify `aria-live`
      transitions aren't overly chatty during manual navigation
- [ ] TalkBack (Android Chrome) — touch swipe + explore-by-touch behavior
- [ ] Dragon/voice-control click-target verification for dots and arrows
- [ ] Real zoomed-layout (200%+ browser zoom) control usability check
- [ ] Real forced-colors mode (Windows High Contrast) visual check, beyond
      the CSS rule existing

Mark items in this list PASS/FAIL with the tester, browser/AT version, and
date when they're actually run — do not mark them done based on the
automated suite alone.
