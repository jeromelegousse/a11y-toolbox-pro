import { test, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BASELINE_PATH = resolve(__dirname, 'baselines/options-panel.png.base64');

const shouldUpdateBaseline = process.env.UPDATE_VISUAL_BASELINE === '1';

const BASELINE_SCREENSHOT = shouldUpdateBaseline
  ? null
  : (await readFile(BASELINE_PATH, 'utf8')).replace(/\s+/g, '');

const wrapBase64 = (payload) => {
  const chunks = payload.match(/.{1,76}/g);
  return (chunks ?? [payload]).join('\n');
};

const focusableSelectors = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
];

test.describe('Panneau Options & Profils', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('.a11ytb-fab').click();
    await page.getByRole('button', { name: 'Options & Profils' }).click();
    await expect(page.locator('.a11ytb-view--options')).toBeVisible();
  });

  test('le cycle de focus reste confiné au panneau', async ({ page }) => {
    const optionsToggle = page.getByRole('button', { name: 'Options & Profils' });
    await optionsToggle.focus();

    const cycleLength = await page.evaluate((selectors) => {
      const options = document.querySelector('.a11ytb-view--options');
      const toggle = document.querySelector('.a11ytb-chip--view[data-view="options"]');
      if (!options) return 0;
      const focusables = [
        toggle,
        ...Array.from(options.querySelectorAll(selectors.join(',')))
      ].filter((el) => el && el.offsetParent !== null && !el.hasAttribute('hidden'));
      return focusables.length;
    }, focusableSelectors);

    for (let i = 0; i < cycleLength + 2; i += 1) {
      await page.keyboard.press('Tab');
    }

    const currentFocus = await page.evaluate(() => {
      const active = document.activeElement;
      const options = document.querySelector('.a11ytb-view--options');
      return {
        datasetView: active?.dataset?.view ?? null,
        insideOptions: !!options?.contains(active)
      };
    });

    expect(currentFocus.datasetView === 'options' || currentFocus.insideOptions).toBeTruthy();

    await page.keyboard.press('Shift+Tab');

    const previousFocus = await page.evaluate(() => {
      const active = document.activeElement;
      const options = document.querySelector('.a11ytb-view--options');
      return {
        datasetView: active?.dataset?.view ?? null,
        insideOptions: !!options?.contains(active)
      };
    });

    expect(previousFocus.datasetView === 'options' || previousFocus.insideOptions).toBeTruthy();
  });

  test('capture visuelle du panneau', async ({ page }) => {
    const panel = page.locator('.a11ytb-panel');
    await expect(panel).toBeVisible();
    await page.evaluate(() => {
      const active = document.activeElement;
      if (active && 'blur' in active) {
        active.blur();
      }
    });
    await page.waitForTimeout(50);
    const screenshot = await panel.screenshot({
      animations: 'disabled',
      mask: [page.locator('.a11ytb-activity-list')],
      maskColor: '#000'
    });

    const actual = screenshot.toString('base64');

    if (shouldUpdateBaseline) {
      await writeFile(BASELINE_PATH, `${wrapBase64(actual)}\n`, 'utf8');
      test.info().annotations.push({
        type: 'baseline',
        description: 'options-panel baseline updated'
      });
    } else {
      expect(actual).toBe(BASELINE_SCREENSHOT);
    }
  });
});
