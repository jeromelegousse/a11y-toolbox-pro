import { test, expect } from '@playwright/test';

const shouldSkipVisualTests =
  process.env.PLAYWRIGHT_SKIP_VISUAL_TESTS === '1' ||
  process.env.PLAYWRIGHT_SKIP_VISUAL_TESTS === 'true' ||
  process.env.PLAYWRIGHT_FORCE_VISUAL !== '1';

test.describe('Activité — connecteurs et synchronisations', () => {
  test.skip(
    shouldSkipVisualTests,
    'Playwright browser dependencies are not available in this environment.'
  );

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.a11ytb-fab')).toBeVisible();
    await page.locator('.a11ytb-fab').click();
    await expect(page.locator('.a11ytb-panel')).toHaveAttribute('data-open', 'true');
    await page.locator('.a11ytb-activity > summary').click();
  });

  test('affiche un état vide accessible pour les connecteurs', async ({ page }) => {
    const connectors = page.locator('.a11ytb-activity-connector');
    await expect(connectors.first()).toBeVisible();
    await expect(connectors.first()).toContainText('Aucun connecteur configuré');

    const sendButton = page.locator('[data-action="activity-send-sync"]');
    await expect(sendButton).toBeDisabled();
    await expect(sendButton).toHaveAttribute(
      'title',
      /Ajoutez un connecteur dans l’admin/
    );

    const connectorsList = page.locator('[data-ref="activity-connectors"]');
    await expect(connectorsList).toHaveAttribute('role', 'list');
    await expect(connectorsList).toHaveAttribute('aria-describedby', 'a11ytb-activity-syncs-help');
  });
});
