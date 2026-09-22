# Architecture decisions

## Positioning: native scroll, not transforms

**Decision**: slides live in a real scrollable container
(`overflow: auto` + `scroll-snap-type`); navigation is
`scrollTo()`/`scrollLeft` assignment, never `transform`/`left`/`top` via
`style`.

**Why**: this is the load-bearing decision the entire CSP contract rests
on. `scrollLeft`/`scrollTo` are DOM element properties/methods, completely
untouched by any CSP directive, and give scroll-snap, momentum, and
rubber-banding for free on touch devices with zero JS. The alternative
(transform-based positioning, what most slider libraries do) requires
writing `element.style.transform` every frame or every navigation — which
is exactly the "not blocked by `style-src-attr` but still inline styling"
gap this package exists to avoid (see [CSP.md](CSP.md)).

**Rejected alternative**: Web Animations API driving a `transform`. It was
considered per the brief's suggestion to prototype it, but `.animate()`
still requires either `commitStyles()` (an explicit inline-style write —
forbidden outright) or leaving the final frame uncommitted, which snaps
the element back to its non-animated position the instant the animation is
garbage-collected — unacceptable for a persistent navigation state. Native
scroll has no such problem: the scroll position _is_ the persistent state,
with no separate "commit" step.

## Seamless loop: measured clones, not assumed geometry

**Decision**: `mode: 'loop'` clones the full real-slide set once before
and once after itself, then jumps `scrollLeft` by a distance _measured_
from actual `offsetLeft` layout when a scroll settles past the real block.

**Why not a fixed-width assumption?** A simpler design (common in other
libraries) assumes uniform slide width and computes wrap distance as
`slideWidth * slideCount`. That breaks immediately for variable-width
slides, and silently drifts under any layout change (font loading, content
reflow, responsive breakpoints) unless carefully re-measured on every
event. Measuring the actual distance between a real slide and its
corresponding clone via `offsetLeft` sidesteps both problems for free —
it's correct by construction for any slide width, and self-corrects on
`refresh()`/resize because it's recomputed from live layout rather than
cached from options.

**Why full clones, not a minimal N-clone window?** Cloning only "enough
slides to fill the viewport" requires knowing the viewport-to-slide-size
ratio, which is responsive/CSS-driven in this architecture (see below) and
therefore not reliably knowable from JS at build time. Cloning the entire
set is simpler, is correct for any viewport size relative to content, and
the cost (2x-3x DOM nodes while looping) is bounded by slide count — a
reasonable tradeoff for a "content slider" (galleries, testimonials — tens
of slides, not thousands). This is documented as a real tradeoff in
[COMPATIBILITY.md](COMPATIBILITY.md), not hidden.

**Correctness notes from getting this actually working** (three separate
bugs, only observable once the first was fixed and clones started
building for real):

1. `LoopEngine` originally received its real-slide list once, in its
   constructor, as a literal `[]` — `slider.ts` never passed the actual
   discovered slides. `build()` bailed out immediately (`< 2` slides) on
   every call, so no clones were ever created and boundary correction was
   a silent no-op, for the entire lifetime of the instance. Fixed by
   having `build(realSlides, axis)` take the live list explicitly, called
   fresh from `rebuildLoop()`/`refresh()`/resize.
2. Wrap-direction clone selection compared the target index against
   `index` _after_ `setIndex()` had already mutated it to that same
   value, so the delta was always `0` and the (also self-contradictory:
   `delta > 0 && newIndex < index`) branch conditions never ran. Fixed by
   capturing the pre-navigation index in the caller and passing both
   `fromIndex`/`toIndex` through to target resolution.
3. With clones finally building, two more defects surfaced immediately:
   head-clone insertion used `insertBefore(clone, last.nextSibling)` in a
   loop where `last.nextSibling` shifts with each insert, silently
   reversing head-clone order; and the boundary-correction "instant" jump
   (a direct `scrollLeft` write) silently inherited `scroll-behavior:
smooth` from the track, animating instead of jumping — both invisible
   until something actually exercised the corrected clone geometry
   end-to-end. See `src/core/loop.ts` and `tests/e2e/loop.spec.ts` (which
   asserts on clone DOM order and frame-level scroll samples specifically
   because a final-logical-index-only test is exactly what let all of
   this ship undetected).

