import { AutoplayController } from './autoplay.js';
import { DomOwnership } from './attrs.js';
import { Controls, type ControlsLabels } from './controls.js';
import { DragController } from './drag.js';
import {
  applyTrackClassTemporarily,
  clearTrackTemporaryClass,
  FOCUSABLE_SELECTOR_ALL,
  prefersReducedMotion,
  resolveDirection,
  watchReducedMotion,
} from './dom.js';
import { Emitter } from './events.js';
import { nearestSlideIndex, targetScrollFor } from './geometry.js';
import { KeyboardController } from './keyboard.js';
import { CORRECTING_CLASS, LoopEngine } from './loop.js';
import { DEFAULT_OPTIONS, normalizeOptions } from './options.js';
import {
  canGoNext,
  canGoPrev,
  computePageCount,
  computeStep,
  indexToPage,
  resolveGoTo,
} from './state.js';
import type {
  AutoplayOptions,
  ChangeSource,
  GoToOptions,
  Slider,
  SliderEventName,
  SliderInit,
  SliderListener,
  SliderOptions,
  SliderState,
} from './types.js';

const SLIDE_SELECTOR = '[data-slider-slide]';
const TRACK_SELECTOR = '[data-slider-track]';
const INSTANT_SCROLL_CLASS = 'csp-slider__track--instant';

export interface CreateSliderInit extends SliderInit {
  labels?: Partial<ControlsLabels>;
  /** Append built-in prev/next/dots/fraction/progress controls. Default true. */
  controls?: boolean;
}

