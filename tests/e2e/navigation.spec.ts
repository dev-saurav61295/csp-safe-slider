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

test.describe('boundary modes', () => {
  test('finite mode disables navigation past either edge', async ({ page }) => {
    await ready(page, '?mode=finite');
    await page.evaluate(() => window.__slider.goTo(4, { animate: false }));
    await page.waitForTimeout(300);
    expect((await state(page)).index).toBe(4);
    expect((await state(page)).canNext).toBe(false);

    await page.evaluate(() => window.__slider.next());
    await page.waitForTimeout(300);
    expect((await state(page)).index).toBe(4);

    await page.evaluate(() => window.__slider.goTo(0, { animate: false }));
    await page.waitForTimeout(300);
    await page.evaluate(() => window.__slider.prev());
    await page.waitForTimeout(300);
    expect((await state(page)).index).toBe(0);
  });

  test('rewind mode wraps to the opposite edge exactly once', async ({ page }) => {
    await ready(page, '?mode=rewind');
    await page.evaluate(() => window.__slider.goTo(4, { animate: false }));
    await page.waitForTimeout(300);

    await page.evaluate(() => window.__slider.next());
    await page.waitForTimeout(400);
    expect((await state(page)).index).toBe(0);

    await page.evaluate(() => window.__slider.prev());
    await page.waitForTimeout(400);
    expect((await state(page)).index).toBe(4);
  });

  test('loop mode settles back to logical index 0 after crossing the end', async ({ page }) => {
    await ready(page, '?mode=loop');
    await page.evaluate(() => window.__slider.goTo(4, { animate: false }));
    await page.waitForTimeout(300);

    await page.evaluate(() => window.__slider.next());
    await page.waitForTimeout(600);
    expect((await state(page)).index).toBe(0);

    await page.evaluate(() => window.__slider.prev());
    await page.waitForTimeout(600);
    expect((await state(page)).index).toBe(4);
  });
});

test.describe('direct navigation and slidesToScroll grouping', () => {
  test('goTo jumps directly to the requested index', async ({ page }) => {
    await ready(page, '?mode=finite');
    await page.evaluate(() => window.__slider.goTo(3, { animate: true }));
    await page.waitForTimeout(500);
    expect((await state(page)).index).toBe(3);
  });

  test('next/prev advance by slidesToScroll', async ({ page }) => {
    await ready(page, '?mode=finite&slidesToScroll=2');
    await page.evaluate(() => window.__slider.next());
    await page.waitForTimeout(300);
    expect((await state(page)).index).toBe(2);
  });
});

test.describe('axis and direction', () => {
  test('vertical axis scrolls the track top-to-bottom', async ({ page }) => {
    await ready(page, '?axis=vertical&mode=finite');
    expect((await state(page)).axis).toBe('vertical');
    await page.evaluate(() => window.__slider.next());
    await page.waitForTimeout(300);
    expect((await state(page)).index).toBe(1);
  });

  test('RTL flips arrow-key direction', async ({ page }) => {
    await ready(page, '?mode=finite&dir=rtl');
    expect((await state(page)).direction).toBe('rtl');

    const track = page.locator('[data-slider-track]');
    await track.focus();
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(300);
    // In RTL, ArrowLeft moves to the *next* logical slide.
    expect((await state(page)).index).toBe(1);
  });
});

test.describe('edge-case slide counts', () => {
  test('zero slides does not throw and reports slideCount 0', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await ready(page, '?slides=0');
    expect((await state(page)).slideCount).toBe(0);
    expect(errors).toEqual([]);
  });

  test('a single slide disables both prev and next', async ({ page }) => {
    await ready(page, '?slides=1&mode=finite');
    const s = await state(page);
    expect(s.slideCount).toBe(1);
    expect(s.canPrev).toBe(false);
    expect(s.canNext).toBe(false);
  });
});

test.describe('lifecycle', () => {
  test('destroy() removes built-in controls and stops responding to API calls', async ({
    page,
  }) => {
    await ready(page, '?mode=finite');
    await expect(page.locator('.csp-slider__controls')).toHaveCount(1);

    await page.evaluate(() => window.__slider.destroy());
    await expect(page.locator('.csp-slider__controls')).toHaveCount(0);

    const before = await state(page);
    await page.evaluate(() => window.__slider.next());
    await page.waitForTimeout(200);
    const after = await state(page);
    expect(after.index).toBe(before.index);
    expect(after.destroyed).toBe(true);
  });

  test('refresh() picks up slides added after init', async ({ page }) => {
    await ready(page, '?mode=finite&slides=3');
    expect((await state(page)).slideCount).toBe(3);

    await page.evaluate(() => {
      const track = document.querySelector('[data-slider-track]')!;
      const slide = document.createElement('div');
      slide.className = 'csp-slider__slide';
      slide.setAttribute('data-slider-slide', '');
      slide.textContent = 'Added slide';
      track.append(slide);
      window.__slider.refresh();
    });
    expect((await state(page)).slideCount).toBe(4);
  });

  test('two independent instances do not cross-talk', async ({ page }) => {
    await ready(page, '?mode=finite');
    const result = await page.evaluate(async () => {
      const { createSlider } = await import('/dist/index.js');
      const el = document.createElement('div');
      el.innerHTML =
        '<div data-slider-track>' +
        '<div class="csp-slider__slide" data-slider-slide>A</div>' +
        '<div class="csp-slider__slide" data-slider-slide>B</div>' +
        '<div class="csp-slider__slide" data-slider-slide>C</div>' +
        '</div>';
      document.body.append(el);
      const second = createSlider(el, { mode: 'finite', controls: false });
      second.goTo(2, { animate: false });

      window.__slider.goTo(0, { animate: false });

      return { first: window.__slider.getState().index, second: second.getState().index };
    });
    expect(result.second).toBe(2);
    expect(result.first).toBe(0);
  });
});
