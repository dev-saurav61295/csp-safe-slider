# Compatibility matrix and known limitations

## Feature combination matrix

Representative combinations, actually exercised by the automated suite
(`tests/e2e/*.spec.ts`) unless marked otherwise. "Works" means: navigates
correctly, settles to the correct logical index, and stays CSP-clean.

| Combination | Status | Notes / evidence |
| --- | --- | --- |
| `loop` + horizontal + LTR | ✅ Tested | `navigation.spec.ts` "loop mode settles back..." |
| `rewind` + horizontal + LTR | ✅ Tested | `navigation.spec.ts` "rewind mode wraps..." |
| `finite` + horizontal + LTR | ✅ Tested | `navigation.spec.ts` "finite mode disables..." |
| `finite` + vertical | ✅ Tested | `navigation.spec.ts` "vertical axis scrolls..." |
| `finite` + RTL + keyboard | ✅ Tested | `navigation.spec.ts` "RTL flips arrow-key direction" |
| `slidesToScroll > 1` (grouping/paging) | ✅ Tested | `navigation.spec.ts` "next/prev advance by slidesToScroll" |
| `effect: 'fade'` | ✅ Tested | `features.spec.ts` "fade effect toggles..." — track never scrolls, single active slide |
| `freeScroll: true` | ✅ Tested | `features.spec.ts` "freeScroll disables CSS scroll-snap..." |
| Mouse drag navigation | ✅ Tested (Chromium, Firefox) | `features.spec.ts`; WebKit skipped — see Known limitations |
| Variable-width slides | ⚠️ Architecturally supported, not covered by an automated test this session | Loop boundary correction measures real `offsetLeft`/`offsetWidth` rather than assuming uniform slide width (`src/core/loop.ts`), so variable widths should work through the same code path validated for uniform widths — but no dedicated test exercises unequal slide widths specifically. Treat as **implemented, lightly verified**. |
| `loop` + variable width | ⚠️ Same as above | Same underlying measurement-based mechanism; not separately tested. |
| `loop` + `slidesToScroll > 1` (multi-slide jump across the wrap boundary) | ⚠️ Partial | Adjacent single-step wraps (index N-1 → 0 via `next()`) scroll into the neighboring clone for a seamless visual transition. A `goTo()` or multi-step jump that crosses the wrap boundary in one call scrolls directly to the real slide instead — correct end state, but a hard jump rather than a seamless scroll. See `resolveScrollTarget()` in `src/core/slider.ts`. |
| `effect: 'fade'` + `draggable`/`freeScroll` | ❌ Rejected by design | Fade mode has no scroll axis (slides stack via CSS grid), so dragging is intentionally disabled when `effect: 'fade'` (`src/core/slider.ts` only attaches `DragController` when `effect === 'slide'`). Not a bug — there is nothing to drag. |
| `effect: 'fade'` + `mode: 'loop'` | ❌ Rejected by design | Loop clones exist to make scroll-boundary wrapping seamless; fade mode never scrolls, so clones are skipped entirely when `effect === 'fade'` (`rebuildLoop()`). `next()`/`prev()` in fade+loop still wrap correctly via the plain index math (`computeStep`), just without any clone involvement — there's no boundary to make seamless. |
| Multiple independent instances on one page | ✅ Tested | `navigation.spec.ts` "two independent instances do not cross-talk"; also `examples/rtl-vertical-loop` (3 live instances) |
| 0 slides | ✅ Tested | `navigation.spec.ts` "zero slides does not throw..." |
| 1 slide | ✅ Tested | `navigation.spec.ts` "a single slide disables both prev and next" |
| Dynamically added/removed slides (`refresh()`) | ✅ Tested | `navigation.spec.ts` "refresh() picks up slides added after init" |
| `reducedMotion` / `prefers-reduced-motion` | ✅ Tested | `a11y.spec.ts` "reduced motion disables autoplay..." |
| Autoplay pause/resume rules (hover, focus-stop, hidden, offscreen) | ✅ Focus-stop tested; hover/hidden/offscreen implemented, not individually asserted this session | `a11y.spec.ts` tests the focus-stop-requires-explicit-restart rule specifically, since it's the least intuitive one. `src/core/autoplay.ts` implements all four suspension reasons behind the same state machine. |
| Server-side import (no `window`/`document`) | ✅ Tested | `scripts/verify-ssr.mjs`, run via `npm run test:ssr` |
| Packed npm tarball in a clean consumer fixture | ✅ Tested | `scripts/verify-pack.sh`, run via `npm run test:pack` |

## Known limitations

- **WebKit synthetic mouse drag in headless CI**: Playwright's WebKit
  driver doesn't reliably set `pointerType: 'mouse'` on synthetic mouse
  events in this environment, so `DragController`'s mouse-only gating
  (intentional — see [CSP.md](CSP.md#why-touch-drag-is-left-to-the-browser))
  never engages in that specific test. This is a test-harness limitation,
  not a product one — the same drag code runs identically across engines;
  only the synthetic-event simulation differs. Real Safari should be
  manually verified before shipping if mouse-drag is a load-bearing
  feature for your use case.
- **Native smooth-scroll duration/easing is not configurable.** The
  `duration` option drives fade-effect crossfade timing directly, but for
  `effect: 'slide'` it cannot control the browser's native
  `scrollTo({behavior: 'smooth'})` timing — that's a CSSOM View spec
  limitation, not something this package can work around without falling
  back to JS-driven `scrollLeft` animation (which would reintroduce the
  performance/jank tradeoffs native smooth-scroll exists to avoid). See
  [API.md](API.md#css-custom-property-contract).
- **Build-time CSS preset generator not included.** The brief allows an
  *optional* build-time generator for numeric layout presets; this release
  covers the same use case via hand-written `calc()` custom-property
  overrides (see the basic-gallery example) and does not include a
  separate codegen script. Not required for basic usage either way.
- **Thumbnail/gallery synchronization** is not implemented as a dedicated
  API or plugin in this release. Two independent `createSlider` instances
  can already be wired together manually via `on('change', ...)` +
  `goTo()` in a few lines of consumer code (the public API supports it —
  see the two-instance test in `navigation.spec.ts` for the independence
  guarantee it relies on), but there's no built-in
  `syncWith()`/`asThumbnails()` helper.
- **Virtualization, grid/multi-row layouts, parallax/3D, zoom/lightbox,
  and history/deep-linking** are explicitly out of scope for this release,
  per the brief's own allowance to defer "advanced extensions" as future
  plugins. None of these are implemented, stubbed, or partially built.
- **Tested framework adapter packages** (`@csp-safe-slider/react`, etc.)
  don't exist. `examples/framework-integration/README.md` has
  illustrative, hand-written (not build-tested) integration snippets for
  React/Vue/Angular.
- **`goTo()`/multi-step jumps across a loop boundary** land correctly but
  via a direct jump rather than a seamless scroll through the wrap point —
  see the matrix row above. Only single-step `next()`/`prev()` at the
  exact boundary gets the fully seamless treatment.
