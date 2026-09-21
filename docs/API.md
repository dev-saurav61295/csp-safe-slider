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
  `role`, `tabindex`, `aria-live`, and toggles a `--dragging` class on it;
  it never touches its `style`.
- `[data-slider-slide]` children (direct children only) are your slides —
  images, cards, forms, videos, arbitrary HTML you already control. Each
  gets `role="group"` and `aria-roledescription="slide"` and, unless you
  already set one, a default `aria-label` like `"2 of 5"`.
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
  direction: 'auto', // 'auto' | 'ltr' | 'rtl' — 'auto' reads the resolved `dir`
  mode: 'finite', // 'finite' | 'rewind' | 'loop'
  slidesToScroll: 1,
  align: 'start', // 'start' | 'center' | 'end'
  draggable: true,
  keyboard: true,
  autoplay: false, // false | true | Partial<AutoplayOptions>
  effect: 'slide', // 'slide' | 'fade'
  duration: 400,
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

## Methods

| Method                              | Behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `next(options?)` / `prev(options?)` | Steps by `slidesToScroll` per the boundary mode. `options.animate` defaults `true`; `options.source` defaults `'api'` and is echoed on the `change` event.                                                                                                                                                                                                                                                                                                     |
| `goTo(index, options?)`             | Jumps to a specific logical index. Out-of-range input is clamped (`finite`/`rewind`) or wrapped (`loop`); non-finite input (`NaN`) resolves to `0`.                                                                                                                                                                                                                                                                                                            |
| `refresh()`                         | Re-queries `[data-slider-slide]` children (pick up added/removed slides), rebuilds loop clones, re-clamps the current index, and re-aligns scroll position without animating. Call this after mutating slide content yourself.                                                                                                                                                                                                                                 |
| `update(options)`                   | Merges new options over the current ones (same merge semantics as `createSlider`'s second argument) and applies them **immediately** — no re-initialization, no lost state. Changing `mode` or `axis` rebuilds the loop clone set.                                                                                                                                                                                                                             |
| `getState()`                        | Returns a frozen snapshot: `{ index, previousIndex, slideCount, canPrev, canNext, isDragging, isAutoplaying, isAnimating, axis, direction, mode, destroyed }`. Never mutates; call it again for fresh data.                                                                                                                                                                                                                                                    |
| `play()` / `pause()` / `stop()`     | Autoplay control. `play()` is a no-op if `autoplay` wasn't configured. `pause()`/`stop()` are equivalent — both stop the timer and clear play intent; two names are provided for call-site readability.                                                                                                                                                                                                                                                        |
| `on(event, listener)`               | Returns an unsubscribe function. Safe to call `unsubscribe()` from inside another listener during the same emit.                                                                                                                                                                                                                                                                                                                                               |
| `off(event, listener)`              | Removes a specific listener.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `destroy()`                         | Idempotent. Removes all listeners/observers/timers this instance created, tears down loop clones, removes the built-in controls DOM, and restores nothing else — your original slide nodes and any classes/attributes _you_ set are left alone. After `destroy()`, all mutating methods (`next`, `prev`, `goTo`, `refresh`, `update`, `play`, ...) are silent no-ops; `getState().destroyed` is `true`; `on()` still registers but listeners never fire again. |

## Events

```ts
slider.on('change', (e) => {
  e.index;
  e.previousIndex;
  e.source;
});
```

| Event                                             | Payload                                      | Fires when                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `change`                                          | `{ index, previousIndex, source }`           | The logical index changes, immediately (before the scroll animation completes). `source` is one of `'init' \| 'api' \| 'drag' \| 'keyboard' \| 'autoplay' \| 'control' \| 'resize' \| 'scroll'`. Exactly one `change` per actual index change — calling `goTo()` with the current index is a no-op and does not re-fire it. |
| `settle`                                          | `{ index, previousIndex, source: 'scroll' }` | The scroll position has settled (native scroll-snap or a programmatic scroll finished), after any loop boundary correction. Use this instead of `change` if you need to know the _visual_ transition is done, not just that a navigation was requested.                                                                     |
| `autoplayPlay` / `autoplayPause` / `autoplayStop` | `undefined`                                  | Autoplay state transitions, including transient hover/hidden/offscreen suspension (`autoplayPause`/`autoplayPlay` toggle around those; `autoplayStop` only for a real `stop()`/focus-stop).                                                                                                                                 |
| `dragStart` / `dragEnd`                           | `undefined`                                  | A mouse drag gesture (see [CSP.md](CSP.md) for why touch isn't handled by this) crosses `dragThreshold` and later releases.                                                                                                                                                                                                 |
| `refresh`                                         | `undefined`                                  | After `refresh()` completes.                                                                                                                                                                                                                                                                                                |
| `destroy`                                         | `undefined`                                  | Fired synchronously inside `destroy()`, before listeners are cleared — this is the _last_ event any listener will receive.                                                                                                                                                                                                  |

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
  --slider-duration: 400ms; /* see the note below */
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
belongs in the JS `options` object. The two aren't automatically kept in
sync: the JS `duration` option drives the fade-effect crossfade timing
directly, but for `effect: 'slide'`, native `scrollTo({ behavior: 'smooth'
})` duration/easing is **browser-controlled, not configurable** — the CSS
`--slider-duration` custom property is provided for _your own_ transitions
(e.g. a custom fade override) to read, and you're responsible for keeping
it in step with the JS `duration` value if both matter to you. This is a
real platform limitation (the CSSOM View smooth-scroll spec doesn't expose
duration/easing to script), not an oversight — see
[COMPATIBILITY.md](COMPATIBILITY.md).

Ship-time build-generated CSS for numeric presets (e.g. "3.5 slides
visible") is supported by hand-writing the `calc()` custom-property
overrides shown above; a dedicated build-time generator script is not
included in this release (see COMPATIBILITY.md) — the custom-property
contract covers the same use case without one.

## State/data attributes for styling

| Attribute                                 | Where                       | Meaning                                                                                                       |
| ----------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `data-slider-axis="horizontal\|vertical"` | root, track                 | current axis                                                                                                  |
| `data-slider-mode="finite\|rewind\|loop"` | root                        | current boundary mode                                                                                         |
| `data-slider-effect="slide\|fade"`        | root, track                 | current transition effect                                                                                     |
| `data-state="active\|inactive"`           | each slide                  | which slide is current                                                                                        |
| `data-slider-clone`                       | loop-mode clone slides only | never present on real slides; use this to exclude clones from your own selectors if you query slides directly |
