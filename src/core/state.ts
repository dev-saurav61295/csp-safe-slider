import type { BoundaryMode } from './types.js';

/**
 * Pure index/geometry math shared by the DOM engine and unit tests.
 * Nothing here touches the DOM, so it can be exercised without jsdom.
 */

export function clampIndex(index: number, slideCount: number): number {
  if (slideCount <= 0) return 0;
  return Math.min(Math.max(index, 0), slideCount - 1);
}

export function wrapIndex(index: number, slideCount: number): number {
  if (slideCount <= 0) return 0;
  return ((index % slideCount) + slideCount) % slideCount;
}

/**
 * Resolves the next logical index after moving `delta` steps of
 * `slidesToScroll` slides each, honoring the boundary mode.
 */
export function computeStep(
  current: number,
  delta: number,
  slideCount: number,
  slidesToScroll: number,
  mode: BoundaryMode,
): number {
  if (slideCount <= 0) return 0;
  const step = Math.max(1, Math.trunc(slidesToScroll)) * delta;
  const raw = current + step;

  switch (mode) {
    case 'finite':
      return clampIndex(raw, slideCount);
    case 'rewind':
      if (raw < 0) return slideCount - 1;
      if (raw > slideCount - 1) return 0;
      return raw;
    case 'loop':
      return wrapIndex(raw, slideCount);
  }
}

/** Resolves an arbitrary goTo(index) request to a valid logical index. */
export function resolveGoTo(index: number, slideCount: number, mode: BoundaryMode): number {
  const truncated = Number.isFinite(index) ? Math.trunc(index) : 0;
  return mode === 'loop' ? wrapIndex(truncated, slideCount) : clampIndex(truncated, slideCount);
}

export function canGoPrev(index: number, slideCount: number, mode: BoundaryMode): boolean {
  if (slideCount <= 1) return false;
  if (mode === 'loop' || mode === 'rewind') return true;
  return index > 0;
}

export function canGoNext(index: number, slideCount: number, mode: BoundaryMode): boolean {
  if (slideCount <= 1) return false;
  if (mode === 'loop' || mode === 'rewind') return true;
  return index < slideCount - 1;
}

export function computePageCount(slideCount: number, slidesToScroll: number): number {
  if (slideCount <= 0) return 0;
  return Math.ceil(slideCount / Math.max(1, Math.trunc(slidesToScroll)));
}

export function indexToPage(index: number, slidesToScroll: number): number {
  return Math.floor(index / Math.max(1, Math.trunc(slidesToScroll)));
}

export function pageToIndex(page: number, slidesToScroll: number): number {
  return page * Math.max(1, Math.trunc(slidesToScroll));
}
