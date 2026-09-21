import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    __cspViolations: Array<{ violatedDirective: string; blockedURI: string }>;
    __forbiddenMutations: string[];
    __slider: import('../../src/index.js').Slider;
    __sliderReady: boolean;
    __handlerRan?: boolean;
  }
}

async function assertNoForbiddenMarkup(page: import('@playwright/test').Page) {
  const audit = await page.evaluate(() => {
    const offenders: string[] = [];
    document.querySelectorAll('*').forEach((el) => {
      if (el.hasAttribute('style')) offenders.push(`style attr on <${el.tagName}>`);
      for (const attr of el.getAttributeNames()) {
        if (attr.startsWith('on')) offenders.push(`${attr} on <${el.tagName}>`);
      }
    });
    if (document.querySelector('style')) offenders.push('<style> element present');
    return offenders;
  });
  expect(audit).toEqual([]);
}

for (const base of ['', '/fallback']) {
  test.describe(`strict fixture CSP compliance (${base || 'primary policy'})`, () => {
    test('zero CSP violations across init + full interaction flow', async ({ page }) => {
      const responseHeaders: Record<string, string> = {};
      page.on('response', (res) => {
        if (res.url().endsWith('/strict.html') || (base && res.url().endsWith(`${base}/`))) {
          Object.assign(responseHeaders, res.headers());
        }
      });

      await page.goto(`${base}/strict.html`);
      await page.waitForFunction(() => window.__sliderReady === true);

      // Sanity: the enforcing header was actually present on the document response.
      expect(responseHeaders['content-security-policy']).toContain("script-src 'self'");

      // Full interaction flow.
      await page.evaluate(() => window.__slider.next());
      await page.waitForTimeout(150);
      await page.evaluate(() => window.__slider.prev());
      await page.waitForTimeout(150);
      await page.evaluate(() => window.__slider.goTo(3, { animate: true }));
      await page.waitForTimeout(500);
      await page.evaluate(() => window.__slider.update({ mode: 'rewind' }));
      await page.evaluate(() => window.__slider.refresh());

      const track = page.locator('[data-slider-track]');
      const box = await track.boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 4, box.y + box.height / 2, { steps: 5 });
        await page.mouse.up();
      }
      await page.waitForTimeout(200);

      await page.keyboard.press('Tab');
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(200);

      await page.evaluate(() => window.__slider.play());
      await page.waitForTimeout(100);
      await page.evaluate(() => window.__slider.pause());

      await page.evaluate(() => window.__slider.destroy());

      const violations = await page.evaluate(() => window.__cspViolations);
      expect(violations).toEqual([]);

      const mutations = await page.evaluate(() => window.__forbiddenMutations);
      expect(mutations).toEqual([]);
    });

    test('no generated style attributes, inline handlers, or injected <style>/<script> at any point', async ({
      page,
    }) => {
      await page.goto(`${base}/strict.html`);
      await page.waitForFunction(() => window.__sliderReady === true);
      await assertNoForbiddenMarkup(page);

      await page.evaluate(() => window.__slider.next({ animate: true }));
      await page.waitForTimeout(500);
      await assertNoForbiddenMarkup(page);

      const track = page.locator('[data-slider-track]');
      const box = await track.boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 4, box.y + box.height / 2, { steps: 5 });
        await page.mouse.up();
      }
      await page.waitForTimeout(300);
      await assertNoForbiddenMarkup(page);

      await page.evaluate(() => window.__slider.destroy());
      await assertNoForbiddenMarkup(page);
    });
  });
}

test.describe('negative control (proves the policy is actually enforcing)', () => {
  test('inline style attribute is blocked and reported', async ({ page }) => {
    await page.goto('/negative-control.html');
    const color = await page.locator('#bad-style').evaluate((el) => getComputedStyle(el).color);
    expect(color).not.toBe('rgb(255, 0, 0)');

    // Violation dispatch can trail parse/style-recalc by a task; poll rather
    // than assume it has already landed by the time we check.
    await page.waitForFunction(() =>
      window.__cspViolations.some((v) => v.violatedDirective.startsWith('style-src')),
    );
  });

  test('inline event handler attribute is blocked and reported', async ({ page }) => {
    await page.goto('/negative-control.html');
    await page.locator('#bad-handler').click();
    const ran = await page.evaluate(() => window.__handlerRan);
    expect(ran).toBeUndefined();

    // Violation dispatch for a blocked handler attribute can trail the click
    // by a task; poll rather than assume it has already landed.
    await page.waitForFunction(() =>
      window.__cspViolations.some((v) => v.violatedDirective.startsWith('script-src')),
    );
  });
});
