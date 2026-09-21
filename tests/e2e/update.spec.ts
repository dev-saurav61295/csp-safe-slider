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

/**
 * Regression coverage for `update()` coherence. The published 1.0.1
 * `update()` merged new options into the config object but several
 * controllers (drag, keyboard, autoplay) had captured their own copy of
 * the *initial* options at construction time and never consulted the live
 * config again — so axis/threshold/interval/pause-rule changes made via
 * `update()` silently had no effect, autoplay could not be turned on or
 * off after creation, and effect changes didn't rebuild the loop or reset
 * fade accessibility state. These tests exercise the actual behavioral
 * effect of each updateable option, not just that `update()` doesn't throw.
 */

test.describe('axis/keyboard/drag coherence', () => {
  test('update({axis}) changes which arrow keys navigate', async ({ page }) => {
    await ready(page, '?mode=finite&axis=horizontal');
    expect((await state(page)).axis).toBe('horizontal');

    await page.evaluate(() => window.__slider.update({ axis: 'vertical' }));
    expect((await state(page)).axis).toBe('vertical');

    await page.locator('[data-slider-track]').focus();
    await page.keyboard.press('ArrowDown');
    await expect.poll(async () => (await state(page)).index).toBe(1);

    // The old horizontal key must no longer drive navigation once axis
    // has changed — confirms the keyboard controller reads axis live
    // rather than the value captured at construction.
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);
    expect((await state(page)).index).toBe(1);
  });

  test('update({axis}) changes the drag axis actually used', async ({ page }) => {
    // No `narrow=true` here: that class sets a *percentage* flex-basis,
    // which needs a definite reference size — fine against the track's
    // width (horizontal), but against an undefined/auto track height once
    // switched to vertical it wouldn't necessarily produce any overflow to
    // drag through. Default (non-narrow) vertical sizing is exercised
    // elsewhere (navigation.spec.ts) and reliably overflows.
    await ready(page, '?mode=finite&axis=horizontal');
    await page.evaluate(() => window.__slider.update({ axis: 'vertical' }));

    const track = page.locator('[data-slider-track]');
    const box = await track.boundingBox();
    if (!box) throw new Error('no bounding box');

    // A horizontal drag must no longer move the (now-vertical) track.
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 4, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    expect((await state(page)).index).toBe(0);

    // A vertical drag should.
    await page.mouse.move(box.x + box.width / 2, box.y + box.height - 10);
    await page.mouse.down();
    for (let i = 0; i < 8; i++) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height - 10 - i * (box.height / 4));
      await page.waitForTimeout(15);
    }
    await page.mouse.up();
    await expect.poll(async () => (await state(page)).index, { timeout: 3000 }).toBeGreaterThan(0);
  });

  test('update({dragThreshold}) reaches the drag controller', async ({ page }) => {
    await ready(page, '?mode=finite&narrow=true');
    await page.evaluate(() => window.__slider.update({ dragThreshold: 500 }));

    const track = page.locator('[data-slider-track]');
    const box = await track.boundingBox();
    if (!box) throw new Error('no bounding box');

    await page.evaluate(() => {
      window.__dragStartFired = false;
      window.__slider.on('dragStart', () => {
        window.__dragStartFired = true;
      });
    });
    // A 20px drag must not cross a 500px threshold.
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 20, box.y + box.height / 2, { steps: 3 });
    await page.mouse.up();
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => window.__dragStartFired)).toBe(false);

    await page.evaluate(() => window.__slider.update({ dragThreshold: 2 }));
    await page.evaluate(() => {
      window.__dragStartFired = false;
    });
    // The same 20px drag must now cross the lowered threshold.
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 20, box.y + box.height / 2, { steps: 3 });
    await page.mouse.up();
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => window.__dragStartFired)).toBe(true);
  });
});

declare global {
  interface Window {
    __dragStartFired?: boolean;
    __changeCount?: number;
  }
}

