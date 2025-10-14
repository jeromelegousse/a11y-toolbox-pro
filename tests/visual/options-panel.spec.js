import { test, expect } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BASELINE_JSON_PATH = resolve(__dirname, 'baselines/options-panel.json');
const BASELINE_PREVIEW_DIR = resolve(__dirname, 'baselines/.artifacts');
const BASELINE_PREVIEW_PATH = resolve(BASELINE_PREVIEW_DIR, 'options-panel.png');

const shouldUpdateBaseline = process.env.UPDATE_VISUAL_BASELINE === '1';

const readBaselineMetadata = () => {
  if (!existsSync(BASELINE_JSON_PATH)) {
    throw new Error(
      "La capture de référence est absente. Exécutez `UPDATE_VISUAL_BASELINE=1 npm run test:visual` pour la régénérer."
    );
  }
  try {
    const metadata = JSON.parse(readFileSync(BASELINE_JSON_PATH, 'utf8'));
    const { width, height, sha256 } = metadata ?? {};
    if (
      typeof width !== 'number' ||
      typeof height !== 'number' ||
      typeof sha256 !== 'string'
    ) {
      throw new Error();
    }
    return metadata;
  } catch (error) {
    throw new Error(
      'Le fichier de référence est illisible. Régénérez la baseline avec `UPDATE_VISUAL_BASELINE=1 npm run test:visual`.'
    );
  }
};

const getPngDimensions = (pngBuffer) => ({
  width: pngBuffer.readUInt32BE(16),
  height: pngBuffer.readUInt32BE(20)
});

const computeScreenshotHash = (pngBuffer) =>
  createHash('sha256').update(pngBuffer).digest('hex');

const writeBaselineMetadata = (pngBuffer) => {
  const { width, height } = getPngDimensions(pngBuffer);
  const metadata = {
    width,
    height,
    sha256: computeScreenshotHash(pngBuffer)
  };
  writeFileSync(
    BASELINE_JSON_PATH,
    `${JSON.stringify(metadata, null, 2)}\n`,
    'utf8'
  );
  mkdirSync(BASELINE_PREVIEW_DIR, { recursive: true });
  writeFileSync(BASELINE_PREVIEW_PATH, pngBuffer);
  return metadata;
};

const BASELINE_METADATA = shouldUpdateBaseline ? null : readBaselineMetadata();

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

    if (shouldUpdateBaseline) {
      const metadata = writeBaselineMetadata(screenshot);
      test.info().annotations.push({
        type: 'baseline',
        description: `options-panel baseline mise à jour (sha256: ${metadata.sha256})`
      });
    } else {
      const { width, height, sha256 } = BASELINE_METADATA;
      const { width: captureWidth, height: captureHeight } =
        getPngDimensions(screenshot);
      expect(captureWidth).toBe(width);
      expect(captureHeight).toBe(height);
      expect(computeScreenshotHash(screenshot)).toBe(sha256);
    }
  });
});
