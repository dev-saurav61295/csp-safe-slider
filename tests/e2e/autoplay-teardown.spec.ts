import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    __slider: import('../../src/index.js').Slider;
    __sliderReady: boolean;
    __autoplayEventsAfterDestroy?: number;
  }
}

/**
 * Regression coverage for issue #6: `AutoplayController.detach()` cleared
 * the timer and listeners but never reset its own `running`/suspension
 * state, so `getState().isAutoplaying` could still report `true` after
 * `slider.destroy()`, and a queued `IntersectionObserver` callback firing
 * after `disconnect()` could call `reconcile()` and spin up a brand-new
 * timer on a controller that was supposed to be fully torn down.
 */

async function ready(page: import('@playwright/test').Page, query = '') {
  await page.goto(`/strict.html${query}`);
  await page.waitForFunction(() => window.__sliderReady === true);
}

test('destroying while actively autoplaying reports isAutoplaying: false immediately', async ({
  page,
}) => {
  await ready(page, '?mode=loop&autoplay=true');
  await expect
    .poll(async () => page.evaluate(() => window.__slider.getState().isAutoplaying))
    .toBe(true);

  const isAutoplayingAfterDestroy = await page.evaluate(() => {
    window.__slider.destroy();
    return window.__slider.getState().isAutoplaying;
  });
  expect(isAutoplayingAfterDestroy).toBe(false);
});

test('no index changes or autoplay events fire after destroy, even across several intervals', async ({
  page,
}) => {
  await ready(page, '?mode=loop&autoplay=true');
  await page.waitForTimeout(250);

  await page.evaluate(() => {
    window.__autoplayEventsAfterDestroy = 0;
    window.__slider.on('change', (e) => {
      if (e.source === 'autoplay') {
        window.__autoplayEventsAfterDestroy = (window.__autoplayEventsAfterDestroy ?? 0) + 1;
      }
    });
    window.__slider.destroy();
  });
  const before = await page.evaluate(() => window.__slider.getState().index);
  await page.waitForTimeout(1000); // ~5 intervals at 200ms
  const after = await page.evaluate(() => window.__slider.getState().index);

  expect(after).toBe(before);
  expect(await page.evaluate(() => window.__autoplayEventsAfterDestroy)).toBe(0);
});

test('a same-tick IntersectionObserver callback around destroy cannot restart autoplay', async ({
  page,
}) => {
  await ready(page, '?mode=loop&autoplay=true');
  await page.waitForTimeout(250);

  // Toggling visibility right up to the moment of destroy() maximizes the
  // chance a real browser has an IntersectionObserver callback already
  // queued at the moment `detach()`/`disconnect()` runs.
  await page.evaluate(async () => {
    document.getElementById('slider')!.scrollIntoView();
    window.__slider.destroy();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });

  expect(await page.evaluate(() => window.__slider.getState().isAutoplaying)).toBe(false);
  const before = await page.evaluate(() => window.__slider.getState().index);
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => window.__slider.getState().index)).toBe(before);
});

test('disabling and re-enabling autoplay via update() never leaves duplicate timers', async ({
  page,
}) => {
  await ready(page, '?mode=loop&autoplay=true');
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.__slider.update({ autoplay: false }));
    await page.evaluate(() => window.__slider.update({ autoplay: { interval: 200 } }));
  }
  await expect
    .poll(async () => page.evaluate(() => window.__slider.getState().isAutoplaying))
    .toBe(true);

  await page.evaluate(() => {
    window.__autoplayEventsAfterDestroy = 0;
    window.__slider.on('change', (e) => {
      if (e.source === 'autoplay') {
        window.__autoplayEventsAfterDestroy = (window.__autoplayEventsAfterDestroy ?? 0) + 1;
      }
    });
  });
  await page.waitForTimeout(1050); // ~5 intervals at 200ms
  const count = await page.evaluate(() => window.__autoplayEventsAfterDestroy);
  // A single timer advances roughly 4-6 times here; duplicated timers from
  // repeated enable/disable cycles would double or triple that rate.
  expect(count ?? 0).toBeGreaterThanOrEqual(2);
  expect(count ?? 0).toBeLessThanOrEqual(8);
});

test('getState().isAutoplaying is false after destroy even without ever pausing first', async ({
  page,
}) => {
  await ready(page, '?mode=loop&autoplay=true');
  await expect
    .poll(async () => page.evaluate(() => window.__slider.getState().isAutoplaying))
    .toBe(true);
  await page.evaluate(() => window.__slider.destroy());
  // Re-check after a delay too, in case anything asynchronous tried to flip it back.
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__slider.getState().isAutoplaying)).toBe(false);
});
