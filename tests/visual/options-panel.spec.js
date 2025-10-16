import { test, expect } from '@playwright/test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BASELINE_PATH = resolve(__dirname, 'baselines/options-panel.svg');

const shouldUpdateBaseline = process.env.UPDATE_VISUAL_BASELINE === '1';
const FIXED_SCHEDULE_TIMESTAMP = Date.UTC(2024, 0, 8, 9, 0);

const extractBaselinePayload = (svg) => {
  const match = svg.match(/href="data:image\/png;base64,([^"\s]+)"/);
  if (!match) {
    throw new Error(
      `Impossible d'extraire la donnée PNG du fichier de référence : ${BASELINE_PATH}`
    );
  }
  return match[1];
};

const BASELINE_SCREENSHOT =
  shouldUpdateBaseline || !existsSync(BASELINE_PATH)
    ? null
    : extractBaselinePayload(readFileSync(BASELINE_PATH, 'utf8'));

const BASELINE_DATA = shouldUpdateBaseline ? null : loadBaselineData();

const focusableSelectors = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
];

test.describe('Panneau Options & Profils', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((fixedTs) => {
      const NativeDate = Date;
      class FrozenDate extends NativeDate {
        constructor(...args) {
          if (args.length === 0) {
            return new NativeDate(fixedTs);
          }
          return new NativeDate(...args);
        }

        static now() {
          return fixedTs;
        }

        static UTC(...args) {
          return NativeDate.UTC(...args);
        }

        static parse(input) {
          return NativeDate.parse(input);
        }
      }

      FrozenDate.prototype = NativeDate.prototype;
      Object.defineProperty(window, 'Date', { value: FrozenDate });
    }, FIXED_SCHEDULE_TIMESTAMP);

    await page.goto('/');
    const fab = page.getByRole('button', {
      name: 'Open the accessibility toolbox',
    });
    await expect(fab).toBeVisible();
    await fab.click();
    await expect(page.locator('.a11ytb-panel')).toHaveAttribute('data-open', 'true');

    const optionsButton = page.getByRole('tab', { name: 'Options & Profils' });
    await expect(optionsButton).toBeVisible();
    await optionsButton.click();
    await expect(page.locator('.a11ytb-view--options')).toBeVisible();
  });

  test('le cycle de focus reste confiné au panneau', async ({ page }) => {
    const optionsToggle = page.getByRole('tab', { name: 'Options & Profils' });
    await optionsToggle.focus();

    const cycleLength = await page.evaluate((selectors) => {
      const options = document.querySelector('.a11ytb-view--options');
      const toggle = document.querySelector('.a11ytb-chip--view[data-view="options"]');
      if (!options) return 0;
      const focusables = [
        toggle,
        ...Array.from(options.querySelectorAll(selectors.join(','))),
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
        insideOptions: !!options?.contains(active),
      };
    });

    expect(currentFocus.datasetView === 'options' || currentFocus.insideOptions).toBeTruthy();

    await page.keyboard.press('Shift+Tab');

    const previousFocus = await page.evaluate(() => {
      const active = document.activeElement;
      const options = document.querySelector('.a11ytb-view--options');
      return {
        datasetView: active?.dataset?.view ?? null,
        insideOptions: !!options?.contains(active),
      };
    });

    expect(previousFocus.datasetView === 'options' || previousFocus.insideOptions).toBeTruthy();
  });

  test('capture visuelle du panneau', async ({ page }) => {
    await page.evaluate(() => {
      const state = window.a11ytb?.state;
      if (!state?.set) return;

      state.set('audit.preferences.schedule.enabled', true);
      state.set('audit.preferences.schedule.frequency', 'weekly');
      state.set('audit.preferences.schedule.timeWindow.start', '09:00');
      state.set('audit.preferences.schedule.timeWindow.end', '18:00');
      state.set('audit.preferences.schedule.lastRunAt', Date.UTC(2024, 0, 8, 9, 0));
      state.set('audit.preferences.schedule.nextRunAt', Date.UTC(2024, 0, 15, 9, 0));
    });

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
      maskColor: '#000',
    });

    const actual = screenshot.toString('base64');
    const pngWidth = screenshot.readUInt32BE(16);
    const pngHeight = screenshot.readUInt32BE(20);

    if (shouldUpdateBaseline) {
      const svgPayload = [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${pngWidth}" height="${pngHeight}" viewBox="0 0 ${pngWidth} ${pngHeight}">`,
        `  <image width="${pngWidth}" height="${pngHeight}" href="data:image/png;base64,${actual}" />`,
        '</svg>',
        '',
      ].join('\n');
      writeFileSync(BASELINE_PATH, svgPayload, 'utf8');
      test.info().annotations.push({
        type: 'baseline',
        description: 'options-panel baseline updated (SVG)',
      });
    } else {
      const { width, height, sha256, buffer } = BASELINE_DATA ?? loadBaselineData();
      const { width: captureWidth, height: captureHeight } = getPngDimensions(screenshot);
      expect(captureWidth).toBe(width);
      expect(captureHeight).toBe(height);
      expect(computeScreenshotHash(screenshot)).toBe(sha256);
      expect(buffer.equals(screenshot)).toBe(true);
    }
  });
});

function loadBaselineData() {
  if (!existsSync(BASELINE_PATH)) {
    throw new Error(
      `Aucun fichier de référence trouvé pour les tests visuels. Lancez le test avec UPDATE_VISUAL_BASELINE=1 pour en générer un : ${BASELINE_PATH}`
    );
  }

  if (!BASELINE_SCREENSHOT) {
    throw new Error(`Le fichier de référence est vide ou corrompu : ${BASELINE_PATH}`);
  }

  const buffer = Buffer.from(BASELINE_SCREENSHOT, 'base64');
  const { width, height } = getPngDimensions(buffer);

  return {
    width,
    height,
    sha256: computeScreenshotHash(buffer),
    buffer,
  };
}

function getPngDimensions(buffer) {
  if (buffer.length < 24) {
    throw new Error('Donnée PNG invalide : en-tête trop court.');
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function computeScreenshotHash(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}
