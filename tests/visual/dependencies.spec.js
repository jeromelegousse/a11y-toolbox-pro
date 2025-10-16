import { test, expect } from '@playwright/test';

const shouldSkipVisualTests =
  process.env.PLAYWRIGHT_SKIP_VISUAL_TESTS === '1' ||
  process.env.PLAYWRIGHT_SKIP_VISUAL_TESTS === 'true';

test.describe('Organisation — dépendances', () => {
  test.skip(
    shouldSkipVisualTests,
    'Playwright browser dependencies are not available in this environment.'
  );

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const fab = page.getByRole('button', {
      name: 'Open the accessibility toolbox',
    });
    await expect(fab).toBeVisible();
    await fab.click();
    await expect(page.locator('.a11ytb-panel')).toHaveAttribute('data-open', 'true');

    const organizeButton = page.getByRole('tab', { name: 'Organisation' });
    await expect(organizeButton).toBeVisible();
    await organizeButton.click();
    await expect(page.locator('.a11ytb-view--organize')).toBeVisible();
  });

  test('affiche les badges de statut des dépendances', async ({ page }) => {
    await page.evaluate(() => {
      const state = window.a11ytb?.state;
      if (!state) return;
      const manifestVersion = state.get('runtime.modules.tts.manifestVersion');
      const manifestName = state.get('runtime.modules.tts.manifestName');
      if (!manifestVersion) {
        state.set('runtime.modules.tts.manifestVersion', '0.1.0');
      }
      if (!manifestName) {
        state.set('runtime.modules.tts.manifestName', 'Synthèse vocale');
      }
      state.set('runtime.modules.tts.dependencies', [
        {
          id: 'voice-engine',
          label: 'Moteur vocal',
          status: 'missing',
          statusLabel: 'Manquant',
          message: 'Module requis introuvable.',
          aria: 'Dépendance Moteur vocal manquante pour Synthèse vocale.',
        },
        {
          id: 'audio-core',
          label: 'Audio Core',
          status: 'ok',
          statusLabel: 'OK',
          message: 'Module disponible.',
          aria: 'Dépendance Audio Core disponible pour Synthèse vocale.',
        },
      ]);
    });
    await page.waitForTimeout(50);

    const dependencySection = page.locator(
      '.a11ytb-admin-item[data-module-id="tts"] .a11ytb-admin-dependencies'
    );
    await expect(dependencySection).toBeVisible();
    await expect(
      dependencySection.locator('.a11ytb-admin-dependency-badge', { hasText: 'Manquant' })
    ).toBeVisible();
    await expect(
      dependencySection.locator('.a11ytb-admin-dependency-badge', { hasText: 'OK' })
    ).toBeVisible();
    await expect(
      dependencySection.locator('.a11ytb-admin-dependency-message').first()
    ).toContainText('introuvable');
  });
});
