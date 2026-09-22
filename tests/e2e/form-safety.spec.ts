import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    __slider: import('../../src/index.js').Slider;
    __sliderReady: boolean;
    __forbiddenMutations: string[];
  }
}

/**
 * Regression coverage for issue #1: `inert` removes a loop clone from the
 * accessibility tree and focus order, but it has no bearing on HTML form
 * submission — an `inert`, named clone control is still a "successful
 * control". With 2 real slides, `mode: 'loop'` builds one head clone and one
 * tail clone of each, so an unfixed clone would triple every named value in
 * `FormData` (tail clone, real, head clone). These tests assert on the
 * actual `FormData` contents, not just DOM structure, since that's the
 * concrete failure mode described in the fix request.
 */

async function ready(page: import('@playwright/test').Page) {
  await page.goto('/form.html');
  await page.waitForFunction(() => window.__sliderReady === true);
}

test.describe('loop clones cannot duplicate form submissions', () => {
  test('FormData contains each real control exactly once, matching pre-loop values', async ({
    page,
  }) => {
    await ready(page);

    const clonesBuilt = await page.locator('[data-slider-clone]').count();
    expect(clonesBuilt).toBe(4); // 2 real slides * (1 head clone + 1 tail clone)

    const data = await page.evaluate(() => {
      const form = document.getElementById('mainform') as HTMLFormElement;
      const fd = new FormData(form);
      return {
        qty: fd.getAll('qty'),
        agree: fd.getAll('agree'),
        color: fd.getAll('color'),
        notes: fd.getAll('notes'),
        plan: fd.getAll('plan'),
      };
    });

    expect(data.qty).toEqual(['1', '2']);
    expect(data.agree).toEqual(['yes']);
    expect(data.color).toEqual(['blue']);
    expect(data.notes).toEqual(['hello']);
    expect(data.plan).toEqual(['pro']);
  });

  test('no submitted value originates from a head or tail clone', async ({ page }) => {
    await ready(page);

    const cloneNamedCount = await page.evaluate(
      () => document.querySelectorAll('[data-slider-clone] [name]').length,
    );
    expect(cloneNamedCount).toBe(0);

    const cloneRootsWithName = await page.evaluate(
      () => document.querySelectorAll('[data-slider-clone][name]').length,
    );
    expect(cloneRootsWithName).toBe(0);
  });

  test('every native form control inside a clone is disabled', async ({ page }) => {
    await ready(page);

    const allDisabled = await page.evaluate(() => {
      const controls = Array.from(
        document.querySelectorAll(
          '[data-slider-clone] input, [data-slider-clone] select, [data-slider-clone] textarea, [data-slider-clone] button',
        ),
      ) as (HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement)[];
      return controls.length > 0 && controls.every((el) => el.disabled === true);
    });
    expect(allDisabled).toBe(true);
  });

  test('real controls preserve their original name, value, checked, and disabled state', async ({
    page,
  }) => {
    await ready(page);

    const real = await page.evaluate(() => ({
      qty1: (document.getElementById('qty-1') as HTMLInputElement).value,
      qty1Name: (document.getElementById('qty-1') as HTMLInputElement).name,
      qty1Disabled: (document.getElementById('qty-1') as HTMLInputElement).disabled,
      agreeChecked: (document.getElementById('agree-1') as HTMLInputElement).checked,
      qty2: (document.getElementById('qty-2') as HTMLInputElement).value,
      colorValue: (document.getElementById('color-2') as HTMLSelectElement).value,
      notesValue: (document.getElementById('notes-2') as HTMLTextAreaElement).value,
      planChecked: (document.getElementById('plan-2') as HTMLInputElement).checked,
    }));

    expect(real).toEqual({
      qty1: '1',
      qty1Name: 'qty',
      qty1Disabled: false,
      agreeChecked: true,
      qty2: '2',
      colorValue: 'blue',
      notesValue: 'hello',
      planChecked: true,
    });
  });

  test('clone controls cannot receive focus', async ({ page }) => {
    await ready(page);

    const result = await page.evaluate(() => {
      const clone = document.querySelector(
        '[data-slider-clone] input, [data-slider-clone] [tabindex]',
      ) as HTMLElement | null;
      if (!clone) return 'no-clone-candidate';
      clone.focus();
      return document.activeElement === clone ? 'focused' : 'not-focused';
    });
    expect(result).toBe('not-focused');
  });

  test('the fixture stays CSP-clean across init and a full loop wrap', async ({ page }) => {
    await ready(page);
    await page.evaluate(() => window.__slider.goTo(1, { animate: false }));
    await page.waitForTimeout(200);
    await page.evaluate(() => window.__slider.next());
    await page.waitForTimeout(600);

    const audit = await page.evaluate(() => {
      const offenders: string[] = [];
      document.querySelectorAll('*').forEach((el) => {
        if (el.hasAttribute('style')) offenders.push('style attribute present');
        for (const attr of el.getAttributeNames()) {
          if (attr.startsWith('on')) offenders.push(`${attr} handler attribute present`);
        }
      });
      if (document.querySelector('style')) offenders.push('<style> element present');
      return offenders;
    });
    expect(audit).toEqual([]);
    expect(await page.evaluate(() => window.__forbiddenMutations)).toEqual([]);
  });
});
