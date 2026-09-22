# API reference

## Markup contract

`createSlider(root, options)` requires:

```html
<div class="csp-slider" aria-label="...">
  <!-- root: any element -->
  <div data-slider-track>
    <!-- exactly one, required -->
    <div data-slider-slide>...</div>
    <!-- one per slide -->
    <div data-slider-slide>...</div>
  </div>
</div>
```

- `root` is passed to `createSlider` directly. It gets `role="region"`,
  `aria-roledescription="carousel"`, and (if you didn't already provide
  `aria-label`/`aria-labelledby`) a default `aria-label="Carousel"` — always
  provide your own label describing the carousel's _content_, e.g.
  `aria-label="Featured products"`.
- `[data-slider-track]` is the native scroll container. The package adds
  `tabindex`, `aria-live`, `data-slider-axis`, `data-slider-effect`, and
  transiently toggles `csp-slider__track--free` (while `freeScroll` is on),
  `csp-slider__track--dragging` (during a mouse drag),
  `csp-slider__track--correcting` (for one paint around a loop boundary
  jump), and `csp-slider__track--instant` (for one paint around any other
  programmatic immediate scroll — see [CSP.md](CSP.md#animate-false-is-genuinely-immediate));
  it never touches its `style`. Every attribute/class this package applies
  to the track — and to the root and each slide — is reverted by
  `destroy()`; see the `destroy()` row below.
- `[data-slider-slide]` children (direct children only) are your slides —
  images, cards, forms, videos, arbitrary HTML you already control. Each
  gets `role="group"` (unless the slide root's own tag doesn't permit that
  ARIA role, e.g. `<a href>`/`<button>`/`<input>`/`<select>`/`<textarea>`
  used directly as the slide — then only `aria-roledescription` is set) and
  `aria-roledescription="slide"`, plus, unless you already set one, a
  default `aria-label` like `"2 of 5"`.
- If `controls: true` (default), prev/next buttons, page dots, a fraction
  readout, a `<progress>` element, and (if autoplay is configured) a
  rotation toggle are appended to `root` after the track, as real DOM
  nodes built with `document.createElement`/`textContent` — never
  `innerHTML`.

## `createSlider(root, options)`

```ts
import { createSlider } from 'csp-safe-slider';

const slider = createSlider(root, {
  startIndex: 0,
  axis: 'horizontal', // 'horizontal' | 'vertical'
  direction: 'auto', // 'auto' | 'ltr' | 'rtl' — 'auto' reads the resolved `dir`;
  // 'ltr'/'rtl' set the `dir` attribute on `root` (restored on
  // destroy()/back to 'auto')
  mode: 'finite', // 'finite' | 'rewind' | 'loop'
  slidesToScroll: 1,
  align: 'start', // 'start' | 'center' | 'end'
  draggable: true,
  keyboard: true,
  autoplay: false, // false | true | Partial<AutoplayOptions>
  effect: 'slide', // 'slide' | 'fade'
  duration: 400, // @deprecated no runtime effect — see CSS custom-property contract below
  freeScroll: false,
  dragThreshold: 6,
  reducedMotion: true,
  controls: true,
  labels: {/* ControlsLabels overrides */},
});
```

Every option has a default (see `src/core/options.ts`); pass only what you
want to change. Invalid values (e.g. `slidesToScroll: 0`, an unknown
`axis`) throw a `RangeError` synchronously from `createSlider`/`update()`.

### `AutoplayOptions`

```ts
interface AutoplayOptions {
  interval: number; // ms, >= 100
  pauseOnHover: boolean; // default true
  pauseOnFocus: boolean; // default true — see below
  pauseOnHiddenDocument: boolean; // default true
  pauseOnOffscreen: boolean; // default true
}
```

`autoplay: true` expands to the full default config; `autoplay: {...}`
merges partial overrides onto the default; `autoplay: false` disables it.
`pauseOnFocus` is a full **stop**, not a hover-style pause: per the WAI
carousel pattern, focus entering the carousel stops rotation and requires
an explicit `play()` call (e.g. the built-in rotation button, or your own
control) to resume — it does not resume on blur.

### Index and boundary semantics

Indexes are logical, `0`-based, over your real slides only (clones used
internally for `mode: 'loop'` are never counted or addressable).

| mode     | past the last slide                                                                                                                              | before the first slide                   |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| `finite` | clamps, `next()` is a no-op, `canNext` is `false`                                                                                                | same, symmetric                          |
| `rewind` | jumps directly to index `0`                                                                                                                      | jumps directly to index `slideCount - 1` |
| `loop`   | wraps seamlessly (scrolls into a clone, then snaps back to the equivalent real position — see [CSP.md](CSP.md#how-seamless-loop-stays-csp-safe)) | symmetric                                |

`slidesToScroll` groups indexes into pages for `next()`/`prev()` and for
the built-in dot controls; `goTo(index)` always addresses an individual
slide index, not a page.

### `animate: false` is genuinely immediate

`next()`, `prev()`, `goTo()`, `refresh()`, `update()`, resize realignment,
and the initial `startIndex` placement all resolve every non-animated
scroll through the same mechanism: an external, temporarily-applied track
class (not an inline `style`) that forces `scroll-behavior: auto` for the
duration of the jump, overriding the structural CSS's
`scroll-behavior: smooth`. Passing `behavior: 'auto'` to `scrollTo()` alone
does **not** guarantee this — the CSSOM View spec permits a UA to still
defer to the computed `scroll-behavior` — so every one of the call sites
above goes through this mechanism rather than relying on the `scrollTo()`
option by itself. See
[CSP.md](CSP.md#animate-false-is-genuinely-immediate) for the mechanism
and [ACCESSIBILITY.md](ACCESSIBILITY.md#reduced-motion) for how this
interacts with `prefers-reduced-motion`.

## Methods

| Method                              | Behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `next(options?)` / `prev(options?)` | Steps by `slidesToScroll` per the boundary mode. `options.animate` defaults `true`; `options.source` defaults `'api'` and is echoed on the `change` event.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `goTo(index, options?)`             | Jumps to a specific logical index. Out-of-range input is clamped (`finite`/`rewind`) or wrapped (`loop`); non-finite input (`NaN`) resolves to `0`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `refresh()`                         | Re-queries `[data-slider-slide]` children (pick up added/removed slides), rebuilds loop clones, re-clamps the current index, and re-aligns scroll position without animating. Call this after mutating slide content yourself.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `update(options)`                   | Merges new options over the current ones (same merge semantics as `createSlider`'s second argument) and applies them **immediately** — no re-initialization, no lost state. See [Runtime option updates](#runtime-option-updates) below for exactly what each updateable option does.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `getState()`                        | Returns a frozen snapshot: `{ index, previousIndex, slideCount, canPrev, canNext, isDragging, isAutoplaying, isAnimating, axis, direction, mode, destroyed }`. Never mutates; call it again for fresh data.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `play()` / `pause()` / `stop()`     | Autoplay control. `play()` is a no-op if `autoplay` wasn't configured, and also a no-op while `reducedMotion: true` (the default) and the OS currently reports `prefers-reduced-motion: reduce` — see [ACCESSIBILITY.md](ACCESSIBILITY.md#reduced-motion). `pause()`/`stop()` are equivalent — both stop the timer and clear play intent; two names are provided for call-site readability.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `on(event, listener)`               | Returns an unsubscribe function. Safe to call `unsubscribe()` from inside another listener during the same emit.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `off(event, listener)`              | Removes a specific listener.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `destroy()`                         | Idempotent. Removes all listeners/observers/timers this instance created (including the `prefers-reduced-motion` media-query listener), cancels any in-flight loop-correction/immediate-scroll animation-frame callbacks, tears down loop clones, removes the built-in controls DOM, and **restores every attribute and class this instance applied** to the root, the track, and every slide it has ever managed (including slides added later via `refresh()`, even ones since removed from the track) — `role`, `aria-roledescription`, `aria-label`, `data-slider-auto-label`, `data-state`, `aria-hidden`, `data-slider-axis`, `data-slider-mode`, `data-slider-effect`, `tabindex`, `aria-live`, the `dir` attribute (if an explicit `direction` option had changed it), the active-slide class, and every transient track class listed above. Restoration is ownership-aware: if you overwrite a library-set value yourself after init (e.g. replace an auto-generated `aria-label`), `destroy()` leaves your replacement alone instead of reverting past it. Your original slide _nodes_ are never replaced — only their attributes/classes are put back — so node identity, attached listeners, and framework references survive both init and `destroy()`. After `destroy()`, all mutating methods (`next`, `prev`, `goTo`, `refresh`, `update`, `play`, ...) are silent no-ops; `getState().destroyed` is `true`; `on()` still registers but listeners never fire again. See [ARCHITECTURE.md](ARCHITECTURE.md#dom-ownership-and-restoration) for the mechanism. |

## Runtime option updates

`update(options)` applies every field below live, without recreating the
instance:

| Option          | Effect when changed via `update()`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `axis`          | Keyboard arrow-key mapping and mouse-drag axis switch immediately (read live, not captured at creation). Rebuilds loop clones if `mode: 'loop'`.                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `mode`          | Rebuilds loop clones (built only for `mode: 'loop'` + `effect: 'slide'`, torn down otherwise).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `effect`        | Rebuilds loop clones per the same rule as `mode`, and re-applies fade accessibility state (`aria-hidden`/tabindex neutralization for inactive slides when entering `fade`; fully restored when leaving it).                                                                                                                                                                                                                                                                                                                                                                                     |
| `dragThreshold` | Takes effect on the next drag gesture (read live by the drag controller).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `draggable`     | Attaches/detaches the drag controller (only while `effect: 'slide'`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `keyboard`      | Attaches/detaches the keyboard controller.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `direction`     | `'ltr'`/`'rtl'` sets the `dir` attribute on `root` (restoring whatever it was before, on `destroy()` or a later `update()` back to `'auto'`); `'auto'` reverts to reading the resolved computed `dir`. See [ACCESSIBILITY.md](ACCESSIBILITY.md#rtl-direction).                                                                                                                                                                                                                                                                                                                                  |
| `autoplay`      | `false → {...}` establishes autoplay listeners/controls and auto-starts playing, exactly like passing `autoplay` to `createSlider()` — unless reduced motion is currently active (see `reducedMotion` below). `{...} → false` stops the timer, detaches its listeners, and hides the rotation control. `{...} → {...}` (staying enabled) applies interval/pause-rule changes immediately and restarts the countdown, but **never** changes play/pause intent — a prior explicit `pause()` stays paused across any number of further `update()` calls.                                           |
| `reducedMotion` | Takes effect immediately. `false → true` while the OS is currently reporting `prefers-reduced-motion: reduce` stops autoplay right away (if it was running) and makes further programmatic navigation immediate rather than smooth. `true → false` makes the current OS preference stop affecting this instance's JS behavior from that point on (autoplay is **not** auto-resumed — an explicit `play()` is always required after any reduced-motion stop, regardless of which side of this toggle caused it). See [ACCESSIBILITY.md](ACCESSIBILITY.md#reduced-motion) for the full semantics. |
| everything else | (`slidesToScroll`, `align`, `startIndex`, `freeScroll`, `duration`) re-rendered/re-validated as applicable; `startIndex` only affects the _next_ `createSlider()`, not an already-running instance.                                                                                                                                                                                                                                                                                                                                                                                             |

Calling `update()` repeatedly (including with no actual changes) never
duplicates timers, listeners, observers, controls, or clones — each is
torn down and re-established idempotently rather than stacked.

## Events

```ts
slider.on('change', (e) => {
  e.index;
  e.previousIndex;
  e.source;
});
```

| Event                                             | Payload                                      | Fires when                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `change`                                          | `{ index, previousIndex, source }`           | The logical index changes, immediately (before the scroll animation completes). `source` is one of `'init' \| 'api' \| 'drag' \| 'keyboard' \| 'autoplay' \| 'control' \| 'resize' \| 'scroll'`. Exactly one `change` per actual index change — calling `goTo()` with the current index is a no-op and does not re-fire it.                                                                                                                                    |
| `settle`                                          | `{ index, previousIndex, source: 'scroll' }` | The scroll position has settled (native scroll-snap or a programmatic scroll finished), after any loop boundary correction. Use this instead of `change` if you need to know the _visual_ transition is done, not just that a navigation was requested.                                                                                                                                                                                                        |
| `autoplayPlay` / `autoplayPause` / `autoplayStop` | `undefined`                                  | Autoplay state transitions, including transient hover/hidden/offscreen suspension (`autoplayPause`/`autoplayPlay` toggle around those; `autoplayStop` only for a real `stop()`/focus-stop).                                                                                                                                                                                                                                                                    |
| `dragStart` / `dragEnd`                           | `undefined`                                  | A **mouse** drag gesture crosses `dragThreshold` and later releases; `getState().isDragging` reflects the same mouse-only signal. Touch swipe is handled natively by the browser (see [CSP.md](CSP.md#touch-vs-mouse-drag)) and never fires these or sets `isDragging` — listen for the `settle` event (fired once native scrolling, from any input method, comes to rest) if you need an input-agnostic "the user finished moving the slider" signal instead. |
| `refresh`                                         | `undefined`                                  | After `refresh()` completes.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `destroy`                                         | `undefined`                                  | Fired synchronously inside `destroy()`, before listeners are cleared — this is the _last_ event any listener will receive.                                                                                                                                                                                                                                                                                                                                     |

## CSS custom-property contract

JavaScript never writes `style`, so every dimension/color/spacing is a CSS
custom property, set in **your** external stylesheet:

```css
.my-gallery {
  --slider-gap: 1rem;
  --slider-slide-size: 100%; /* flex-basis of each slide */
  --slider-control-color: #173f5f;
  --slider-control-bg: rgba(0, 0, 0, 0.55);
  --slider-control-size: 2.75rem;
  --slider-dot-size: 0.5rem;
  --slider-duration: 400ms; /* the ONLY control over fade timing — see the note below */
  --slider-radius: 0.5rem;
}

@media (min-width: 48rem) {
  .my-gallery {
    --slider-slide-size: calc((100% - 2 * var(--slider-gap)) / 3);
  }
}
```

**Precedence and JS/CSS split:** layout/theme values (size, gap, color,
radius, responsive breakpoints) belong in your CSS as custom properties or
plain rules targeting `.csp-slider__slide`/`.csp-slider__track`/etc.
Behavior (which mode, whether to loop, autoplay timing, drag thresholds)
belongs in the JS `options` object.

**Timing has no JS/CSS split at all — it's 100% CSS, for both effects:**

- `effect: 'fade'` crossfade timing is controlled **exclusively** by the
  `--slider-duration` custom property (via `transition: opacity
var(--slider-duration) ease` in `css/csp-safe-slider.css`). There is no
  JS-side connection to this value — JavaScript never writes `style` or
  `style.setProperty()` (that would itself be a forbidden inline-style
  write), so it has no way to push a numeric option into a CSS custom
  property. Set `--slider-duration` directly in your own stylesheet.
- `effect: 'slide'` timing (native `scrollTo({ behavior: 'smooth' })`)
  is **browser-controlled and not configurable from script at all** — a
  real platform limitation (the CSSOM View smooth-scroll spec doesn't
  expose duration/easing to script), not something either `--slider-duration`
  or a JS option could override.

**The JS `duration` option is deprecated and does nothing at runtime.**
An earlier version of this documentation incorrectly claimed it drove
fade-effect timing directly — it never did; it was validated (must be a
finite number `>= 0`) and otherwise ignored. It's kept, accepting the same
values, purely so existing `{ duration: 400 }` call sites don't need to
change; new code should omit it and set `--slider-duration` in CSS
instead. See [COMPATIBILITY.md](COMPATIBILITY.md) for the full
reconciliation and why this isn't treated as a breaking change.

Ship-time build-generated CSS for numeric presets (e.g. "3.5 slides
visible") is supported by hand-writing the `calc()` custom-property
overrides shown above; a dedicated build-time generator script is not
included in this release (see COMPATIBILITY.md) — the custom-property
contract covers the same use case without one.

## Loop-mode clones are form-safe

`mode: 'loop'` clones every real slide once before and once after the real
block (`data-slider-clone`) for seamless wrap-around scrolling. Beyond
`inert`, `aria-hidden="true"`, ID removal, and forcing focusable content
(including the slide root itself) to `tabindex="-1"`, every clone also has
every `name` attribute stripped (on the clone root and every descendant)
and every native form control (`input`, `select`, `textarea`, `button`)
disabled. `inert` alone does **not** exclude an element from HTML form
submission — a named, `inert` control is still a "successful control" per
the forms spec — so without this, a form containing slide content in
`mode: 'loop'` would submit each control's value once per clone in
addition to once for the real slide. Real slide controls are never
touched: their `name`, value, checked state, and `disabled` state are
exactly as you set them. See
[CSP.md](CSP.md#loop-clones-cannot-duplicate-form-submissions).

## State/data attributes for styling

| Attribute                                 | Where                       | Meaning                                                                                                       |
| ----------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `data-slider-axis="horizontal\|vertical"` | root, track                 | current axis                                                                                                  |
| `data-slider-mode="finite\|rewind\|loop"` | root                        | current boundary mode                                                                                         |
| `data-slider-effect="slide\|fade"`        | root, track                 | current transition effect                                                                                     |
| `data-state="active\|inactive"`           | each slide                  | which slide is current                                                                                        |
| `data-slider-clone`                       | loop-mode clone slides only | never present on real slides; use this to exclude clones from your own selectors if you query slides directly |
