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
- **Reduced motion**: see the [dedicated section](#reduced-motion) below.
- **Loop clones excluded from the a11y tree, tab order, and form
  submission**: `aria-hidden`, the `inert` property, `tabindex="-1"` on
  focusable content (including the clone's own root element, if that's
  what's focusable), stripped `name` attributes, and disabled native form
  controls — see [CSP.md](CSP.md#how-seamless-loop-stays-csp-safe) and
  [CSP.md](CSP.md#loop-clones-cannot-duplicate-form-submissions).
- **Focus preservation**: navigation never moves or removes the
  currently-focused element; `refresh()`/`update()` don't rebuild slide
  DOM nodes, only re-scan/re-label them.
- **Fade-mode focus lifecycle**: inactive slides under `effect: 'fade'`
  get `aria-hidden="true"` and every focusable descendant, _and the slide
  root itself if the root is the focusable thing_ (e.g. `<a
data-slider-slide>`, `<button data-slider-slide>`, or a root with an
  author `tabindex`), forced to `tabindex="-1"`; activating a slide
  restores each one's _original_ tabindex exactly (removing the attribute
  if it had none, restoring a consumer-set value like `tabindex="0"` if it
  had one — not just blanket-removing the attribute, which would silently
  strip a consumer's own tabindex the first time their content became
  inactive). Switching from `fade` to `slide` (via `update()`) restores
  every currently-neutralized element in one pass, so no stale
  `aria-hidden`/`tabindex="-1"` survives an effect change, and `destroy()`
  restores every one of them too, along with `aria-hidden` itself and the
  `data-state`/effect attributes that drive the fade CSS — so a destroyed
  fade slider never leaves a slide looking or behaving hidden.
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

## Reduced motion

`reducedMotion: true` (the default) means this instance respects the live
`prefers-reduced-motion` media query for as long as the option stays
`true`; `reducedMotion: false` means the JS behavior below never applies,
regardless of the OS preference (CSS still independently disables the
fade-effect transition and forces `scroll-behavior: auto` under
`@media (prefers-reduced-motion: reduce)` in `css/csp-safe-slider.css` —
that CSS rule is unconditional and not affected by this option).

While `reducedMotion: true` and the OS currently reports `reduce`:

- **Initialization**: if `autoplay` was configured, it does not start.
  Unlike an earlier implementation, the _configured_ `autoplay` option
  itself is never mutated or discarded — `getState().isAutoplaying` is
  `false`, but the rotation control still renders (since autoplay _is_
  configured) and an explicit `play()` remains available for later.
- **Runtime preference changes**: a `prefers-reduced-motion` change is
  watched live (not read once at init). Switching _to_ `reduce` while
  autoplay is actively running stops it immediately. `play()` (whether
  called directly or via the built-in rotation button) is a no-op for as
  long as the preference stays `reduce`.
- **Switching back to `no-preference`**: autoplay that was stopped for
  reduced motion does **not** silently resume — resuming always requires
  an explicit `play()` call after the preference changes back. This is
  deliberate: a user who enabled reduced motion and then had their system
  briefly report `no-preference` (e.g. a transient OS/browser quirk)
  should never be surprised by motion starting on its own.
- **Programmatic navigation**: `next()`/`prev()`/`goTo()` and internal
  realignment (`refresh()`, `update()`, resize) are all immediate rather
  than smoothly animated, even if you pass `animate: true` explicitly.
- **`update({ reducedMotion })`**: takes effect immediately in both
  directions. Setting it to `true` while the OS already reports `reduce`
  stops any currently-running autoplay right away. Setting it to `false`
  makes the OS preference stop affecting this instance's behavior from
  that point on — again, without auto-resuming any autoplay that had
  already been stopped.
- **`destroy()`**: removes the media-query listener; no callback from it
  can affect the instance afterward.

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
- [x] (1.1.1) A focusable slide root itself (`<a>`/`<button>`/`tabindex`
      root, not just a descendant) is neutralized while inactive/cloned and
      restored exactly on activation/`destroy()`
- [x] (1.1.1) `destroy()` on a fade slider leaves no slide visually or
      semantically hidden (no stale `aria-hidden`/`data-state`/effect
      attributes)
- [x] (1.1.1) Runtime `prefers-reduced-motion` changes (via
      Playwright's media emulation, not a real OS toggle) stop/prevent
      autoplay and don't silently resume it
- [x] (1.1.1) Axe scan against the focusable-slide-root fixture in both
      fade and loop mode, zero violations

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
