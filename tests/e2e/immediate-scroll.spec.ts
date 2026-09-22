import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    __slider: import('../../src/index.js').Slider;
    __sliderReady: boolean;
    __forbiddenMutations: string[];
  }
}

/**
 * Regression coverage for issue #3: the structural CSS declares
 * `.csp-slider__track { scroll-behavior: smooth }`, and `behavior: 'auto'`
 * passed to `scrollTo()` is not on its own a guarantee of an instant jump —
 * the CSSOM View spec permits a UA to still defer to the computed
 * `scroll-behavior`. `track.scrollLeft`/`scrollTop` update *synchronously*
 * for a truly immediate scroll (no `scroll-behavior: smooth` in effect),
 * but only after one or more animation frames for a smooth one — so
 * reading the position in the same synchronous callback as the action is a
 * direct way to prove "immediate" rather than merely waiting for the final
 * index, which the fix request specifically calls insufficient.
 */

async function ready(page: import('@playwright/test').Page, query = '') {
  await page.goto(`/strict.html${query}`);
  await page.waitForFunction(() => window.__sliderReady === true);
}

test.describe('goTo(..., { animate: false }) is synchronously immediate', () => {
  test('reaches the requested position in the same task, not over subsequent frames', async ({
    page,
  }) => {
    await ready(page, '?mode=finite');
    const result = await page.evaluate(() => {
      const track = document.querySelector('[data-slider-track]') as HTMLElement;
      const target = document.querySelectorAll(
        '[data-slider-slide]:not([data-slider-clone])',
      )[3] as HTMLElement;
      const before = track.scrollLeft;
      window.__slider.goTo(3, { animate: false });
      const after = track.scrollLeft; // read synchronously, zero elapsed frames
      return { before, after, target: target.offsetLeft };
    });

    expect(result.after).not.toBe(result.before);
    expect(Math.abs(result.after - result.target)).toBeLessThan(2);
  });

  test('animate: true does not jump synchronously the way animate: false does', async ({
    page,
  }) => {
    await ready(page, '?mode=finite');
    await page.evaluate(() => window.__slider.goTo(0, { animate: false }));

    // Direct contrast with the immediate case above: reading `scrollLeft`
    // synchronously, in the same task, right after the call. An immediate
    // (`behavior: 'auto'`, snap suspended) jump reaches the target in that
    // same task; a smooth one has not moved at all yet, since the browser
    // only progresses `scroll-behavior: smooth` on later frames. This
    // stays deterministic regardless of how sparsely those later frames
    // get delivered under load — unlike sampling for an intermediate
    // in-flight position, which is inherently timing-sensitive.
    const result = await page.evaluate(() => {
      const track = document.querySelector('[data-slider-track]') as HTMLElement;
      const before = track.scrollLeft;
      window.__slider.goTo(3, { animate: true });
      return { before, after: track.scrollLeft };
    });
    expect(result.after).toBe(result.before);

    // It must still actually arrive eventually — confirming this isn't
    // just a stuck/no-op call.
    await expect
      .poll(async () => page.evaluate(() => window.__slider.getState().index), { timeout: 3000 })
      .toBe(3);
  });
});

test('initialization at a nonzero startIndex never visibly animates from slide zero', async ({
  page,
}) => {
  await page.goto('/strict.html?mode=finite&startIndex=3');
  await page.waitForFunction(() => window.__sliderReady === true);

  // By the time __sliderReady flips, `initialize()`'s own scrollToIndex()
  // call has already run synchronously — if it had used an animated
  // scroll, the position would not yet have reached the target this early.
  const { scrollLeft, target } = await page.evaluate(() => {
    const track = document.querySelector('[data-slider-track]') as HTMLElement;
    const slide3 = document.querySelectorAll(
      '[data-slider-slide]:not([data-slider-clone])',
    )[3] as HTMLElement;
    return { scrollLeft: track.scrollLeft, target: slide3.offsetLeft };
  });
  expect(Math.abs(scrollLeft - target)).toBeLessThan(2);
});

