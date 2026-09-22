import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    __slider: import('../../src/index.js').Slider;
    __sliderReady: boolean;
    __detachedSlide?: HTMLElement;
  }
}

/**
 * Regression coverage for issue #2: `destroy()` used to remove listeners,
 * controls, observers, and loop clones, but left every attribute/class the
 * library had applied to the root, track, and slides behind — most harmful
 * for a fade slider, where stale `data-state`/`aria-hidden`/effect
 * attributes could leave slides visually or semantically hidden after
 * teardown. These tests compare the exact markup the fixture ships with
 * (see destroy-restore.html) against the markup left behind after
 * `destroy()`.
 */

async function ready(page: import('@playwright/test').Page, query = '') {
  await page.goto(`/destroy-restore.html${query}`);
  await page.waitForFunction(() => window.__sliderReady === true);
}

test('root/track/slide attributes and classes return to their exact pre-init state after destroy()', async ({
  page,
}) => {
  await ready(page, '?mode=finite');
  await page.evaluate(() => window.__slider.destroy());

  const root = page.locator('#slider');
  await expect(root).toHaveClass('csp-slider');
  for (const attr of [
    'role',
    'aria-roledescription',
    'aria-label',
    'data-slider-axis',
    'data-slider-mode',
    'data-slider-effect',
  ]) {
    await expect(root).not.toHaveAttribute(attr, /.+/);
  }

  const track = page.locator('[data-slider-track]');
  await expect(track).toHaveClass('csp-slider__track');
  for (const attr of ['tabindex', 'aria-live', 'data-slider-axis', 'data-slider-effect']) {
    await expect(track).not.toHaveAttribute(attr, /.+/);
  }

  // slide-1 ships with a pre-existing `role="listitem"` in the fixture —
  // the library always overwrites slide `role` to `group` while active, so
  // this specifically proves that pre-existing value comes back rather
  // than being left as the library's overwritten value or wiped outright.
  const slide1 = page.locator('#slide-1');
  await expect(slide1).toHaveAttribute('role', 'listitem');
  await expect(slide1).toHaveClass('csp-slider__slide');
  for (const attr of [
    'aria-roledescription',
    'data-state',
    'data-slider-auto-label',
    'aria-label',
  ]) {
    await expect(slide1).not.toHaveAttribute(attr, /.+/);
  }
});

test('destroying a fade slider restores aria-hidden and link focusability, and stops visually hiding slides', async ({
  page,
}) => {
  await ready(page, '?mode=finite&effect=fade&startIndex=0');
  const inactiveSlide = page.locator('#slide-2');
  const link = page.locator('#link-2');
  await expect(inactiveSlide).toHaveAttribute('aria-hidden', 'true');
  await expect(link).toHaveAttribute('tabindex', '-1');

  await page.evaluate(() => window.__slider.destroy());

  await expect(inactiveSlide).not.toHaveAttribute('aria-hidden', /.+/);
  await expect(inactiveSlide).not.toHaveAttribute('data-state', /.+/);
  await expect(link).not.toHaveAttribute('tabindex', /.+/);

  // The fade CSS only hides a slide via `[data-slider-effect='fade'] .csp-slider__slide`
  // on the track plus that slide's own `data-state` — with both attributes
  // gone post-destroy, every slide must be at full, equal opacity again.
  const opacities = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-slider-slide]')).map(
      (el) => getComputedStyle(el).opacity,
    ),
  );
  expect(new Set(opacities).size).toBe(1);
  expect(opacities[0]).toBe('1');
});

test('a dynamically added slide picked up by refresh() is cleaned up on destroy', async ({
  page,
}) => {
  await ready(page, '?mode=finite');
  await page.evaluate(() => {
    const track = document.querySelector('[data-slider-track]')!;
    const slide = document.createElement('div');
    slide.className = 'csp-slider__slide';
    slide.setAttribute('data-slider-slide', '');
    slide.id = 'slide-added';
    slide.textContent = 'Added';
    track.append(slide);
    window.__slider.refresh();
  });
  await expect(page.locator('#slide-added')).toHaveAttribute('role', 'group');

  await page.evaluate(() => window.__slider.destroy());
  const added = page.locator('#slide-added');
  for (const attr of [
    'role',
    'aria-roledescription',
    'data-state',
    'aria-label',
    'data-slider-auto-label',
  ]) {
    await expect(added).not.toHaveAttribute(attr, /.+/);
  }
  await expect(added).toHaveClass('csp-slider__slide');
});

test('a slide detached from the track before destroy is still restored', async ({ page }) => {
  await ready(page, '?mode=finite');
  const beforeRole = await page.evaluate(() => {
    const slide3 = document.getElementById('slide-3')!;
    slide3.remove();
    window.__detachedSlide = slide3;
    window.__slider.refresh();
    return slide3.getAttribute('role');
  });
  expect(beforeRole).toBe('group');

  await page.evaluate(() => window.__slider.destroy());
  const after = await page.evaluate(() => ({
    role: window.__detachedSlide!.getAttribute('role'),
    dataState: window.__detachedSlide!.getAttribute('data-state'),
    ariaRoledescription: window.__detachedSlide!.getAttribute('aria-roledescription'),
  }));
  expect(after).toEqual({ role: null, dataState: null, ariaRoledescription: null });
});

test('destroy() is idempotent and never throws', async ({ page }) => {
  await ready(page, '?mode=finite&effect=fade');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.evaluate(() => {
    window.__slider.destroy();
    window.__slider.destroy();
    window.__slider.destroy();
  });
  expect(errors).toEqual([]);
});

test('reinitializing the same root after destroy() carries no stale attributes, controls, or clones', async ({
  page,
}) => {
  await ready(page, '?mode=loop&effect=fade');
  await page.evaluate(() => window.__slider.destroy());

  const result = await page.evaluate(async () => {
    const { createSlider } = await import('/dist/index.js');
    const root = document.getElementById('slider')!;
    window.__slider = createSlider(root, { mode: 'loop', effect: 'slide' });
    return {
      trackEffect: document
        .querySelector('[data-slider-track]')!
        .getAttribute('data-slider-effect'),
      slide2AriaHidden: document.getElementById('slide-2')!.getAttribute('aria-hidden'),
      controlsCount: document.querySelectorAll('.csp-slider__controls').length,
      cloneCount: document.querySelectorAll('[data-slider-clone]').length,
    };
  });
  expect(result.trackEffect).toBe('slide');
  expect(result.slide2AriaHidden).toBeNull();
  expect(result.controlsCount).toBe(1);
  expect(result.cloneCount).toBe(6); // 3 real slides * 2, not accumulated from the destroyed instance
});

test('destroy() never replaces real slide DOM nodes (identity survives)', async ({ page }) => {
  await ready(page, '?mode=finite');
  await page.evaluate(() => {
    (
      document.getElementById('slide-1') as HTMLElement & { __consumerMarker?: string }
    ).__consumerMarker = 'kept';
  });

  await page.evaluate(() => window.__slider.destroy());
  const marker = await page.evaluate(
    () =>
      (document.getElementById('slide-1') as HTMLElement & { __consumerMarker?: string })
        .__consumerMarker,
  );
  expect(marker).toBe('kept');
});