A related, independently-discovered defect in the RTL scroll-math (not
loop-specific, but only actually exercised end-to-end by an RTL+loop
test): `targetScrollFor()`/`nearestSlideIndex()` applied an extra
`scrollWidth - viewport` shift "to convert to the RTL negative-scrollLeft
convention." In this codebase's `direction: rtl` flex layout, a child's
`offsetLeft` is _already_ in that same coordinate space (RTL flex lays
children out from the container's right edge, so the first child's
`offsetLeft` lands at ~0, exactly matching unscrolled `scrollLeft`'s
"start" position) — the extra shift was simply wrong. It went undetected
for ordinary single-step navigation because mandatory `scroll-snap`
silently corrected the resulting near-miss target to the nearest real
slide; it broke outright once loop mode needed to land on a _specific
clone_ rather than "whichever slide is closest." See `src/core/geometry.ts`.

## Layout/theme in CSS, behavior in JS — enforced by what JS is allowed to write

**Decision**: every dimension/color/spacing is a CSS custom property
consumers set in their own external stylesheet; JS only reads layout
(never writes it) and toggles classes/data-attributes whose _meaning_ is
defined in the static package stylesheet.

**Why**: this isn't just an API design preference — it's a direct
consequence of the "no `element.style` writes" contract. If JS can't write
style, arbitrary/dynamic layout values have nowhere else to live but CSS
custom properties the _consumer_ sets, read by _consumer_ CSS rules. This
forced the option surface split described in
[API.md](API.md#css-custom-property-contract): anything that would
naturally be a runtime-computed pixel value (slide width, gap) must
instead be a design-time CSS value, and JS options are scoped to things
that are genuinely behavioral (which mode, autoplay timing, thresholds).

## Mouse drag in JS, touch swipe left to the browser

**Decision**: `DragController` only engages for `pointerType === 'mouse'`.
Touch input gets no JS drag handling at all — CSS `touch-action` plus the
native scroll container gives swipe/momentum/rubber-banding, provided
`touch-action` actually permits the browser to pan the track's own axis.

**Why**: reimplementing touch scrolling in JS (common in libraries that
need transform-based positioning, since a scrollable native container
isn't available to them) would mean fighting the browser's own gesture
recognition for zero CSP benefit here, since native scrolling was already
the positioning mechanism. Mouse _is_ handled in JS because "click and
drag to scroll a div" isn't native browser behavior for any element,
touch or not.

**A correctness note on `touch-action`, since this broke once**: a
`touch-action` value only lists which pan directions the browser is
allowed to handle _natively_; anything left out is not "left to the
browser to figure out," it's actively disallowed. Setting only the
perpendicular axis (as an earlier version of the CSS did, trying to
"scope panning to the right axis") tells the engine not to natively pan
the track's own scroll direction at all — silently defeating the exact
mechanism this decision relies on, with no JS fallback to catch it since
the drag controller intentionally ignores touch pointers. The current CSS
permits both axes (`pan-x pan-y pinch-zoom`) so the track's own axis
scrolls and the perpendicular axis still passes through to the page. See
[CSP.md](CSP.md#touch-vs-mouse-drag) and `tests/e2e/touch.spec.ts`.

## Fade effect: no scroll axis at all, not a scroll-position illusion

**Decision**: `effect: 'fade'` switches the track to CSS grid stacking
(all slides share one grid cell) and never scrolls; navigation toggles
`data-state="active"/"inactive"` and lets the static CSS `transition:
opacity` handle the crossfade.

**Why not fade-via-scroll-with-opacity-overlay?** Keeping fade as a true
scroll-position-based technique (e.g., stacking slides at the same scroll
offset with opacity mattering only for the active one) would have kept a
single unified positioning model, but grid-stacking is simpler, avoids
layout thrash from keeping N full-size slides scroll-adjacent, and matches
how fade carousels are conventionally expected to behave (no scrollbar,
no swipe-to-fade). The tradeoff — fade mode can't be dragged, and doesn't
use loop clones since there's no boundary to smooth over — is deliberate
and documented in [COMPATIBILITY.md](COMPATIBILITY.md), not an
unaddressed gap.

## Scroll-settle detection: debounced `scroll` events, not a state machine per input type

**Decision**: one `scroll` listener on the track, debounced (~120ms, with
`scrollend` preferred where available in future work), drives index
tracking and loop boundary correction — regardless of whether the scroll
was caused by touch swipe, mouse drag, mouse wheel, scrollbar drag, or a
programmatic `scrollTo()`.

**Why**: the alternative — separate index-tracking logic per input source
(one path for drag-end, one for touch-end, one for keyboard-triggered
`goTo()` completion) — multiplies the surface area for bugs and
inconsistent behavior between input methods, and native scroll doesn't
actually distinguish _why_ it moved. Treating "the scroll position
settled" as the single source of truth for "what slide are we on now"
means every input method gets identical, correct index-tracking for free,
including inputs this package doesn't specifically know about (e.g. a
screen reader's own navigation commands, if they happen to scroll the
container).
