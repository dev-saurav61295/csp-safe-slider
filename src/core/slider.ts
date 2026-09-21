import { AutoplayController } from './autoplay.js';
import { Controls, type ControlsLabels } from './controls.js';
import { DragController } from './drag.js';
import { FOCUSABLE_SELECTOR, prefersReducedMotion, resolveDirection } from './dom.js';
import { Emitter } from './events.js';
import { nearestSlideIndex, targetScrollFor } from './geometry.js';
import { KeyboardController } from './keyboard.js';
import { LoopEngine } from './loop.js';
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

  const reduceMotion = prefersReducedMotion();
  let options: SliderOptions = normalizeOptions(init, DEFAULT_OPTIONS);
  if (reduceMotion && options.reducedMotion) {
    options = { ...options, autoplay: false };
  }

  const emitter = new Emitter();
  const loopEngine = new LoopEngine(track, [], options.axis);
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

  const dragController = new DragController(track, {
    axis: options.axis,
    threshold: options.dragThreshold,
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
    options.axis,
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

  let resizeObserver: ResizeObserver | null = null;

  function setTrackLiveRegion(): void {
    track.setAttribute('aria-live', autoplay.isPlaying ? 'off' : 'polite');
  }

  function applyStateAttributes(): void {
    // Explicit tabindex so the track is reliably keyboard-focusable across
    // browsers — some implicitly treat scrollable overflow containers as
    // focusable and some don't, so we don't rely on that being consistent.
    if (!track.hasAttribute('tabindex')) track.tabIndex = 0;
    root.setAttribute('data-slider-axis', options.axis);
    root.setAttribute('data-slider-mode', options.mode);
    root.setAttribute('data-slider-effect', options.effect);
    track.setAttribute('data-slider-axis', options.axis);
    track.setAttribute('data-slider-effect', options.effect);
    track.classList.toggle('csp-slider__track--free', options.freeScroll);
  }

  function setupA11y(): void {
    applyStateAttributes();
    if (!root.hasAttribute('role')) root.setAttribute('role', 'region');
    if (!root.getAttribute('aria-roledescription')) {
      root.setAttribute('aria-roledescription', 'carousel');
    }
    if (!root.getAttribute('aria-label') && !root.getAttribute('aria-labelledby')) {
      root.setAttribute('aria-label', 'Carousel');
    }
    setTrackLiveRegion();
    labelSlides();
  }

  function labelSlides(): void {
    const count = realSlides.length;
    realSlides.forEach((slide, i) => {
      slide.setAttribute('role', 'group');
      slide.setAttribute('aria-roledescription', 'slide');
      if (!slide.getAttribute('aria-label') && !slide.getAttribute('aria-labelledby')) {
        slide.setAttribute('aria-label', `${i + 1} of ${count}`);
      }
    });
  }

  function queryRealSlides(): HTMLElement[] {
    return Array.from(track.querySelectorAll<HTMLElement>(SLIDE_SELECTOR)).filter(
      (el) => !el.hasAttribute('data-slider-clone') && el.parentElement === track,
    );
  }

  function rebuildLoop(): void {
    loopEngine.teardown();
    if (options.mode === 'loop' && options.effect === 'slide') {
      loopEngine.build();
    }
  }

  function updateSlideStates(): void {
    realSlides.forEach((slide, i) => {
      const active = i === index;
      slide.classList.toggle('csp-slider__slide--active', active);
      slide.setAttribute('data-state', active ? 'active' : 'inactive');
      if (options.effect === 'fade') {
        slide.setAttribute('aria-hidden', active ? 'false' : 'true');
        slide.querySelectorAll(FOCUSABLE_SELECTOR).forEach((el) => {
          if (!active) el.setAttribute('tabindex', '-1');
          else el.removeAttribute('tabindex');
        });
      } else {
        slide.removeAttribute('aria-hidden');
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

  function scrollToIndex(newIndex: number, animate: boolean): void {
    if (options.effect === 'fade') return;
    const rtl = resolveDirection(root) === 'rtl';
    const el = resolveScrollTarget(newIndex);
    if (!el) return;

    const shouldAnimate = animate && !(reduceMotion && options.reducedMotion);
    const pos = targetScrollFor(track, el, options.axis, options.align, rtl);

    isAnimating = shouldAnimate;
    track.scrollTo({
      [options.axis === 'horizontal' ? 'left' : 'top']: pos,
      behavior: shouldAnimate ? 'smooth' : 'auto',
    } as ScrollToOptions);
  }

  function resolveScrollTarget(newIndex: number): HTMLElement | undefined {
    if (options.mode === 'loop' && loopEngine.isActive) {
      const delta = newIndex - index;
      if (delta > 0 && newIndex < index) {
        return loopEngine.headSlides[index] ?? realSlides[newIndex];
      }
      if (delta < 0 && newIndex > index) {
        return loopEngine.tailSlides[index] ?? realSlides[newIndex];
      }
      // Non-adjacent goTo across the wrap: still valid, just a direct jump.
    }
    return realSlides[newIndex];
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
    const rtl = resolveDirection(root) === 'rtl';
    const nearest = nearestSlideIndex(track, realSlides, options.axis, rtl);
    isAnimating = false;
    if (nearest !== index) {
      setIndex(nearest, 'scroll');
    }
    emitter.emit('settle', { index, previousIndex, source: 'scroll' });
  }

  function attachResizeObserver(): void {
    if (typeof ResizeObserver === 'undefined') return;
    let raf = 0;
    resizeObserver = new ResizeObserver(() => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (options.mode === 'loop') loopEngine.build();
        scrollToIndex(index, false);
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
    scrollToIndex(startIndex, false);
    emitter.emit('change', { index, previousIndex, source: 'init' });

    if (options.autoplay) autoplay.attach();
    if (options.autoplay && !(reduceMotion && options.reducedMotion)) {
      publicApi.play();
    }
  }

  const publicApi: Slider = {
    next(opts?: GoToOptions) {
      if (destroyed) return;
      const source = opts?.source ?? 'api';
      const target = computeStep(index, 1, realSlides.length, options.slidesToScroll, options.mode);
      setIndex(target, source);
      scrollToIndex(index, opts?.animate ?? true);
    },
    prev(opts?: GoToOptions) {
      if (destroyed) return;
      const source = opts?.source ?? 'api';
      const target = computeStep(
        index,
        -1,
        realSlides.length,
        options.slidesToScroll,
        options.mode,
      );
      setIndex(target, source);
      scrollToIndex(index, opts?.animate ?? true);
    },
    goTo(targetIndex: number, opts?: GoToOptions) {
      if (destroyed) return;
      const source = opts?.source ?? 'api';
      const resolved = resolveGoTo(targetIndex, realSlides.length, options.mode);
      setIndex(resolved, source);
      scrollToIndex(index, opts?.animate ?? true);
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
      scrollToIndex(index, false);
      emitter.emit('refresh', undefined);
    },
    update(next: SliderInit) {
      if (destroyed) return;
      const modeChanging = next.mode !== undefined && next.mode !== options.mode;
      const axisChanging = next.axis !== undefined && next.axis !== options.axis;
      options = normalizeOptions(next, options);
      applyStateAttributes();

      dragController.detach();
      if (options.draggable && options.effect === 'slide') dragController.attach();

      keyboardController.detach();
      if (options.keyboard) keyboardController.attach();

      if (modeChanging || axisChanging) rebuildLoop();
      rebuildDots();
      updateControls();
      scrollToIndex(index, false);
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
      track.removeEventListener('scroll', onScroll);
      dragController.detach();
      keyboardController.detach();
      autoplay.detach();
      resizeObserver?.disconnect();
      loopEngine.teardown();
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
