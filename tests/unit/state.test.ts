import { describe, expect, it } from 'vitest';
import {
  canGoNext,
  canGoPrev,
  clampIndex,
  computePageCount,
  computeStep,
  indexToPage,
  pageToIndex,
  resolveGoTo,
  wrapIndex,
} from '../../src/core/state.js';

describe('clampIndex', () => {
  it('clamps within [0, slideCount-1]', () => {
    expect(clampIndex(-3, 5)).toBe(0);
    expect(clampIndex(10, 5)).toBe(4);
    expect(clampIndex(2, 5)).toBe(2);
  });
  it('returns 0 for an empty slide set', () => {
    expect(clampIndex(3, 0)).toBe(0);
  });
});

describe('wrapIndex', () => {
  it('wraps positive overflow', () => {
    expect(wrapIndex(5, 5)).toBe(0);
    expect(wrapIndex(7, 5)).toBe(2);
  });
  it('wraps negative underflow', () => {
    expect(wrapIndex(-1, 5)).toBe(4);
    expect(wrapIndex(-6, 5)).toBe(4);
  });
});

describe('computeStep', () => {
  it('finite mode clamps at both ends', () => {
    expect(computeStep(4, 1, 5, 1, 'finite')).toBe(4);
    expect(computeStep(0, -1, 5, 1, 'finite')).toBe(0);
  });
  it('rewind mode jumps to the opposite end past a boundary', () => {
    expect(computeStep(4, 1, 5, 1, 'rewind')).toBe(0);
    expect(computeStep(0, -1, 5, 1, 'rewind')).toBe(4);
  });
  it('loop mode wraps modulo slideCount', () => {
    expect(computeStep(4, 1, 5, 1, 'loop')).toBe(0);
    expect(computeStep(0, -1, 5, 1, 'loop')).toBe(4);
  });
  it('honors slidesToScroll grouping', () => {
    expect(computeStep(0, 1, 10, 3, 'finite')).toBe(3);
    expect(computeStep(9, 1, 10, 3, 'finite')).toBe(9);
  });
  it('returns 0 for an empty slide set', () => {
    expect(computeStep(0, 1, 0, 1, 'loop')).toBe(0);
  });
});

describe('resolveGoTo', () => {
  it('clamps for finite/rewind', () => {
    expect(resolveGoTo(99, 5, 'finite')).toBe(4);
    expect(resolveGoTo(-99, 5, 'rewind')).toBe(0);
  });
  it('wraps for loop', () => {
    expect(resolveGoTo(7, 5, 'loop')).toBe(2);
    expect(resolveGoTo(-1, 5, 'loop')).toBe(4);
  });
  it('truncates fractional input', () => {
    expect(resolveGoTo(2.9, 5, 'finite')).toBe(2);
  });
  it('treats non-finite input as 0', () => {
    expect(resolveGoTo(NaN, 5, 'finite')).toBe(0);
  });
});

describe('canGoPrev / canGoNext', () => {
  it('finite mode disables at the edges', () => {
    expect(canGoPrev(0, 5, 'finite')).toBe(false);
    expect(canGoNext(4, 5, 'finite')).toBe(false);
    expect(canGoPrev(1, 5, 'finite')).toBe(true);
    expect(canGoNext(3, 5, 'finite')).toBe(true);
  });
  it('rewind and loop stay enabled at the edges', () => {
    expect(canGoPrev(0, 5, 'rewind')).toBe(true);
    expect(canGoNext(4, 5, 'rewind')).toBe(true);
    expect(canGoPrev(0, 5, 'loop')).toBe(true);
    expect(canGoNext(4, 5, 'loop')).toBe(true);
  });
  it('disables both directions for 0 or 1 slide', () => {
    expect(canGoPrev(0, 1, 'loop')).toBe(false);
    expect(canGoNext(0, 1, 'loop')).toBe(false);
    expect(canGoPrev(0, 0, 'loop')).toBe(false);
  });
});

describe('page helpers', () => {
  it('computes page count from slidesToScroll grouping', () => {
    expect(computePageCount(10, 3)).toBe(4);
    expect(computePageCount(9, 3)).toBe(3);
    expect(computePageCount(0, 3)).toBe(0);
  });
  it('round-trips index <-> page', () => {
    expect(indexToPage(7, 3)).toBe(2);
    expect(pageToIndex(2, 3)).toBe(6);
  });
});
