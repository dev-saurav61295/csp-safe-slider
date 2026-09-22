import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    __slider: import('../../src/index.js').Slider;
    __sliderReady: boolean;
  }
}

/**
 * Regression coverage for issue #7: `LoopEngine.jumpTo()` schedules nested
 * `requestAnimationFrame()` callbacks to remove the `--correcting` class,
 * and the previous `teardown()` removed the clones but never cancelled
 * those callbacks or cleared the class immediately — so a stale callback
 * from a destroyed or rebuilt instance could later run and interfere with
 * a newer loop correction or a reinitialized slider on the same track.
 */

async function ready(page: import('@playwright/test').Page, query = '') {
  await page.goto(`/strict.html${query}`);
  await page.waitForFunction(() => window.__sliderReady === true);
}

/** Triggers a boundary wrap without waiting for its correction to settle. */
async function triggerWrapWithoutSettling(page: import('@playwright/test').Page) {
  await page.evaluate(() => window.__slider.goTo(4, { animate: false }));
  await page.waitForTimeout(150);
  await page.evaluate(() => window.__slider.next());
  // Deliberately no wait: the correction's rAF chain is very likely still
  // pending here.
}

test('destroy() immediately after a boundary correction begins does not throw and leaves no correcting class', async ({
  page,
}) => {
  await ready(page, '?mode=loop');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await triggerWrapWithoutSettling(page);
  await page.evaluate(() => window.__slider.destroy());

  expect(errors).toEqual([]);
  const hasCorrectingClass = await page.evaluate(() =>
    document
      .querySelector('[data-slider-track]')!
      .classList.contains('csp-slider__track--correcting'),
  );
  expect(hasCorrectingClass).toBe(false);
});

test('changing axis during a pending correction does not throw or leave stale classes', async ({
  page,
}) => {
  await ready(page, '?mode=loop');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await triggerWrapWithoutSettling(page);
  await page.evaluate(() => window.__slider.update({ axis: 'vertical' }));
  await page.waitForTimeout(200);

  expect(errors).toEqual([]);
  const hasCorrectingClass = await page.evaluate(() =>
    document
      .querySelector('[data-slider-track]')!
      .classList.contains('csp-slider__track--correcting'),
  );
  expect(hasCorrectingClass).toBe(false);
});

test('refresh() during a pending correction does not throw or accumulate clones', async ({
  page,
}) => {
  await ready(page, '?mode=loop');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await triggerWrapWithoutSettling(page);
  await page.evaluate(() => window.__slider.refresh());
  await page.waitForTimeout(200);

  expect(errors).toEqual([]);
  expect(await page.locator('[data-slider-clone]').count()).toBe(10);
});

test('destroy and immediate reinitialize of the same root: no stale correcting class from the old instance', async ({
  page,
}) => {
  await ready(page, '?mode=loop');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await triggerWrapWithoutSettling(page);

  const result = await page.evaluate(async () => {
    window.__slider.destroy();
    const { createSlider } = await import('/dist/index.js');
    const root = document.getElementById('slider')!;
    window.__slider = createSlider(root, { mode: 'loop' });
    return window.__slider.getState();
  });
  expect(result.slideCount).toBe(5);
  expect(errors).toEqual([]);

  // Give any stale rAF callback from the destroyed instance every chance to
  // fire and (incorrectly) touch the track before asserting the new
  // instance's own state is undisturbed.
  await new Promise((r) => setTimeout(r, 200));
  const hasCorrectingClass = await page.evaluate(() =>
    document
      .querySelector('[data-slider-track]')!
      .classList.contains('csp-slider__track--correcting'),
  );
  expect(hasCorrectingClass).toBe(false);

  // The new instance's own seamless loop must still work correctly —
  // proving a stale callback didn't corrupt its state.
  await page.evaluate(() => window.__slider.goTo(4, { animate: false }));
  await page.waitForTimeout(150);
  await page.evaluate(() => window.__slider.next());
  await expect.poll(async () => page.evaluate(() => window.__slider.getState().index)).toBe(0);
});

test('repeated build/teardown cycles (mode toggling) remain safe', async ({ page }) => {
  await ready(page, '?mode=loop');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.__slider.update({ mode: 'finite' }));
    await page.evaluate(() => window.__slider.update({ mode: 'loop' }));
  }
  expect(errors).toEqual([]);
  expect(await page.locator('[data-slider-clone]').count()).toBe(10);
});
