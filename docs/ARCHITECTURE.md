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
scroll has no such problem: the scroll position *is* the persistent state,
with no separate "commit" step.

## Seamless loop: measured clones, not assumed geometry

**Decision**: `mode: 'loop'` clones the full real-slide set once before
and once after itself, then jumps `scrollLeft` by a distance *measured*
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

## Layout/theme in CSS, behavior in JS — enforced by what JS is allowed to write

**Decision**: every dimension/color/spacing is a CSS custom property
consumers set in their own external stylesheet; JS only reads layout
(never writes it) and toggles classes/data-attributes whose *meaning* is
defined in the static package stylesheet.

**Why**: this isn't just an API design preference — it's a direct
consequence of the "no `element.style` writes" contract. If JS can't write
style, arbitrary/dynamic layout values have nowhere else to live but CSS
custom properties the *consumer* sets, read by *consumer* CSS rules. This
forced the option surface split described in
[API.md](API.md#css-custom-property-contract): anything that would
naturally be a runtime-computed pixel value (slide width, gap) must
instead be a design-time CSS value, and JS options are scoped to things
that are genuinely behavioral (which mode, autoplay timing, thresholds).

## Mouse drag in JS, touch swipe left to the browser

**Decision**: `DragController` only engages for `pointerType === 'mouse'`.
Touch input gets no JS drag handling at all — CSS `touch-action` plus the
native scroll container already gives swipe/momentum/rubber-banding.

**Why**: reimplementing touch scrolling in JS (common in libraries that
need transform-based positioning, since a scrollable native container
isn't available to them) would mean fighting the browser's own gesture
recognition for zero CSP benefit here, since native scrolling was already
the positioning mechanism. Mouse *is* handled in JS because "click and
drag to scroll a div" isn't native browser behavior for any element,
touch or not.

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
actually distinguish *why* it moved. Treating "the scroll position
settled" as the single source of truth for "what slide are we on now"
means every input method gets identical, correct index-tracking for free,
including inputs this package doesn't specifically know about (e.g. a
screen reader's own navigation commands, if they happen to scroll the
container).