test.describe('autoplay coherence', () => {
  test('enabling autoplay via update() establishes listeners/controls and starts playing', async ({
    page,
  }) => {
    await ready(page, '?mode=loop&autoplay=false');
    expect((await state(page)).isAutoplaying).toBe(false);
    await expect(page.locator('.csp-slider__rotation')).toBeHidden();

    await page.evaluate(() => window.__slider.update({ autoplay: { interval: 150 } }));
    await expect(page.locator('.csp-slider__rotation')).toBeVisible();
    expect((await state(page)).isAutoplaying).toBe(true);

    const before = (await state(page)).index;
    await page.waitForTimeout(400);
    const after = (await state(page)).index;
    expect(after).not.toBe(before);
  });

  test('disabling autoplay via update() clears the timer and hides the control', async ({
    page,
  }) => {
    await ready(page, '?mode=loop&autoplay=true');
    await expect.poll(async () => (await state(page)).isAutoplaying).toBe(true);

    await page.evaluate(() => window.__slider.update({ autoplay: false }));
    expect((await state(page)).isAutoplaying).toBe(false);
    await expect(page.locator('.csp-slider__rotation')).toBeHidden();

    const before = (await state(page)).index;
    await page.waitForTimeout(500);
    const after = (await state(page)).index;
    expect(after).toBe(before);
  });

  test('an update() while autoplay is playing does not spawn duplicate timers', async ({
    page,
  }) => {
    await ready(page, '?mode=loop&autoplay=true');
    await page.evaluate(() => window.__slider.update({ mode: 'loop' }));
    await page.evaluate(() => window.__slider.update({ mode: 'loop' }));
    await page.evaluate(() => window.__slider.update({ mode: 'loop' }));

    const changes: number[] = [];
    await page.evaluate(() => {
      window.__changeCount = 0;
      window.__slider.on('change', () => {
        window.__changeCount = (window.__changeCount ?? 0) + 1;
      });
    });
    await page.waitForTimeout(1050); // ~5 intervals at 200ms
    const count = await page.evaluate(() => window.__changeCount);
    changes.push(count ?? 0);
    // At 200ms/interval over ~1s, a single timer advances roughly 4-6
    // times; duplicated timers from repeated update() calls would double
    // or triple that rate.
    expect(changes[0]).toBeGreaterThanOrEqual(2);
    expect(changes[0]).toBeLessThanOrEqual(8);
  });

  test('update() never resumes rotation after an explicit pause()', async ({ page }) => {
    await ready(page, '?mode=loop&autoplay=true');
    await expect.poll(async () => (await state(page)).isAutoplaying).toBe(true);

    await page.evaluate(() => window.__slider.pause());
    expect((await state(page)).isAutoplaying).toBe(false);

    await page.evaluate(() => window.__slider.update({ autoplay: { interval: 300 } }));
    expect((await state(page)).isAutoplaying).toBe(false);

    const before = (await state(page)).index;
    await page.waitForTimeout(500);
    expect((await state(page)).index).toBe(before);
  });

  test('reduced motion is still respected when autoplay is enabled via update()', async ({
    browser,
  }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    await ready(page, '?mode=loop&autoplay=false');

    await page.evaluate(() => window.__slider.update({ autoplay: { interval: 100 } }));
    await page.waitForTimeout(100);
    expect((await state(page)).isAutoplaying).toBe(false);
    await context.close();
  });
});

test.describe('effect changes', () => {
  test('slide -> fade removes loop clones and applies fade a11y state', async ({ page }) => {
    await ready(page, '?mode=loop&effect=slide');
    expect(await page.locator('[data-slider-clone]').count()).toBe(10);

    await page.evaluate(() => window.__slider.update({ effect: 'fade' }));
    expect(await page.locator('[data-slider-clone]').count()).toBe(0);

    const inactiveHidden = await page
      .locator('[data-slider-slide]:not([data-slider-clone])')
      .nth(1)
      .getAttribute('aria-hidden');
    expect(inactiveHidden).toBe('true');
  });

  test('fade -> slide rebuilds loop clones and clears stale fade a11y state', async ({ page }) => {
    await ready(page, '?mode=loop&effect=fade');
    expect(await page.locator('[data-slider-clone]').count()).toBe(0);

    await page.evaluate(() => window.__slider.update({ effect: 'slide' }));
    expect(await page.locator('[data-slider-clone]').count()).toBe(10);

    const inactiveHiddenAttr = await page
      .locator('[data-slider-slide]:not([data-slider-clone])')
      .nth(1)
      .getAttribute('aria-hidden');
    expect(inactiveHiddenAttr).toBeNull();
  });
});

test.describe('repeated updates do not accumulate state', () => {
  test('calling update() many times keeps a single controls block and stable dot/clone counts', async ({
    page,
  }) => {
    await ready(page, '?mode=loop');
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => window.__slider.update({ slidesToScroll: 1 }));
    }
    expect(await page.locator('.csp-slider__controls').count()).toBe(1);
    expect(await page.locator('.csp-slider__dot').count()).toBe(5);
    expect(await page.locator('[data-slider-clone]').count()).toBe(10);
  });
});
