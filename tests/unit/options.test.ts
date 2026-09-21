import { describe, expect, it } from 'vitest';
import { DEFAULT_OPTIONS, normalizeOptions } from '../../src/core/options.js';

describe('normalizeOptions', () => {
  it('applies defaults when no init is given', () => {
    const options = normalizeOptions({});
    expect(options).toEqual(DEFAULT_OPTIONS);
  });

  it('merges partial overrides over the base', () => {
    const options = normalizeOptions({ axis: 'vertical', slidesToScroll: 2 });
    expect(options.axis).toBe('vertical');
    expect(options.slidesToScroll).toBe(2);
    expect(options.mode).toBe(DEFAULT_OPTIONS.mode);
  });

  it('autoplay: true expands to full default autoplay config', () => {
    const options = normalizeOptions({ autoplay: true });
    expect(options.autoplay).toMatchObject({ interval: 5000, pauseOnHover: true });
  });

  it('autoplay: partial object merges over the default autoplay config', () => {
    const options = normalizeOptions({ autoplay: { interval: 2000 } });
    expect(options.autoplay).toMatchObject({ interval: 2000, pauseOnHover: true });
  });

  it('autoplay: false disables it explicitly', () => {
    const options = normalizeOptions({ autoplay: false }, normalizeOptions({ autoplay: true }));
    expect(options.autoplay).toBe(false);
  });

  it('rejects invalid slidesToScroll', () => {
    expect(() => normalizeOptions({ slidesToScroll: 0 })).toThrow(RangeError);
    expect(() => normalizeOptions({ slidesToScroll: -1 })).toThrow(RangeError);
  });

  it('rejects an autoplay interval below 100ms', () => {
    expect(() => normalizeOptions({ autoplay: { interval: 50 } })).toThrow(RangeError);
  });

  it('rejects invalid enum values', () => {
    // @ts-expect-error intentional invalid input for the runtime check
    expect(() => normalizeOptions({ axis: 'diagonal' })).toThrow(RangeError);
    // @ts-expect-error intentional invalid input for the runtime check
    expect(() => normalizeOptions({ mode: 'bounce' })).toThrow(RangeError);
  });

  it('never mutates the base options object', () => {
    const base = { ...DEFAULT_OPTIONS };
    normalizeOptions({ axis: 'vertical' }, base);
    expect(base).toEqual(DEFAULT_OPTIONS);
  });
});
