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
 * `align`, in the track's native scroll coordinate space.
 *
 * No separate RTL branch: in a `direction: rtl` flex container, a child's
 * `offsetLeft` is *already* measured in the browser's own standardized
 * negative-convention `scrollLeft` coordinate space (0 == the start/right
 * edge, decreasing toward the end/left edge, exactly mirroring how
 * `scrollLeft` itself behaves there) — flex lays RTL children out starting
 * from the container's right edge and flowing left, so the first child's
 * offsetLeft already lands at ~0 and later children get more negative,
 * with no extra `scrollWidth`-relative shift needed. An earlier version of
 * this function subtracted `scrollWidth - viewport` "to convert to RTL",
 * which was simply wrong: it happened to go undetected because mandatory
 * `scroll-snap` silently corrected the resulting near-miss target back to
 * the nearest real slide for ordinary single-step navigation, but it broke
 * outright once loop mode needed to target a specific *clone* precisely.
 */
export function targetScrollFor(
  track: HTMLElement,
  el: HTMLElement,
  axis: Axis,
  align: 'start' | 'center' | 'end',
): number {
  const start = slideStart(el, axis);
  const size = slideSize(el, axis);
  const viewport = viewportSize(track, axis);

  let pos = start;
  if (align === 'center') pos = start - (viewport - size) / 2;
  else if (align === 'end') pos = start - (viewport - size);

  return pos;
}

/** Which slide's start edge is closest to the current scroll position. */
export function nearestSlideIndex(track: HTMLElement, slides: HTMLElement[], axis: Axis): number {
  if (slides.length === 0) return 0;
  const current = currentScrollPos(track, axis);

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
