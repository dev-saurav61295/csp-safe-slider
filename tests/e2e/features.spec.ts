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

test('fade effect toggles data-state without moving track scroll position', async ({ page }) => {
  await ready(page, '?mode=finite&effect=fade');
  const track = page.locator('[data-slider-track]');
  const before = await track.evaluate((el) => el.scrollLeft);

  await page.evaluate(() => window.__slider.next());
  await page.waitForTimeout(500);

  const after = await track.evaluate((el) => el.scrollLeft);
  expect(after).toBe(before); // fade never scrolls the track

  const activeCount = await page.locator('[data-slider-slide][data-state="active"]').count();
  expect(activeCount).toBe(1);
  await expect(page.locator('[data-slider-slide]').nth(1)).toHaveAttribute('data-state', 'active');
});

test('freeScroll disables CSS scroll-snap on the track', async ({ page }) => {
  await ready(page, '?mode=finite&freeScroll=true');
  const snapType = await page
    .locator('[data-slider-track]')
    .evaluate((el) => getComputedStyle(el).scrollSnapType);
  expect(snapType).toBe('none');
});

test('mouse click-and-drag scrolls the track and updates the index', async ({ page }) => {
  await ready(page, '?mode=finite&narrow=true');
  const track = page.locator('[data-slider-track]');
  const box = await track.boundingBox();
  if (!box) throw new Error('no bounding box');

  // Each slide is ~1/3 of the track; drag well past one slide's width so
  // the browser's scroll-snap lands on index 1 regardless of its specific
  // velocity/threshold heuristic.
  await page.mouse.move(box.x + box.width - 20, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 0; i < 10; i++) {
    await page.mouse.move(box.x + box.width - 20 - i * (box.width / 5), box.y + box.height / 2);
    await page.waitForTimeout(20);
  }
  await page.mouse.up();

  await expect
    .poll(() => page.evaluate(() => window.__slider.getState().index), { timeout: 3000 })
    .toBeGreaterThan(0);
});

test('autoplay stops ticking after destroy (no leaked timer)', async ({ page }) => {
  await ready(page, '?mode=loop&autoplay=true');
  await page.waitForTimeout(250);
  const beforeDestroy = await page.evaluate(() => window.__slider.getState().index);

  await page.evaluate(() => window.__slider.destroy());
  await page.waitForTimeout(700); // several autoplay intervals (200ms each)

  const afterWait = await page.evaluate(() => window.__slider.getState().index);
  expect(afterWait).toBe(beforeDestroy);
});

test('resize after destroy does not move the slider (no leaked ResizeObserver)', async ({
  page,
}) => {
  await ready(page, '?mode=finite');
  await page.evaluate(() => window.__slider.goTo(2, { animate: false }));
  await page.waitForTimeout(300);
  const before = await page.evaluate(() => window.__slider.getState().index);

  await page.evaluate(() => window.__slider.destroy());
  await page.setViewportSize({ width: 400, height: 700 });
  await page.waitForTimeout(300);
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.waitForTimeout(300);

  const after = await page.evaluate(() => window.__slider.getState().index);
  expect(after).toBe(before);
});
