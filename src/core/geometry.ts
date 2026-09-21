import type { Axis } from './types.js';

/**
 * All geometry here is *read* from layout (offsetLeft/offsetTop,
 * getBoundingClientRect) — never written. Actual slide sizing is owned by
 * consumer CSS (custom properties), which is what makes variable-width and
 * responsive layouts work without any JS-computed inline style.
 */

export function slideStart(el: HTMLElement, axis: Axis): number {
  return axis === 'horizontal' ? el.offsetLeft : el.offsetTop;
}

export function slideSize(el: HTMLElement, axis: Axis): number {
  const rect = el.getBoundingClientRect();
  return axis === 'horizontal' ? rect.width : rect.height;
}

export function viewportSize(track: HTMLElement, axis: Axis): number {
  return axis === 'horizontal' ? track.clientWidth : track.clientHeight;
}

export function contentSize(track: HTMLElement, axis: Axis): number {
  return axis === 'horizontal' ? track.scrollWidth : track.scrollHeight;
}

export function currentScrollPos(track: HTMLElement, axis: Axis): number {
  return axis === 'horizontal' ? track.scrollLeft : track.scrollTop;
}

/**
 * Target scroll position to align `el`'s start edge to the viewport per
 * `align`, in the track's native scroll coordinate space (RTL-aware for
 * horizontal via the browser's standardized negative-offset convention).
 */
export function targetScrollFor(
  track: HTMLElement,
  el: HTMLElement,
  axis: Axis,
  align: 'start' | 'center' | 'end',
  rtl: boolean,
): number {
  const start = slideStart(el, axis);
  const size = slideSize(el, axis);
  const viewport = viewportSize(track, axis);

  let pos = start;
  if (align === 'center') pos = start - (viewport - size) / 2;
  else if (align === 'end') pos = start - (viewport - size);

  if (axis === 'horizontal' && rtl) {
    // Standardized RTL scrollLeft convention: 0 is the rightmost (start)
    // edge and values decrease (negative) moving toward the end.
    const maxScroll = track.scrollWidth - viewport;
    pos = pos - maxScroll;
  }

  return pos;
}

/** Which slide's start edge is closest to the current scroll position. */
export function nearestSlideIndex(
  track: HTMLElement,
  slides: HTMLElement[],
  axis: Axis,
  rtl: boolean,
): number {
  if (slides.length === 0) return 0;
  const viewport = viewportSize(track, axis);
  const maxScroll = Math.max(0, contentSize(track, axis) - viewport);
  let current = currentScrollPos(track, axis);
  if (axis === 'horizontal' && rtl) current = current + maxScroll;

  let closest = 0;
  let closestDelta = Infinity;
  slides.forEach((slide, i) => {
    const delta = Math.abs(slideStart(slide, axis) - current);
    if (delta < closestDelta) {
      closestDelta = delta;
      closest = i;
    }
  });
  return closest;
}