export function createSlider(root: HTMLElement, init: CreateSliderInit = {}): Slider {
  if (!root || root.nodeType !== 1) {
    throw new TypeError('createSlider(root, ...) requires an HTMLElement root.');
  }

  const trackCandidate = root.querySelector<HTMLElement>(TRACK_SELECTOR);
  if (!trackCandidate) {
    throw new Error(
      'createSlider: root must contain a descendant with [data-slider-track] wrapping the slides.',
    );
  }
  const track: HTMLElement = trackCandidate;

  let options: SliderOptions = normalizeOptions(init, DEFAULT_OPTIONS);

  // Always re-queries the live media state rather than caching it from the
  // `watchReducedMotion` listener below — the listener's 'change' event
  // dispatches asynchronously (a task, not a microtask), so a cached value
  // updated only from that callback would still read stale immediately
  // after a synchronous preference flip (observable in tests that emulate
  // the media change and call an API in the same tick). A live
  // `matchMedia(...).matches` read has no such lag. Combined with
  // `options.reducedMotion` — "should this instance respect that state at
  // all" — this is the one place that decides whether motion is currently
  // suppressed. Unlike the previous implementation, the configured
  // `autoplay` option itself is never mutated because of this — doing so
  // permanently lost the distinction between "never configured" and
  // "configured but currently suppressed", making it impossible to resume
  // once the preference changed back. See docs/ACCESSIBILITY.md.
  function reduceMotionActive(): boolean {
    return options.reducedMotion && prefersReducedMotion();
  }

  const emitter = new Emitter();
  const loopEngine = new LoopEngine(track, options.axis);
  const owned = new DomOwnership();
  // Every real slide element this instance has ever discovered, across every
  // refresh() — not pruned when a slide is later removed from the track, so
  // destroy() can still restore an element even if the caller detached it
  // from the DOM without calling refresh() first.
  const managedSlides = new Set<HTMLElement>();
  let realSlides: HTMLElement[] = [];
  let index = 0;
  let previousIndex = 0;
  let isDragging = false;
  let isAnimating = false;
  let destroyed = false;
  let scrollSettleTimer: ReturnType<typeof setTimeout> | null = null;

  const wantControls = init.controls !== false;
  const controls = wantControls
    ? new Controls(
        {
          onPrev: () => publicApi.prev({ source: 'control' } as GoToOptions),
          onNext: () => publicApi.next({ source: 'control' } as GoToOptions),
          onGoToPage: (page) =>
            publicApi.goTo(page * options.slidesToScroll, { source: 'control' } as GoToOptions),
          onToggleAutoplay: () => {
            if (autoplay.isPlaying) publicApi.pause();
            else publicApi.play();
          },
        },
        init.labels,
        options.autoplay !== false,
      )
    : null;
  if (controls) root.append(controls.root);

  // Axis/threshold are read live via getters (not captured at construction)
  // so an `update()` that changes them takes effect without recreating the
  // controller or risking duplicate/leaked listeners.
  const dragController = new DragController(track, {
    getAxis: () => options.axis,
    getThreshold: () => options.dragThreshold,
    onDragStart: () => {
      isDragging = true;
      emitter.emit('dragStart', undefined);
    },
    onDragEnd: () => {
      isDragging = false;
      emitter.emit('dragEnd', undefined);
    },
  });

  const keyboardController = new KeyboardController(
    root,
    () => options.axis,
    () => resolveDirection(root),
    {
      prev: () => publicApi.prev({ source: 'keyboard' } as GoToOptions),
      next: () => publicApi.next({ source: 'keyboard' } as GoToOptions),
      first: () => publicApi.goTo(0, { source: 'keyboard' } as GoToOptions),
      last: () => publicApi.goTo(realSlides.length - 1, { source: 'keyboard' } as GoToOptions),
    },
  );

  const autoplay = new AutoplayController(
    root,
    options.autoplay || {
      interval: 5000,
      pauseOnHover: true,
      pauseOnFocus: true,
      pauseOnHiddenDocument: true,
      pauseOnOffscreen: true,
    },
    {
      advance: () => publicApi.next({ source: 'autoplay' } as GoToOptions),
      onPlay: () => {
        setTrackLiveRegion();
        controls?.setAutoplayState(true);
        emitter.emit('autoplayPlay', undefined);
      },
      onPause: () => {
        setTrackLiveRegion();
        controls?.setAutoplayState(false);
        emitter.emit('autoplayPause', undefined);
      },
      onStop: () => {
        setTrackLiveRegion();
        controls?.setAutoplayState(false);
        emitter.emit('autoplayStop', undefined);
      },
    },
  );

  /**
   * Applies the *current* combined reduced-motion state to already-running
   * autoplay. Called both on a live OS preference change and right after an
   * `update()` that changes `reducedMotion` — either can newly activate
   * suppression, and either must take effect immediately rather than
   * waiting for the next autoplay tick. Switching *out* of suppression
   * deliberately does nothing here: autoplay that was stopped for reduced
   * motion never restarts on its own, only via an explicit `play()` — see
   * docs/ACCESSIBILITY.md.
   */
  function reconcileReducedMotion(): void {
    if (reduceMotionActive() && autoplay.isPlaying) {
      autoplay.stop();
    }
  }

  const unsubscribeReducedMotion = watchReducedMotion(() => {
    reconcileReducedMotion();
  });

  let resizeObserver: ResizeObserver | null = null;

  // Explicit `direction` support: 'auto' just reads the resolved computed
  // `dir` (handled entirely by `resolveDirection()`); 'ltr'/'rtl' write the
  // native `dir` attribute (a plain DOM attribute, not `style`) so layout,
  // scrollLeft's RTL sign convention, and `resolveDirection()` all agree.
  // The pre-existing attribute (if any) is restored once direction goes
  // back to 'auto' or the instance is destroyed.
  let explicitDirApplied = false;
  let originalDirAttr: string | null = null;

  function applyDirection(): void {
    if (options.direction === 'auto') {
      restoreDirection();
      return;
    }
    if (!explicitDirApplied) {
      originalDirAttr = root.getAttribute('dir');
      explicitDirApplied = true;
    }
    root.setAttribute('dir', options.direction);
  }

  function restoreDirection(): void {
    if (!explicitDirApplied) return;
    if (originalDirAttr === null) root.removeAttribute('dir');
    else root.setAttribute('dir', originalDirAttr);
    explicitDirApplied = false;
    originalDirAttr = null;
  }

  function setTrackLiveRegion(): void {
    owned.setAttr(track, 'aria-live', autoplay.isPlaying ? 'off' : 'polite');
  }

  function applyStateAttributes(): void {
    // Explicit tabindex so the track is reliably keyboard-focusable across
    // browsers — some implicitly treat scrollable overflow containers as
    // focusable and some don't, so we don't rely on that being consistent.
    if (!track.hasAttribute('tabindex')) owned.setAttr(track, 'tabindex', '0');
    applyDirection();
    owned.setAttr(root, 'data-slider-axis', options.axis);
    owned.setAttr(root, 'data-slider-mode', options.mode);
    owned.setAttr(root, 'data-slider-effect', options.effect);
    owned.setAttr(track, 'data-slider-axis', options.axis);
    owned.setAttr(track, 'data-slider-effect', options.effect);
    owned.setClass(track, 'csp-slider__track--free', options.freeScroll);
  }

  function setupA11y(): void {
    applyStateAttributes();
    if (!root.hasAttribute('role')) owned.setAttr(root, 'role', 'region');
    if (!root.getAttribute('aria-roledescription')) {
      owned.setAttr(root, 'aria-roledescription', 'carousel');
    }
    if (!root.getAttribute('aria-label') && !root.getAttribute('aria-labelledby')) {
      owned.setAttr(root, 'aria-label', 'Carousel');
    }
    setTrackLiveRegion();
    labelSlides();
  }

  // Tracks the exact value this instance last wrote for a library-owned
  // default label, so a later `labelSlides()` pass can tell "still ours,
  // safe to renumber" apart from "consumer has since overwritten this
  // aria-label directly" — the latter releases ownership rather than
  // stomping the consumer's new value back to "N of M" on every refresh.
  const autoLabelValues = new WeakMap<HTMLElement, string>();

  /**
   * `role="group"` is invalid ARIA on an element whose tag already carries
   * an implicit interactive role that doesn't permit it as an override
   * (axe's `aria-allowed-role` rule) — e.g. `<a href>` or `<button>` used
   * directly as `[data-slider-slide]`. `aria-roledescription` has no such
   * restriction and still applies to describe the slide either way.
   */
  function canForceGroupRole(slide: HTMLElement): boolean {
    if (slide.tagName === 'A') return !slide.hasAttribute('href');
    return !['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(slide.tagName);
  }

  /**
   * Default `aria-label`s ("2 of 5") are library-owned and must track slide
   * count across `refresh()`; a consumer-authored `aria-label` (present
   * from the start, or written over a previous default at any point) is
   * left untouched from then on.
   */
  function labelSlides(): void {
    const count = realSlides.length;
    realSlides.forEach((slide, i) => {
      if (canForceGroupRole(slide)) owned.setAttr(slide, 'role', 'group');
      owned.setAttr(slide, 'aria-roledescription', 'slide');
      const currentLabel = slide.getAttribute('aria-label');
      const hasLabelledby = slide.hasAttribute('aria-labelledby');
      const stillOwned =
        slide.hasAttribute('data-slider-auto-label') && currentLabel === autoLabelValues.get(slide);
      const hasForeignLabel = (currentLabel !== null || hasLabelledby) && !stillOwned;
      if (hasForeignLabel) {
        owned.removeAttr(slide, 'data-slider-auto-label');
        autoLabelValues.delete(slide);
        return;
      }
      const value = `${i + 1} of ${count}`;
      owned.setAttr(slide, 'aria-label', value);
      owned.setAttr(slide, 'data-slider-auto-label', '');
      autoLabelValues.set(slide, value);
    });
  }

  function queryRealSlides(): HTMLElement[] {
    const slides = Array.from(track.querySelectorAll<HTMLElement>(SLIDE_SELECTOR)).filter(
      (el) => !el.hasAttribute('data-slider-clone') && el.parentElement === track,
    );
    for (const slide of slides) managedSlides.add(slide);
    return slides;
  }

  function rebuildLoop(): void {
    loopEngine.teardown();
    if (options.mode === 'loop' && options.effect === 'slide') {
      loopEngine.build(realSlides, options.axis);
    }
  }

  // Tracks focusable descendants this instance has forced to tabindex="-1"
  // for inactive fade slides, and each one's original tabindex value (or
  // `null` for "had none"), so re-activating a slide restores exactly what
  // the consumer had — never just `removeAttribute` regardless of origin —
  // and switching away from `fade` entirely can restore every one of them.
  const originalTabIndex = new WeakMap<HTMLElement, string | null>();
  const neutralizedFocusables = new Set<HTMLElement>();

  function setFocusable(el: HTMLElement, focusable: boolean): void {
    if (focusable) {
      if (!neutralizedFocusables.has(el)) return;
      const original = originalTabIndex.get(el) ?? null;
      if (original === null) el.removeAttribute('tabindex');
      else el.setAttribute('tabindex', original);
      neutralizedFocusables.delete(el);
    } else {
      if (neutralizedFocusables.has(el)) return;
      originalTabIndex.set(el, el.getAttribute('tabindex'));
      el.setAttribute('tabindex', '-1');
      neutralizedFocusables.add(el);
    }
  }

  /**
   * Every focusable element neutralization must consider for a slide: its
   * descendants (via `querySelectorAll`, which never matches the element
   * it's called on) plus the slide root itself when the root *is* the
   * focusable thing — e.g. `<a data-slider-slide>`, `<button
   * data-slider-slide>`, or a root with an author `tabindex`. Loop clones
   * use the same rule (see `LoopEngine.cloneNeutralized()`).
   */
  function focusablesIn(slide: HTMLElement): HTMLElement[] {
    const descendants = Array.from(slide.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR_ALL));
    return slide.matches(FOCUSABLE_SELECTOR_ALL) ? [slide, ...descendants] : descendants;
  }

  function restoreAllFocusables(): void {
    if (neutralizedFocusables.size === 0) return;
    for (const el of neutralizedFocusables) {
      const original = originalTabIndex.get(el) ?? null;
      if (original === null) el.removeAttribute('tabindex');
      else el.setAttribute('tabindex', original);
    }
    neutralizedFocusables.clear();
  }

  function updateSlideStates(): void {
    if (options.effect !== 'fade') restoreAllFocusables();
    realSlides.forEach((slide, i) => {
      const active = i === index;
      owned.setClass(slide, 'csp-slider__slide--active', active);
      owned.setAttr(slide, 'data-state', active ? 'active' : 'inactive');
      if (options.effect === 'fade') {
        owned.setAttr(slide, 'aria-hidden', active ? 'false' : 'true');
        focusablesIn(slide).forEach((el) => setFocusable(el, active));
      } else {
        owned.removeAttr(slide, 'aria-hidden');
      }
    });
  }

  function updateControls(): void {
    if (!controls) return;
    const pageCount = computePageCount(realSlides.length, options.slidesToScroll);
    const page = indexToPage(index, options.slidesToScroll);
    controls.update(
      page,
      pageCount,
      canGoPrev(index, realSlides.length, options.mode),
      canGoNext(index, realSlides.length, options.mode),
    );
  }

  function rebuildDots(): void {
    if (!controls) return;
    controls.buildDots(computePageCount(realSlides.length, options.slidesToScroll));
  }

  /**
   * `fromIndex` is the logical index *before* this navigation (captured by
   * the caller before `setIndex` mutates the closure's `index`) — required
   * to detect an adjacent wrap and route through the correct neighboring
   * clone. Passing `fromIndex === toIndex` (refresh/resize/update/init)
   * always resolves to a direct, non-clone target.
   */
  function scrollToIndex(fromIndex: number, toIndex: number, animate: boolean): void {
    if (options.effect === 'fade') return;
    const el = resolveScrollTarget(fromIndex, toIndex);
    if (!el) return;

    const shouldAnimate = animate && !reduceMotionActive();
    const pos = targetScrollFor(track, el, options.axis, options.align);

    isAnimating = shouldAnimate;
    // `behavior: 'auto'` on `scrollTo()` is not on its own a guarantee of an
    // immediate jump: the CSSOM View spec lets a UA still defer to the
    // element's computed `scroll-behavior`, which stays `smooth` on
    // `.csp-slider__track` (see css/csp-safe-slider.css). Forcing
    // `scroll-behavior: auto` for the duration of the call via an external
    // class — the same mechanism `LoopEngine` uses for its boundary
    // correction jump — closes that gap without any inline style.
    if (!shouldAnimate) applyTrackClassTemporarily(track, INSTANT_SCROLL_CLASS);
    track.scrollTo({
      [options.axis === 'horizontal' ? 'left' : 'top']: pos,
      behavior: shouldAnimate ? 'smooth' : 'auto',
    } as ScrollToOptions);
  }

  /**
   * Only an *adjacent* single-step wrap (last -> 0, or 0 -> last) gets
   * routed through the neighboring clone for a seamless scroll. A
   * multi-step `slidesToScroll` group or a direct `goTo()` that crosses the
   * boundary in one call still lands on the correct real slide, just as a
   * hard jump rather than a seamless scroll — see docs/COMPATIBILITY.md.
   */
  function resolveScrollTarget(fromIndex: number, toIndex: number): HTMLElement | undefined {
    const count = realSlides.length;
    if (options.mode === 'loop' && loopEngine.isActive && count > 1) {
      if (fromIndex === count - 1 && toIndex === 0) {
        return loopEngine.headSlides[toIndex] ?? realSlides[toIndex];
      }
      if (fromIndex === 0 && toIndex === count - 1) {
        return loopEngine.tailSlides[toIndex] ?? realSlides[toIndex];
      }
    }
    return realSlides[toIndex];
  }

  function setIndex(newIndex: number, source: ChangeSource): void {
    if (realSlides.length === 0) return;
    const resolved =
      options.mode === 'loop'
        ? ((newIndex % realSlides.length) + realSlides.length) % realSlides.length
        : Math.min(Math.max(newIndex, 0), realSlides.length - 1);

    if (resolved === index && source !== 'init') return;

    previousIndex = index;
    index = resolved;
    updateSlideStates();
    updateControls();

    const payload = { index, previousIndex, source };
    emitter.emit('change', payload);
    if (source !== 'scroll') autoplay.notifyInteraction();
  }

  function onScroll(): void {
    if (options.effect === 'fade') return;
    if (scrollSettleTimer) clearTimeout(scrollSettleTimer);
    scrollSettleTimer = setTimeout(onScrollSettle, 120);
  }

  function onScrollSettle(): void {
    scrollSettleTimer = null;
    if (destroyed) return;
    loopEngine.correctBoundary();
    const nearest = nearestSlideIndex(track, realSlides, options.axis);
    isAnimating = false;
    if (nearest !== index) {
      setIndex(nearest, 'scroll');
    }
    emitter.emit('settle', { index, previousIndex, source: 'scroll' });
  }

  let resizeRaf = 0;

  function attachResizeObserver(): void {
    if (typeof ResizeObserver === 'undefined') return;
    resizeObserver = new ResizeObserver(() => {
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = 0;
        if (destroyed) return;
        rebuildLoop();
        scrollToIndex(index, index, false);
      });
    });
    resizeObserver.observe(track);
  }

  function initialize(): void {
    realSlides = queryRealSlides();
    setupA11y();
    rebuildLoop();
    rebuildDots();

    track.addEventListener('scroll', onScroll, { passive: true });
    if (options.draggable && options.effect === 'slide') dragController.attach();
    if (options.keyboard) keyboardController.attach();
    attachResizeObserver();

    const startIndex = resolveGoTo(options.startIndex, realSlides.length, options.mode);
    index = startIndex;
    previousIndex = startIndex;
    updateSlideStates();
    updateControls();
    scrollToIndex(startIndex, startIndex, false);
    emitter.emit('change', { index, previousIndex, source: 'init' });

    if (options.autoplay) autoplay.attach();
    // `play()` itself refuses to start while reduced motion is active, so
    // the configured `autoplay` option is never mutated to reflect
    // suppression — see `reduceMotionActive()` above.
    if (options.autoplay) publicApi.play();
  }

  const publicApi: Slider = {
    next(opts?: GoToOptions) {
      if (destroyed) return;
      const source = opts?.source ?? 'api';
      const from = index;
      const target = computeStep(index, 1, realSlides.length, options.slidesToScroll, options.mode);
      setIndex(target, source);
      scrollToIndex(from, index, opts?.animate ?? true);
    },
    prev(opts?: GoToOptions) {
      if (destroyed) return;
      const source = opts?.source ?? 'api';
      const from = index;
      const target = computeStep(
        index,
        -1,
        realSlides.length,
        options.slidesToScroll,
        options.mode,
      );
      setIndex(target, source);
      scrollToIndex(from, index, opts?.animate ?? true);
    },
    goTo(targetIndex: number, opts?: GoToOptions) {
      if (destroyed) return;
      const source = opts?.source ?? 'api';
      const from = index;
      const resolved = resolveGoTo(targetIndex, realSlides.length, options.mode);
      setIndex(resolved, source);
      scrollToIndex(from, index, opts?.animate ?? true);
    },
    refresh() {
      if (destroyed) return;
      realSlides = queryRealSlides();
      labelSlides();
      rebuildLoop();
      rebuildDots();
      index = Math.min(index, Math.max(0, realSlides.length - 1));
      updateSlideStates();
      updateControls();
      scrollToIndex(index, index, false);
      emitter.emit('refresh', undefined);
    },
    update(next: SliderInit) {
      if (destroyed) return;
      const prevAxis = options.axis;
      const prevMode = options.mode;
      const prevEffect = options.effect;
      const wasAutoplayEnabled = options.autoplay !== false;

      options = normalizeOptions(next, options);
      applyStateAttributes();

      const axisChanging = options.axis !== prevAxis;
      const modeChanging = options.mode !== prevMode;
      const effectChanging = options.effect !== prevEffect;
      const isAutoplayEnabled = options.autoplay !== false;

      // Drag/keyboard controllers pull axis/threshold live via callbacks
      // (see drag.ts/keyboard.ts), so no recreation is needed for those —
      // only the attach/detach state can change here.
      dragController.detach();
      if (options.draggable && options.effect === 'slide') dragController.attach();

      keyboardController.detach();
      if (options.keyboard) keyboardController.attach();

      if (isAutoplayEnabled) {
        autoplay.updateOptions(options.autoplay as AutoplayOptions);
        if (!wasAutoplayEnabled) {
          // Newly enabling autoplay via update() mirrors initial creation:
          // it establishes listeners/controls and auto-starts, exactly
          // like passing `autoplay` to createSlider() would have.
          autoplay.attach();
          controls?.setAutoplayAvailable(true);
          publicApi.play();
        }
        // Autoplay already enabled: never touch play/pause intent here —
        // an explicit prior pause() must stay paused across unrelated
        // option updates (e.g. changing `interval`).
      } else if (wasAutoplayEnabled) {
        autoplay.stop();
        autoplay.detach();
        controls?.setAutoplayAvailable(false);
      }

      if (modeChanging || axisChanging || effectChanging) rebuildLoop();
      if (effectChanging) updateSlideStates();
      rebuildDots();
      updateControls();
      scrollToIndex(index, index, false);
      // Covers `update({ reducedMotion: true })` newly activating
      // suppression while the OS preference is already `reduce` — must
      // stop autoplay immediately rather than waiting for the next tick.
      reconcileReducedMotion();
    },
    getState(): SliderState {
      return Object.freeze({
        index,
        previousIndex,
        slideCount: realSlides.length,
        canPrev: canGoPrev(index, realSlides.length, options.mode),
        canNext: canGoNext(index, realSlides.length, options.mode),
        isDragging,
        isAutoplaying: autoplay.isPlaying,
        isAnimating,
        axis: options.axis,
        direction: resolveDirection(root),
        mode: options.mode,
        destroyed,
      });
    },
    play() {
      if (destroyed || !options.autoplay) return;
      // Reduced motion always wins over an explicit play() call while it
      // remains active; only a later preference change (or
      // `update({ reducedMotion: false })`) followed by another explicit
      // play() can start rotation again.
      if (reduceMotionActive()) return;
      autoplay.play();
    },
    pause() {
      if (destroyed) return;
      autoplay.pause();
    },
    stop() {
      if (destroyed) return;
      autoplay.stop();
    },
    on<K extends SliderEventName>(event: K, listener: SliderListener<K>) {
      return emitter.on(event, listener);
    },
    off<K extends SliderEventName>(event: K, listener: SliderListener<K>) {
      emitter.off(event, listener);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (scrollSettleTimer) clearTimeout(scrollSettleTimer);
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      track.removeEventListener('scroll', onScroll);
      dragController.detach();
      keyboardController.detach();
      autoplay.detach();
      resizeObserver?.disconnect();
      unsubscribeReducedMotion();
      loopEngine.teardown();
      restoreAllFocusables();
      restoreDirection();

      // Transient runtime-only classes must never survive past this
      // instance, however it ends — mid-drag, immediately after a loop
      // boundary correction, or right after an immediate scroll each
      // scheduled their own class cleanup for a later frame that may never
      // get to run.
      clearTrackTemporaryClass(track, INSTANT_SCROLL_CLASS);
      clearTrackTemporaryClass(track, CORRECTING_CLASS);
      track.classList.remove('csp-slider__track--dragging');

      // Puts back every root/track/slide attribute and class this instance
      // owned — see DomOwnership. `managedSlides` includes slides
      // discovered by every past `refresh()`, even ones since removed from
      // the track, so a still-reachable detached node is still cleaned up.
      owned.restore(root);
      owned.restore(track);
      for (const slide of managedSlides) owned.restore(slide);
      managedSlides.clear();

      controls?.destroy();
      emitter.emit('destroy', undefined);
      emitter.clear();
    },
  };

  initialize();
  return publicApi;
}

// Re-exported for consumers/tests that want to hand-roll labels without pulling in Controls.
export type { ControlsLabels } from './controls.js';
export type { SliderEventMap } from './types.js';
