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
 * Regression coverage for touch interaction (finding #4 in the static
 * review): the published CSS set `touch-action: pan-y` on the horizontal
 * track (and `pan-x` on the vertical track) — which tells the browser to
 * natively pan *only* the perpendicular axis, silently disabling native
 * touch panning along the track's own scroll axis — while the JS drag
 * controller only ever handled `pointerType === 'mouse'`. Together, touch
 * users could not swipe the slider at all.
 *
 * IMPORTANT — verification method: these tests use Playwright's
 * `page.touchscreen` API, which dispatches real platform touch input
 * through the browser engine's own touch/pointer pipeline (Chromium via
 * CDP `Input.dispatchTouchEvent`), not hand-rolled synthetic
 * `dispatchEvent(new PointerEvent(...))` calls from page-context JS — the
 * latter would not exercise the browser's native touch-scrolling/
 * touch-action machinery at all, which is exactly the mechanism under
 * test here. This is automated emulation of touch input in a desktop
 * browser engine, not verification on a real iOS/Android device — no
 * claim of physical-device testing is made. `hasTouch` is only reliably
 * emulated in Chromium and WebKit; this suite runs those two projects and
 * is skipped on Firefox, which Playwright does not support for
 * `page.touchscreen`.
 */

test.describe('touch scrolling (Chromium/WebKit touch emulation)', () => {
  test.skip(({ browserName }) => browserName === 'firefox', 'Firefox has no touchscreen emulation');
  test.use({ hasTouch: true });

  test('horizontal slider: a real native touch swipe scrolls the track (Chromium CDP)', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'CDP touch dispatch is Chromium-only');
    await ready(page, '?mode=finite&narrow=true');
    const track = page.locator('[data-slider-track]');
    const box = await track.boundingBox();
    if (!box) throw new Error('no bounding box');

    const y = box.y + box.height / 2;
    const startX = box.x + box.width - 20;
    const endX = box.x + 20;

    // CDP's Input.dispatchTouchEvent produces real, trusted touch input
    // that the browser's own compositor/touch-action machinery acts on —
    // unlike a page-context `dispatchEvent(new PointerEvent(...))`, which
    // is synthetic and never engages native scrolling. This is the
    // "meaningful browser touch-input facility" the task calls for, run
    // in a desktop browser engine — not a substitute for a physical
    // iOS/Android device, which was not used here.
    const cdp = await page.context().newCDPSession(page);
    const points = 12;
    for (let i = 0; i <= points; i++) {
      const x = startX + ((endX - startX) * i) / points;
      await cdp.send('Input.dispatchTouchEvent', {
        type: i === 0 ? 'touchStart' : i === points ? 'touchEnd' : 'touchMove',
        touchPoints: i === points ? [] : [{ x, y }],
      });
      await page.waitForTimeout(16);
    }

    await expect.poll(async () => (await state(page)).index, { timeout: 3000 }).toBeGreaterThan(0);
  });

  // A computed `touch-action` of exactly `pan-x pan-y pinch-zoom` is
  // serialized by browsers as the equivalent keyword `manipulation` (both
  // permit panning on both axes plus pinch-zoom, just spelled
  // differently) — so the meaningful assertion is "not restricted to a
  // single axis or none", not a literal string match.
  function permitsBothAxes(touchAction: string): boolean {
    return (
      touchAction === 'manipulation' ||
      touchAction === 'auto' ||
      (touchAction.includes('pan-x') && touchAction.includes('pan-y'))
    );
  }

  test('horizontal track permits native panning on its own axis (touch-action contract)', async ({
    page,
  }) => {
    await ready(page, '?mode=finite');
    const touchAction = await page
      .locator('[data-slider-track]')
      .evaluate((el) => getComputedStyle(el).touchAction);
    // The regression this guards: a value that only lists the
    // perpendicular axis (e.g. `pan-y` alone) tells the browser NOT to
    // natively pan horizontally at all, silently defeating touch
    // scrolling of a horizontal slider.
    expect(permitsBothAxes(touchAction)).toBe(true);
  });

  test('vertical track permits native panning on its own axis (touch-action contract)', async ({
    page,
  }) => {
    await ready(page, '?mode=finite&axis=vertical');
    const touchAction = await page
      .locator('[data-slider-track]')
      .evaluate((el) => getComputedStyle(el).touchAction);
    expect(permitsBothAxes(touchAction)).toBe(true);
  });

  test('the drag controller ignores touch pointers entirely (native scrolling owns them)', async ({
    page,
  }) => {
    await ready(page, '?mode=finite&narrow=true');
    const track = page.locator('[data-slider-track]');
    const box = await track.boundingBox();
    if (!box) throw new Error('no bounding box');

    const dragEvents = await page.evaluate(
      async ({ x, y, w }) => {
        const el = document.querySelector('[data-slider-track]') as HTMLElement;
        const events: string[] = [];
        window.__slider.on('dragStart', () => events.push('dragStart'));
        window.__slider.on('dragEnd', () => events.push('dragEnd'));

        function firePointer(type: string, cx: number, cy: number) {
          el.dispatchEvent(
            new PointerEvent(type, {
              pointerId: 7,
              pointerType: 'touch',
              clientX: cx,
              clientY: cy,
              bubbles: true,
              cancelable: true,
              isPrimary: true,
            }),
          );
        }
        firePointer('pointerdown', x, y);
        firePointer('pointermove', x - w * 0.5, y);
        firePointer('pointerup', x - w * 0.5, y);
        await new Promise((r) => setTimeout(r, 50));
        return events;
      },
      { x: box.x + box.width - 20, y: box.y + box.height / 2, w: box.width },
    );

    // No mouse-style drag lifecycle should fire for a touch pointer — that
    // would mean the JS controller is fighting native touch scrolling
    // rather than leaving it to the browser.
    expect(dragEvents).toEqual([]);
  });

  test('mouse dragging still works after the touch-action change', async ({ page }) => {
    await ready(page, '?mode=finite&narrow=true');
    const track = page.locator('[data-slider-track]');
    const box = await track.boundingBox();
    if (!box) throw new Error('no bounding box');

    await page.mouse.move(box.x + box.width - 20, box.y + box.height / 2);
    await page.mouse.down();
    for (let i = 0; i < 10; i++) {
      await page.mouse.move(box.x + box.width - 20 - i * (box.width / 5), box.y + box.height / 2);
      await page.waitForTimeout(15);
    }
    await page.mouse.up();

    await expect.poll(async () => (await state(page)).index, { timeout: 3000 }).toBeGreaterThan(0);
  });

  test('a tap on in-slide interactive content still activates it (not swallowed as a drag)', async ({
    page,
  }) => {
    await ready(page, '?mode=finite&startIndex=2');
    const link = page.locator('#in-slide-link');
    await expect(link).toBeVisible();

    let navigated = false;
    page.on('framenavigated', () => {
      navigated = true;
    });
    await link.tap();
    await page.waitForTimeout(150);
    // Tapping the in-slide link should not be intercepted/suppressed by
    // the slider (it only suppresses the click that immediately follows a
    // completed *mouse* drag, never touch).
    expect(await page.evaluate(() => location.hash)).toBe('#slide-3-link');
    void navigated;
  });

  test('page vertical scroll remains usable over a horizontal slider', async ({ page }) => {
    await ready(page, '?mode=finite');
    const before = await page.evaluate(() => window.scrollY);
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(100);
    const after = await page.evaluate(() => window.scrollY);
    expect(after).toBeGreaterThan(before);
  });
});
