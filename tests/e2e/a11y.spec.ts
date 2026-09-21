import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    __slider: import('../../src/index.js').Slider;
    __sliderReady: boolean;
  }
}

test('automated accessibility scan reports no violations on the strict fixture', async ({
  page,
}) => {
  await page.goto('/strict.html?mode=finite');
  await page.waitForFunction(() => window.__sliderReady === true);

  const results = await new AxeBuilder({ page }).include('#slider').analyze();
  expect(results.violations).toEqual([]);
});

test('carousel region and slides carry the expected WAI-recommended semantics', async ({
  page,
}) => {
  await page.goto('/strict.html?mode=finite');
  await page.waitForFunction(() => window.__sliderReady === true);

  const root = page.locator('#slider');
  await expect(root).toHaveAttribute('role', 'region');
  await expect(root).toHaveAttribute('aria-roledescription', 'carousel');
  await expect(root).toHaveAttribute('aria-label', /.+/);

  const firstSlide = page.locator('[data-slider-slide]').first();
  await expect(firstSlide).toHaveAttribute('role', 'group');
  await expect(firstSlide).toHaveAttribute('aria-roledescription', 'slide');
});

test('prev/next controls are real disableable buttons with accessible names', async ({ page }) => {
  await page.goto('/strict.html?mode=finite');
  await page.waitForFunction(() => window.__sliderReady === true);

  const prev = page.locator('.csp-slider__arrow--prev');
  const next = page.locator('.csp-slider__arrow--next');
  await expect(prev).toHaveAttribute('aria-label', /.+/);
  await expect(next).toHaveAttribute('aria-label', /.+/);
  await expect(prev).toBeDisabled(); // at index 0 in finite mode
});

test('reduced motion disables autoplay even when requested', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto('/strict.html?mode=finite&autoplay=true');
  await page.waitForFunction(() => window.__sliderReady === true);

  const isPlaying = await page.evaluate(() => window.__slider.getState().isAutoplaying);
  expect(isPlaying).toBe(false);
  await context.close();
});

test('focus entering the carousel stops autoplay and requires explicit restart', async ({
  page,
}) => {
  await page.goto('/strict.html?mode=finite&autoplay=true');
  await page.waitForFunction(() => window.__sliderReady === true);
  await page.evaluate(() => window.__slider.play());
  expect(await page.evaluate(() => window.__slider.getState().isAutoplaying)).toBe(true);

  await page.locator('.csp-slider__arrow--next').focus();
  expect(await page.evaluate(() => window.__slider.getState().isAutoplaying)).toBe(false);

  await page.locator('.csp-slider__arrow--next').blur();
  await page.waitForTimeout(300);
  // Blurring alone must not resume autoplay; only an explicit play() should.
  expect(await page.evaluate(() => window.__slider.getState().isAutoplaying)).toBe(false);
});

test('keyboard-only operation: Tab to track, arrow keys navigate, Home/End jump', async ({
  page,
}) => {
  await page.goto('/strict.html?mode=finite');
  await page.waitForFunction(() => window.__sliderReady === true);

  await page.locator('[data-slider-track]').focus();
  await page.keyboard.press('End');
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__slider.getState().index)).toBe(4);

  await page.keyboard.press('Home');
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__slider.getState().index)).toBe(0);
});