test('refresh() realignment is synchronously immediate', async ({ page }) => {
  await ready(page, '?mode=finite&slides=3');
  await page.evaluate(() => window.__slider.goTo(2, { animate: false }));

  const isAligned = await page.evaluate(() => {
    window.__slider.refresh();
    const track = document.querySelector('[data-slider-track]') as HTMLElement;
    const idx = window.__slider.getState().index;
    const slide = document.querySelectorAll('[data-slider-slide]:not([data-slider-clone])')[
      idx
    ] as HTMLElement;
    return Math.abs(track.scrollLeft - slide.offsetLeft) < 2;
  });
  expect(isAligned).toBe(true);
});

test('update() realignment is synchronously immediate', async ({ page }) => {
  await ready(page, '?mode=finite');
  await page.evaluate(() => window.__slider.goTo(2, { animate: false }));

  const isAligned = await page.evaluate(() => {
    const track = document.querySelector('[data-slider-track]') as HTMLElement;
    window.__slider.update({ align: 'center' });
    const idx = window.__slider.getState().index;
    const slide = document.querySelectorAll('[data-slider-slide]:not([data-slider-clone])')[
      idx
    ] as HTMLElement;
    const viewport = track.clientWidth;
    const expected = slide.offsetLeft - (viewport - slide.getBoundingClientRect().width) / 2;
    return Math.abs(track.scrollLeft - expected) < 2;
  });
  expect(isAligned).toBe(true);
});

test('resize realignment lands on target without a gradual multi-frame ramp', async ({ page }) => {
  await ready(page, '?mode=finite&narrow=true');
  await page.evaluate(() => window.__slider.goTo(2, { animate: false }));
  await page.waitForTimeout(150);

  const samples = await page.evaluate(async () => {
    const track = document.querySelector('[data-slider-track]') as HTMLElement;
    const collected: number[] = [];
    let running = true;
    const collect = () => {
      collected.push(track.scrollLeft);
      if (running) requestAnimationFrame(collect);
    };
    requestAnimationFrame(collect);
    window.dispatchEvent(new Event('resize'));
    await new Promise((r) => setTimeout(r, 500));
    running = false;
    return collected;
  });

  const settled = samples[samples.length - 1];
  // Once the resize-triggered realignment lands, it must not pass through
  // more than a couple of intermediate frames on the way — a gradual
  // multi-frame ramp toward `settled` would mean the "instant" correction
  // silently animated instead.
  let framesAwayFromSettled = 0;
  for (const s of samples) {
    if (Math.abs(s - settled) > 5) framesAwayFromSettled++;
  }
  expect(framesAwayFromSettled).toBeLessThanOrEqual(3);
});

test('immediate scrolling works vertically', async ({ page }) => {
  await ready(page, '?mode=finite&axis=vertical');
  const result = await page.evaluate(() => {
    const track = document.querySelector('[data-slider-track]') as HTMLElement;
    window.__slider.goTo(2, { animate: false });
    const after = track.scrollTop;
    const target = document.querySelectorAll(
      '[data-slider-slide]:not([data-slider-clone])',
    )[2] as HTMLElement;
    return { after, target: target.offsetTop };
  });
  expect(Math.abs(result.after - result.target)).toBeLessThan(2);
});

test('immediate scrolling works in RTL', async ({ page }) => {
  await ready(page, '?mode=finite&direction=rtl');
  const result = await page.evaluate(() => {
    const track = document.querySelector('[data-slider-track]') as HTMLElement;
    window.__slider.goTo(2, { animate: false });
    const after = track.scrollLeft;
    const target = document.querySelectorAll(
      '[data-slider-slide]:not([data-slider-clone])',
    )[2] as HTMLElement;
    return { after, target: target.offsetLeft };
  });
  expect(Math.abs(result.after - result.target)).toBeLessThan(2);
});

test('the immediate-scroll mechanism produces zero CSP violations', async ({ page }) => {
  await ready(page, '?mode=finite');
  await page.evaluate(() => {
    window.__slider.goTo(3, { animate: false });
    window.__slider.refresh();
    window.__slider.update({ align: 'center' });
  });
  await page.waitForTimeout(200);

  const audit = await page.evaluate(() => {
    const offenders: string[] = [];
    document.querySelectorAll('*').forEach((el) => {
      if (el.hasAttribute('style')) offenders.push('style attribute present');
    });
    if (document.querySelector('style')) offenders.push('<style> element present');
    return offenders;
  });
  expect(audit).toEqual([]);
  expect(await page.evaluate(() => window.__forbiddenMutations)).toEqual([]);
});
