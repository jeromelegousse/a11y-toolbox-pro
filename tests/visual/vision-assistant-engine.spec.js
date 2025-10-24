import { test, expect } from '@playwright/test';

const shouldRunMocks = process.env.A11YTB_PLAYWRIGHT_USE_MOCKS === '1';
const VISION_ENDPOINT = 'https://vision.a11ytb.test/api';

test.describe('Assistant visuel – sélection du moteur', () => {
  test.skip(!shouldRunMocks, 'Ces scénarios nécessitent les mocks REST/runner.');

  test.beforeEach(async ({ page }) => {
    await page.route(VISION_ENDPOINT, async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, text: 'Réponse simulée', engine: 'llava-local' }),
        });
        return;
      }
      await route.fallback();
    });

    await page.addInitScript((config) => {
      window.a11ytbPluginConfig = config;
    }, {
      integrations: {
        visionAssistant: {
          endpoint: VISION_ENDPOINT,
          nonce: 'mock-nonce',
          engines: ['llava-local', 'llava'],
          defaultEngine: 'llava-local',
        },
      },
    });

    await page.goto('/');

    const panelToggle = page.locator('.a11ytb-fab:not(.a11ytb-fab--status)');
    await expect(panelToggle).toBeVisible();
    await panelToggle.click();

    const modulesTab = page.getByRole('tab', { name: 'Modules' });
    await expect(modulesTab).toBeVisible();
    await modulesTab.click();
  });

  test('bascule entre llava-local et llava', async ({ page }) => {
    const visionModule = page.locator('article[data-block-id="vision-assistant-controls"]');
    await expect(visionModule).toBeVisible();

    const engineSelect = visionModule.locator('select[data-ref="engine-select"]');
    await expect(engineSelect).toBeVisible();
    await expect(engineSelect).not.toBeDisabled();

    await expect(engineSelect.locator('option[value="llava-local"]')).toHaveText('LLaVA local');
    await expect(engineSelect.locator('option[value="llava"]')).toHaveText('LLaVA distant');

    await expect(engineSelect).toHaveValue('llava-local');
    await expect.poll(() =>
      page.evaluate(() => window.a11ytb?.state?.get('visionAssistant.engine'))
    ).toBe('llava-local');

    await engineSelect.selectOption('llava');
    await expect(engineSelect).toHaveValue('llava');
    await expect.poll(() =>
      page.evaluate(() => window.a11ytb?.state?.get('visionAssistant.engine'))
    ).toBe('llava');

    await engineSelect.selectOption('llava-local');
    await expect(engineSelect).toHaveValue('llava-local');
    await expect.poll(() =>
      page.evaluate(() => window.a11ytb?.state?.get('visionAssistant.engine'))
    ).toBe('llava-local');
  });
});
