import type { AutoplayOptions, SliderInit, SliderOptions } from './types.js';

export const DEFAULT_AUTOPLAY: AutoplayOptions = {
  interval: 5000,
  pauseOnHover: true,
  pauseOnFocus: true,
  pauseOnHiddenDocument: true,
  pauseOnOffscreen: true,
};

export const DEFAULT_OPTIONS: SliderOptions = {
  startIndex: 0,
  axis: 'horizontal',
  direction: 'auto',
  mode: 'finite',
  slidesToScroll: 1,
  align: 'start',
  draggable: true,
  keyboard: true,
  autoplay: false,
  effect: 'slide',
  duration: 400,
  freeScroll: false,
  dragThreshold: 6,
  reducedMotion: true,
};

/** Merges a partial init object over the current/default options. Never mutates inputs. */
export function normalizeOptions(
  init: SliderInit,
  base: SliderOptions = DEFAULT_OPTIONS,
): SliderOptions {
  const { autoplay, ...rest } = init;

  const merged: SliderOptions = { ...base, ...rest };

  if (autoplay === false) {
    merged.autoplay = false;
  } else if (autoplay === true) {
    merged.autoplay = { ...DEFAULT_AUTOPLAY };
  } else if (autoplay && typeof autoplay === 'object') {
    const currentAutoplay = base.autoplay || DEFAULT_AUTOPLAY;
    merged.autoplay = { ...currentAutoplay, ...autoplay };
  }
  // else: leave as `base.autoplay` (already copied by spread above)

  validateOptions(merged);
  return merged;
}

export function validateOptions(options: SliderOptions): void {
  if (!Number.isFinite(options.slidesToScroll) || options.slidesToScroll < 1) {
    throw new RangeError('slidesToScroll must be a finite number >= 1');
  }
  if (!Number.isFinite(options.duration) || options.duration < 0) {
    throw new RangeError('duration must be a finite number >= 0');
  }
  if (!Number.isFinite(options.dragThreshold) || options.dragThreshold < 0) {
    throw new RangeError('dragThreshold must be a finite number >= 0');
  }
  if (options.autoplay && options.autoplay.interval < 100) {
    throw new RangeError('autoplay.interval must be >= 100ms');
  }
  if (!['horizontal', 'vertical'].includes(options.axis)) {
    throw new RangeError(`invalid axis: ${options.axis}`);
  }
  if (!['finite', 'rewind', 'loop'].includes(options.mode)) {
    throw new RangeError(`invalid mode: ${options.mode}`);
  }
  if (!['slide', 'fade'].includes(options.effect)) {
    throw new RangeError(`invalid effect: ${options.effect}`);
  }
}
