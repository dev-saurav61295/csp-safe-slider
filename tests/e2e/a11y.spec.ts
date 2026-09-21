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

test.describe('pagination dot semantics', () => {
  test('dots use plain-button + aria-current semantics, not an unmanaged tablist', async ({
    page,
  }) => {
    await page.goto('/strict.html?mode=finite');
    await page.waitForFunction(() => window.__sliderReady === true);

    const dotsContainer = page.locator('.csp-slider__dots');
    await expect(dotsContainer).not.toHaveAttribute('role', 'tablist');
    const firstDot = page.locator('.csp-slider__dot').first();
    await expect(firstDot).not.toHaveAttribute('role', 'tab');
    await expect(firstDot).toHaveAttribute('aria-current', 'true');

    const secondDot = page.locator('.csp-slider__dot').nth(1);
    await expect(secondDot).not.toHaveAttribute('aria-current', /.+/);

    await page.evaluate(() => window.__slider.goTo(1, { animate: false }));
    await expect(secondDot).toHaveAttribute('aria-current', 'true');
    await expect(firstDot).not.toHaveAttribute('aria-current', /.+/);
  });
});

test.describe('fade mode focus/tabindex lifecycle', () => {
  test('inactive fade slides remove focusable content from the tab order, active slide restores it', async ({
    page,
  }) => {
    await page.goto('/strict.html?mode=finite&effect=fade&startIndex=2');
    await page.waitForFunction(() => window.__sliderReady === true);

    const link = page.locator('#in-slide-link');
    // Active (index 2 holds the link) — reachable.
    await expect(link).not.toHaveAttribute('tabindex', '-1');

    await page.evaluate(() => window.__slider.goTo(0, { animate: false }));
    await expect(link).toHaveAttribute('tabindex', '-1');

    await page.evaluate(() => window.__slider.goTo(2, { animate: false }));
    await expect(link).not.toHaveAttribute('tabindex', '-1');
  });

  test('a consumer-authored custom tabindex is preserved, not just removed on reactivation', async ({
    page,
  }) => {
    await page.goto('/strict.html?mode=finite&effect=fade&startIndex=1');
    await page.waitForFunction(() => window.__sliderReady === true);

    const custom = page.locator('#custom-tabindex-el');
    await expect(custom).toHaveAttribute('tabindex', '0');

    await page.evaluate(() => window.__slider.goTo(0, { animate: false }));
    await expect(custom).toHaveAttribute('tabindex', '-1');

    await page.evaluate(() => window.__slider.goTo(1, { animate: false }));
    // Must come back as the original "0", not just have -1 removed by
    // accident and left with no attribute at all.
    await expect(custom).toHaveAttribute('tabindex', '0');
  });

  test('switching from fade to slide clears stale hidden/focus restrictions', async ({ page }) => {
    await page.goto('/strict.html?mode=finite&effect=fade&startIndex=2');
    await page.waitForFunction(() => window.__sliderReady === true);

    await page.evaluate(() => window.__slider.goTo(0, { animate: false }));
    const link = page.locator('#in-slide-link');
    await expect(link).toHaveAttribute('tabindex', '-1');
    await expect(page.locator('[data-slider-slide]').nth(2)).toHaveAttribute('aria-hidden', 'true');

    await page.evaluate(() => window.__slider.update({ effect: 'slide' }));
    await expect(link).not.toHaveAttribute('tabindex', '-1');
    await expect(page.locator('[data-slider-slide]').nth(2)).not.toHaveAttribute(
      'aria-hidden',
      /.+/,
    );
  });
});

test.describe('direction option', () => {
  test('an explicit direction option sets dir and is restored on destroy', async ({ page }) => {
    await page.goto('/strict.html?mode=finite&direction=rtl');
    await page.waitForFunction(() => window.__sliderReady === true);

    const root = page.locator('#slider');
    await expect(root).toHaveAttribute('dir', 'rtl');
    expect(await page.evaluate(() => window.__slider.getState().direction)).toBe('rtl');

    await page.evaluate(() => window.__slider.destroy());
    await expect(root).not.toHaveAttribute('dir', /.+/);
  });

  test('an explicit direction option restores a pre-existing dir attribute on destroy', async ({
    page,
  }) => {
    await page.goto('/strict.html?mode=finite');
    await page.waitForFunction(() => window.__sliderReady === true);
    await page.evaluate(() => document.getElementById('slider')!.setAttribute('dir', 'ltr'));
    await page.evaluate(() => window.__slider.destroy());

    // Re-init with an explicit direction over the pre-existing 'ltr'.
    const result = await page.evaluate(async () => {
      const { createSlider } = await import('/dist/index.js');
      const root = document.getElementById('slider')!;
      const s = createSlider(root, { mode: 'finite', direction: 'rtl' });
      const during = root.getAttribute('dir');
      s.destroy();
      const after = root.getAttribute('dir');
      return { during, after };
    });
    expect(result.during).toBe('rtl');
    expect(result.after).toBe('ltr');
  });
});

test.describe('lifecycle correctness', () => {
  test('refresh() renumbers library-generated slide labels but preserves a custom aria-label', async ({
    page,
  }) => {
    await page.goto('/strict.html?mode=finite&slides=3');
    await page.waitForFunction(() => window.__sliderReady === true);
    await page.evaluate(() => {
      document.querySelectorAll('[data-slider-slide]')[1].setAttribute('aria-label', 'Custom');
    });

    await page.evaluate(() => {
      const track = document.querySelector('[data-slider-track]')!;
      const slide = document.createElement('div');
      slide.className = 'csp-slider__slide';
      slide.setAttribute('data-slider-slide', '');
      slide.textContent = 'Added';
      track.append(slide);
      window.__slider.refresh();
    });

    const labels = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-slider-slide]')).map((el) =>
        el.getAttribute('aria-label'),
      ),
    );
    expect(labels[0]).toBe('1 of 4');
    expect(labels[1]).toBe('Custom'); // untouched, consumer-authored
    expect(labels[2]).toBe('3 of 4'); // library-owned, renumbered
    expect(labels[3]).toBe('4 of 4'); // newly added slide, labeled
  });

  test('destroy() is idempotent', async ({ page }) => {
    await page.goto('/strict.html?mode=finite');
    await page.waitForFunction(() => window.__sliderReady === true);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    await page.evaluate(() => {
      window.__slider.destroy();
      window.__slider.destroy();
      window.__slider.destroy();
    });
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => window.__slider.getState().destroyed)).toBe(true);
  });

  test('reinitializing the same root after destroy() does not accumulate controls/clones/listeners', async ({
    page,
  }) => {
    await page.goto('/strict.html?mode=loop');
    await page.waitForFunction(() => window.__sliderReady === true);
    expect(await page.locator('[data-slider-clone]').count()).toBe(10);

    const result = await page.evaluate(async () => {
      const { createSlider } = await import('/dist/index.js');
      const root = document.getElementById('slider')!;
      window.__slider.destroy();
      window.__slider = createSlider(root, { mode: 'loop' });
      return window.__slider.getState();
    });
    expect(result.slideCount).toBe(5);
    expect(await page.locator('[data-slider-clone]').count()).toBe(10);
    expect(await page.locator('.csp-slider__controls').count()).toBe(1);

    // The reinitialized instance must actually still work.
    await page.evaluate(() => window.__slider.goTo(2, { animate: false }));
    await expect.poll(async () => page.evaluate(() => window.__slider.getState().index)).toBe(2);
  });
});
