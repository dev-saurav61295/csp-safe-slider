import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    __slider: import('../../src/index.js').Slider;
    __sliderReady: boolean;
  }
}

async function ready(page: import('@playwright/test').Page, query = '') {
  await page.goto(`/strict.html${query}`);
  await page.waitForFunction(() => window.__sliderReady === true);
}

async function state(page: import('@playwright/test').Page) {
  return page.evaluate(() => window.__slider.getState());
}

async function expectSettledIndex(page: import('@playwright/test').Page, expected: number) {
  await expect.poll(async () => (await state(page)).index, { timeout: 3000 }).toBe(expected);
}

/**
 * Regression coverage for the loop engine. These specifically target the
 * defects found in a static review of the published 1.0.1 artifact:
 *   - the engine never actually received the real slide list, so no clones
 *     were ever built and boundary correction was a silent no-op;
 *   - the wrap-direction clone selection had dead/contradictory conditions
 *     and read `index` after it had already been mutated to the target;
 *   - a resulting fix surfaced two more latent bugs only exercised once
 *     clones actually build: head-clone insertion order was reversed, and
 *     the "instant" boundary-correction jump silently inherited
 *     `scroll-behavior: smooth` from the track, animating instead.
 * Tests here assert on clone DOM structure and frame-level scroll samples,
 * not just the final logical index — a logical-index-only assertion is
 * exactly what let all of the above ship undetected.
 */

test.describe('loop clone structure', () => {
  test('builds exactly two clones per real slide, in slide order, neutralized', async ({
    page,
  }) => {
    await ready(page, '?mode=loop');
    const info = await page.evaluate(() => {
      const clones = Array.from(document.querySelectorAll<HTMLElement>('[data-slider-clone]'));
      const reals = Array.from(
        document.querySelectorAll<HTMLElement>('[data-slider-slide]:not([data-slider-clone])'),
      );
      return {
        realCount: reals.length,
        cloneCount: clones.length,
        allInert: clones.every((c) => c.inert === true),
        allAriaHidden: clones.every((c) => c.getAttribute('aria-hidden') === 'true'),
        anyCloneHasId: clones.some((c) => c.hasAttribute('id') || c.querySelector('[id]')),
        // offsetLeft-ordered clone text should read slide1..slideN twice
        // (tail block then head block), never reversed.
        orderedText: clones
          .slice()
          .sort((a, b) => a.offsetLeft - b.offsetLeft)
          .map((c) => c.textContent?.trim().split('\n')[0]?.trim()),
      };
    });

    expect(info.cloneCount).toBe(info.realCount * 2);
    expect(info.allInert).toBe(true);
    expect(info.allAriaHidden).toBe(true);
    expect(info.anyCloneHasId).toBe(false);
    expect(info.orderedText).toEqual([
      'Slide 1',
      'Slide 2',
      'Slide 3',
      'Slide 4',
      'Slide 5',
      'Slide 1',
      'Slide 2',
      'Slide 3',
      'Slide 4',
      'Slide 5',
    ]);
  });

  test('non-loop modes never build clones', async ({ page }) => {
    await ready(page, '?mode=finite');
    const count = await page.locator('[data-slider-clone]').count();
    expect(count).toBe(0);
  });

  test('fade effect + loop mode builds no clones (no scroll axis to smooth over)', async ({
    page,
  }) => {
    await ready(page, '?mode=loop&effect=fade');
    const count = await page.locator('[data-slider-clone]').count();
    expect(count).toBe(0);
  });

  test('zero slides is safe: no clones, no throw', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await ready(page, '?mode=loop&slides=0');
    expect((await state(page)).slideCount).toBe(0);
    expect(await page.locator('[data-slider-clone]').count()).toBe(0);
    expect(errors).toEqual([]);
  });

  test('one slide is safe: no clones, no throw', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await ready(page, '?mode=loop&slides=1');
    expect((await state(page)).slideCount).toBe(1);
    expect(await page.locator('[data-slider-clone]').count()).toBe(0);
    expect(errors).toEqual([]);
  });

  test('refresh() rebuilds clones to match the new slide count without accumulating', async ({
    page,
  }) => {
    await ready(page, '?mode=loop&slides=4');
    expect(await page.locator('[data-slider-clone]').count()).toBe(8);

    await page.evaluate(() => {
      const track = document.querySelector('[data-slider-track]')!;
      const slide = document.createElement('div');
      slide.className = 'csp-slider__slide';
      slide.setAttribute('data-slider-slide', '');
      slide.textContent = 'Added slide';
      track.append(slide);
      window.__slider.refresh();
    });
    expect((await state(page)).slideCount).toBe(5);
    expect(await page.locator('[data-slider-clone]').count()).toBe(10);

    // Calling refresh() again with no structural change must not accumulate.
    await page.evaluate(() => window.__slider.refresh());
    expect(await page.locator('[data-slider-clone]').count()).toBe(10);
  });

  test('resize rebuilds clones without accumulating', async ({ page }) => {
    await ready(page, '?mode=loop');
    expect(await page.locator('[data-slider-clone]').count()).toBe(10);

    await page.setViewportSize({ width: 500, height: 700 });
    await page.waitForTimeout(200);
    await page.setViewportSize({ width: 1100, height: 700 });
    await page.waitForTimeout(200);

    expect(await page.locator('[data-slider-clone]').count()).toBe(10);
  });
});

