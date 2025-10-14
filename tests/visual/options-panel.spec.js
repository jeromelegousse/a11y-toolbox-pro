import { test, expect } from '@playwright/test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BASELINE_SVG_PATH = resolve(__dirname, 'baselines/options-panel.svg');

const shouldUpdateBaseline = process.env.UPDATE_VISUAL_BASELINE === '1';

const readBaselineData = () => {
  if (!existsSync(BASELINE_SVG_PATH)) {
    throw new Error(
      "La capture de référence est absente. Exécutez `UPDATE_VISUAL_BASELINE=1 npm run test:visual` pour la régénérer."
    );
  }
  try {
    const svg = readFileSync(BASELINE_SVG_PATH, 'utf8');
    const dataMatch = svg.match(
      /href=['"']data:image\/png;base64,([A-Za-z0-9+/=\s]+)['"']/
    );
    if (!dataMatch) {
      throw new Error();
    }
    const pngBuffer = Buffer.from(dataMatch[1].replace(/\s+/g, ''), 'base64');
    const { width, height } = getPngDimensions(pngBuffer);
    return {
      buffer: pngBuffer,
      width,
      height,
      sha256: computeScreenshotHash(pngBuffer)
    };
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

const renderBaselineSvg = ({ width, height, base64 }) => `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <title>Baseline visuelle Options &amp; Profils</title>
  <desc>Image PNG encodée en Base64 utilisée comme référence pour le test Playwright.</desc>
  <image width="${width}" height="${height}" href="data:image/png;base64,${base64}" />
</svg>
`;

const writeBaselineSvg = (pngBuffer) => {
  const { width, height } = getPngDimensions(pngBuffer);
  const metadata = {
    width,
    height,
    sha256: computeScreenshotHash(pngBuffer)
  };
  const base64 = pngBuffer.toString('base64');
  writeFileSync(
    BASELINE_SVG_PATH,
    renderBaselineSvg({ width, height, base64 }),
    'utf8'
  );
  return metadata;
};

const BASELINE_DATA = shouldUpdateBaseline ? null : readBaselineData();

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
      const metadata = writeBaselineSvg(screenshot);
      test.info().annotations.push({
        type: 'baseline',
        description: `options-panel baseline mise à jour (sha256: ${metadata.sha256})`
      });
    } else {
      const { width, height, sha256, buffer } = BASELINE_DATA;
      const { width: captureWidth, height: captureHeight } =
        getPngDimensions(screenshot);
      expect(captureWidth).toBe(width);
      expect(captureHeight).toBe(height);
      expect(computeScreenshotHash(screenshot)).toBe(sha256);
      expect(buffer.equals(screenshot)).toBe(true);
    }
  });
});
