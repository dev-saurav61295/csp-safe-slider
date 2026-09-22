import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    __slider: import('../../src/index.js').Slider;
    __sliderReady: boolean;
  }
}

/**
 * Regression coverage for issue #5: the previous implementation read
 * `prefers-reduced-motion` exactly once at init, mutated the *configured*
 * `autoplay` option to `false` when it was active, and never listened for
 * the media query changing afterward. That lost the distinction between
 * "autoplay never configured" and "configured but currently suppressed",
 * and left a slider permanently unable to resume autoplay after the OS
 * preference later switched back to `no-preference`.
 */

async function readyWithReducedMotion(browser: import('@playwright/test').Browser, query = '') {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(`/strict.html${query}`);
  await page.waitForFunction(() => window.__sliderReady === true);
  return { context, page };
}

async function ready(page: import('@playwright/test').Page, query = '') {
  await page.goto(`/strict.html${query}`);
  await page.waitForFunction(() => window.__sliderReady === true);
}

test('initial reduced motion suppresses autoplay but keeps it configured', async ({ browser }) => {
  const { context, page } = await readyWithReducedMotion(browser, '?mode=loop&autoplay=true');
  expect(await page.evaluate(() => window.__slider.getState().isAutoplaying)).toBe(false);
  await context.close();
});

test('runtime switch to reduce stops an actively running autoplay', async ({ page }) => {
  await ready(page, '?mode=loop&autoplay=true');
  await expect
    .poll(async () => await page.evaluate(() => window.__slider.getState().isAutoplaying))
    .toBe(true);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect
    .poll(async () => page.evaluate(() => window.__slider.getState().isAutoplaying))
    .toBe(false);

  const before = await page.evaluate(() => window.__slider.getState().index);
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => window.__slider.getState().index);
  expect(after).toBe(before);
});

test('play() cannot restart autoplay while reduced motion remains active', async ({ page }) => {
  await ready(page, '?mode=loop&autoplay=true');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect
    .poll(async () => page.evaluate(() => window.__slider.getState().isAutoplaying))
    .toBe(false);

  await page.evaluate(() => window.__slider.play());
  expect(await page.evaluate(() => window.__slider.getState().isAutoplaying)).toBe(false);
});

test('switching the preference back to no-preference does not silently resume autoplay', async ({
  page,
}) => {
  await ready(page, '?mode=loop&autoplay=true');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect
    .poll(async () => page.evaluate(() => window.__slider.getState().isAutoplaying))
    .toBe(false);

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__slider.getState().isAutoplaying)).toBe(false);
});

test('an explicit play() after switching back to no-preference works', async ({ page }) => {
  await ready(page, '?mode=loop&autoplay=true');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect
    .poll(async () => page.evaluate(() => window.__slider.getState().isAutoplaying))
    .toBe(false);

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => window.__slider.play());
  expect(await page.evaluate(() => window.__slider.getState().isAutoplaying)).toBe(true);
});

test('programmatic navigation stays immediate while reduced motion is active', async ({
  browser,
}) => {
  const { context, page } = await readyWithReducedMotion(browser, '?mode=finite');
  const result = await page.evaluate(() => {
    const track = document.querySelector('[data-slider-track]') as HTMLElement;
    const target = document.querySelectorAll(
      '[data-slider-slide]:not([data-slider-clone])',
    )[3] as HTMLElement;
    window.__slider.goTo(3, { animate: true }); // even an explicit animate: true is suppressed
    return { after: track.scrollLeft, target: target.offsetLeft };
  });
  expect(Math.abs(result.after - result.target)).toBeLessThan(2);
  await context.close();
});

test('update({ reducedMotion: false }) takes effect immediately: media preference is then ignored', async ({
  page,
}) => {
  await ready(page, '?mode=loop&autoplay=true');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect
    .poll(async () => page.evaluate(() => window.__slider.getState().isAutoplaying))
    .toBe(false);

  await page.evaluate(() => window.__slider.update({ reducedMotion: false }));
  await page.evaluate(() => window.__slider.play());
  expect(await page.evaluate(() => window.__slider.getState().isAutoplaying)).toBe(true);

  // With reducedMotion:false, further preference flips must not affect it.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__slider.getState().isAutoplaying)).toBe(true);
});

test('update({ reducedMotion: true }) applied while already reduced stops autoplay immediately', async ({
  page,
}) => {
  await ready(page, '?mode=loop&autoplay=true&reducedMotion=false');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__slider.getState().isAutoplaying)).toBe(true);

  await page.evaluate(() => window.__slider.update({ reducedMotion: true }));
  expect(await page.evaluate(() => window.__slider.getState().isAutoplaying)).toBe(false);
});

test('no media-query callback affects the instance after destruction', async ({ page }) => {
  await ready(page, '?mode=loop&autoplay=true');
  await page.evaluate(() => window.__slider.destroy());

  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(200);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.waitForTimeout(200);

  expect(errors).toEqual([]);
  expect(await page.evaluate(() => window.__slider.getState().isAutoplaying)).toBe(false);
});