test.describe('seamless wrap: target selection and boundary correction', () => {
  /** Samples scrollLeft every animation frame for `ms` while `action` runs. */
  async function sampleDuringAction(
    page: import('@playwright/test').Page,
    action: 'next' | 'prev',
    ms: number,
  ): Promise<number[]> {
    return page.evaluate(
      async ({ action, ms }) => {
        const track = document.querySelector('[data-slider-track]') as HTMLElement;
        const samples: number[] = [];
        let running = true;
        const collect = () => {
          samples.push(track.scrollLeft);
          if (running) requestAnimationFrame(collect);
        };
        requestAnimationFrame(collect);
        window.__slider[action]();
        await new Promise((resolve) => setTimeout(resolve, ms));
        running = false;
        return samples;
      },
      { action, ms },
    );
  }

  // Generous fixed sampling window: this only collects cheap per-frame
  // scrollLeft snapshots (no assertion is time-boxed against it), so a
  // slower/loaded CI runner just yields more trailing "settled" samples at
  // the end rather than making the test flaky.
  const SAMPLE_WINDOW_MS = 3500;
  // Tolerance for a browser's own smooth-scroll easing / scroll-snap
  // sub-pixel wobble frame-to-frame — small compared to the ~thousands of
  // pixels a "wrap routed through the wrong target" defect would produce.
  const JITTER_TOLERANCE_PX = 800;

  test('next() at the last slide scrolls forward only, then jumps back instantly (no visible reverse animation)', async ({
    page,
  }) => {
    await ready(page, '?mode=loop');
    await page.evaluate(() => window.__slider.goTo(4, { animate: false }));
    await page.waitForTimeout(200);

    const samples = await sampleDuringAction(page, 'next', SAMPLE_WINDOW_MS);
    expect(samples.length).toBeGreaterThan(5);

    const peakIndex = samples.indexOf(Math.max(...samples));
    // Forward leg: non-decreasing (within a small jitter tolerance for a
    // browser's own easing/snap sub-pixel wobble) up to the peak (the
    // clone position) — a wrap that routed through the wrong target (or
    // none) would instead jump the *entire* track width backward first,
    // many times larger than any such jitter.
    for (let i = 1; i <= peakIndex; i++) {
      expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1] - JITTER_TOLERANCE_PX);
    }

    const settled = samples[samples.length - 1];
    // The instant correction must land back near real slide 0, not stay
    // parked on the clone.
    expect(settled).toBeLessThan(samples[peakIndex] - 100);

    // The drop from the clone position to the settled real position must
    // happen within at most a couple of frames — a gradual multi-frame
    // ramp down means the "instant" jump silently animated instead
    // (inherited `scroll-behavior: smooth` from the track).
    const settledBand = 5;
    let framesInTransition = 0;
    for (let i = peakIndex; i < samples.length; i++) {
      const s = samples[i];
      const isAtPeak = Math.abs(s - samples[peakIndex]) <= settledBand;
      const isAtSettled = Math.abs(s - settled) <= settledBand;
      if (!isAtPeak && !isAtSettled) framesInTransition++;
    }
    expect(framesInTransition).toBeLessThanOrEqual(2);

    expect((await state(page)).index).toBe(0);
  });

  test('prev() at the first slide scrolls backward only, then jumps forward instantly', async ({
    page,
  }) => {
    await ready(page, '?mode=loop');
    await page.evaluate(() => window.__slider.goTo(0, { animate: false }));
    await page.waitForTimeout(200);

    const samples = await sampleDuringAction(page, 'prev', SAMPLE_WINDOW_MS);
    const troughIndex = samples.indexOf(Math.min(...samples));
    for (let i = 1; i <= troughIndex; i++) {
      expect(samples[i]).toBeLessThanOrEqual(samples[i - 1] + JITTER_TOLERANCE_PX);
    }
    const settled = samples[samples.length - 1];
    expect(settled).toBeGreaterThan(samples[troughIndex] + 100);
    expect((await state(page)).index).toBe(4);
  });

  test('repeated forward wraps settle correctly every time (no drift)', async ({ page }) => {
    await ready(page, '?mode=loop&slides=3');
    await page.evaluate(() => window.__slider.goTo(2, { animate: false }));
    await page.waitForTimeout(200);

    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.__slider.next());
      await expectSettledIndex(page, 0);
      await page.evaluate(() => window.__slider.goTo(2, { animate: false }));
      await page.waitForTimeout(200);
    }
  });

  test('a goTo() jump across the boundary lands on the correct real slide (documented hard-jump limitation)', async ({
    page,
  }) => {
    await ready(page, '?mode=loop');
    await page.evaluate(() => window.__slider.goTo(1, { animate: false }));
    await page.waitForTimeout(200);
    await page.evaluate(() => window.__slider.goTo(4, { animate: true }));
    await expectSettledIndex(page, 4);
    // Lands on the real slide, not stuck on a clone.
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const track = document.querySelector('[data-slider-track]')!;
          const real = document.querySelectorAll(
            '[data-slider-slide]:not([data-slider-clone])',
          )[4] as HTMLElement;
          return Math.abs(track.scrollLeft - real.offsetLeft) < 5;
        }),
      )
      .toBe(true);
  });
});

