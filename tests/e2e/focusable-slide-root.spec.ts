import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    __slider: import('../../src/index.js').Slider;
    __sliderReady: boolean;
  }
}

/**
 * Regression coverage for issue #4: fade-mode and loop-clone neutralization
 * both scanned only `slide.querySelectorAll(...)`, which never matches the
 * slide element itself — so a slide whose *root* is the focusable thing
 * (`<a data-slider-slide>`, `<button data-slider-slide>`, a root with an
 * author `tabindex`) stayed reachable by keyboard while inactive/hidden.
 */

async function ready(page: import('@playwright/test').Page, query = '') {
  await page.goto(`/focusable-root.html${query}`);
  await page.waitForFunction(() => window.__sliderReady === true);
}

test.describe('fade mode: focusable slide roots', () => {
  test('an anchor slide root is neutralized while inactive and restored when active', async ({
    page,
  }) => {
    await ready(page, '?effect=fade&startIndex=0');
    const anchor = page.locator('#slide-anchor');
    await expect(anchor).not.toHaveAttribute('tabindex', '-1');

    await page.evaluate(() => window.__slider.goTo(1, { animate: false }));
    await expect(anchor).toHaveAttribute('tabindex', '-1');

    await page.evaluate(() => window.__slider.goTo(0, { animate: false }));
    await expect(anchor).not.toHaveAttribute('tabindex', '-1');
  });

  test('a button slide root is neutralized while inactive', async ({ page }) => {
    await ready(page, '?effect=fade&startIndex=1');
    const button = page.locator('#slide-button');
    await expect(button).not.toHaveAttribute('tabindex', '-1');

    await page.evaluate(() => window.__slider.goTo(0, { animate: false }));
    await expect(button).toHaveAttribute('tabindex', '-1');
  });

  test('a root with an author tabindex="0" is forced to -1 while inactive and restored to "0", not removed', async ({
    page,
  }) => {
    await ready(page, '?effect=fade&startIndex=2');
    const tabindexSlide = page.locator('#slide-tabindex');
    await expect(tabindexSlide).toHaveAttribute('tabindex', '0');

    await page.evaluate(() => window.__slider.goTo(0, { animate: false }));
    await expect(tabindexSlide).toHaveAttribute('tabindex', '-1');

    await page.evaluate(() => window.__slider.goTo(2, { animate: false }));
    await expect(tabindexSlide).toHaveAttribute('tabindex', '0');
  });

  test('switching from fade to slide restores every neutralized slide root', async ({ page }) => {
    await ready(page, '?effect=fade&startIndex=0');
    await page.evaluate(() => window.__slider.goTo(1, { animate: false }));
    await expect(page.locator('#slide-anchor')).toHaveAttribute('tabindex', '-1');

    await page.evaluate(() => window.__slider.update({ effect: 'slide' }));
    await expect(page.locator('#slide-anchor')).not.toHaveAttribute('tabindex', '-1');
    await expect(page.locator('#slide-tabindex')).toHaveAttribute('tabindex', '0');
  });

  test('refresh() keeps inactive focusable slide roots neutralized', async ({ page }) => {
    await ready(page, '?effect=fade&startIndex=0');
    await page.evaluate(() => window.__slider.refresh());
    await expect(page.locator('#slide-button')).toHaveAttribute('tabindex', '-1');
    await expect(page.locator('#slide-tabindex')).toHaveAttribute('tabindex', '-1');
  });

  test('destroy() restores every slide root tabindex to its pre-init value', async ({ page }) => {
    await ready(page, '?effect=fade&startIndex=1');
    await expect(page.locator('#slide-anchor')).toHaveAttribute('tabindex', '-1');

    await page.evaluate(() => window.__slider.destroy());
    await expect(page.locator('#slide-anchor')).not.toHaveAttribute('tabindex', /.+/);
    await expect(page.locator('#slide-button')).not.toHaveAttribute('tabindex', /.+/);
    // The author-set tabindex="0" must come back exactly, not be removed.
    await expect(page.locator('#slide-tabindex')).toHaveAttribute('tabindex', '0');
  });

  test('no accessibility violations with focusable slide roots in fade mode', async ({ page }) => {
    await ready(page, '?effect=fade&startIndex=0');
    // Let the fade CSS opacity transition (--slider-duration, 400ms by
    // default) finish before scanning — axe's color-contrast check samples
    // actual rendered/composited color, so scanning mid-transition on an
    // inactive (opacity animating toward 0) slide can catch a transient
    // partial-opacity blend and report a flaky, unrepresentative contrast
    // ratio that has nothing to do with the slide's real steady state.
    await page.waitForTimeout(500);
    const results = await new AxeBuilder({ page }).include('#slider').analyze();
    expect(results.violations).toEqual([]);
  });
});

test.describe('loop mode: focusable slide roots as clones', () => {
  test('the cloned anchor/button/tabindex slide roots are neutralized and unfocusable', async ({
    page,
  }) => {
    await ready(page, '?mode=loop&effect=slide');
    const info = await page.evaluate(() => {
      const clones = Array.from(document.querySelectorAll<HTMLElement>('[data-slider-clone]'));
      return {
        count: clones.length,
        allInert: clones.every((c) => c.inert === true),
        allTabindexNeg1: clones.every((c) => c.getAttribute('tabindex') === '-1'),
      };
    });
    expect(info.count).toBe(6); // 3 real slides * 2
    expect(info.allInert).toBe(true);
    expect(info.allTabindexNeg1).toBe(true);

    const focusResult = await page.evaluate(() => {
      const clone = document.querySelector('[data-slider-clone]') as HTMLElement;
      clone.focus();
      return document.activeElement === clone;
    });
    expect(focusResult).toBe(false);
  });

  test('no accessibility violations with focusable slide roots in loop mode', async ({ page }) => {
    await ready(page, '?mode=loop&effect=slide');
    const results = await new AxeBuilder({ page }).include('#slider').analyze();
    expect(results.violations).toEqual([]);
  });
});