test.describe('loop across axis/direction/variable width', () => {
  test('vertical loop wraps forward and backward', async ({ page }) => {
    await ready(page, '?mode=loop&axis=vertical');
    expect(await page.locator('[data-slider-clone]').count()).toBe(10);

    await page.evaluate(() => window.__slider.goTo(4, { animate: false }));
    await page.waitForTimeout(200);
    await page.evaluate(() => window.__slider.next());
    await expectSettledIndex(page, 0);

    await page.evaluate(() => window.__slider.prev());
    await expectSettledIndex(page, 4);
  });

  test('RTL loop wraps forward and backward', async ({ page }) => {
    await ready(page, '?mode=loop&direction=rtl');
    expect((await state(page)).direction).toBe('rtl');

    await page.evaluate(() => window.__slider.goTo(4, { animate: false }));
    await page.waitForTimeout(200);
    await page.evaluate(() => window.__slider.next());
    await expectSettledIndex(page, 0);

    await page.evaluate(() => window.__slider.prev());
    await expectSettledIndex(page, 4);
  });

  test('variable-width slides wrap to the correct settled index', async ({ page }) => {
    await ready(page, '?mode=loop&varwidth=true');
    await page.evaluate(() => window.__slider.goTo(4, { animate: false }));
    await page.waitForTimeout(200);

    await page.evaluate(() => window.__slider.next());
    await expectSettledIndex(page, 0);
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const track = document.querySelector('[data-slider-track]')!;
          const real0 = document.querySelectorAll(
            '[data-slider-slide]:not([data-slider-clone])',
          )[0] as HTMLElement;
          return Math.abs(track.scrollLeft - real0.offsetLeft) < 5;
        }),
      )
      .toBe(true);

    await page.evaluate(() => window.__slider.prev());
    await expectSettledIndex(page, 4);
  });
});
