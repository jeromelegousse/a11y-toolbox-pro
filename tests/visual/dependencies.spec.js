import { test, expect } from '@playwright/test';
import { shouldSkipVisualTests, visualSkipReason } from './skip-visual-tests.js';

test.describe('Organisation — dépendances', () => {
  test.skip(shouldSkipVisualTests, visualSkipReason);

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('.a11ytb-fab').click();
    await page.getByRole('button', { name: 'Organisation' }).click();
    await expect(page.locator('.a11ytb-view--organize')).toBeVisible();
  });

  test('affiche les badges de statut des dépendances', async ({ page }) => {
    await page.evaluate(() => {
      const state = window.a11ytb?.state;
      if (!state) return;
      const runtime = state.get('runtime.modules.tts') || {};
      state.set('runtime.modules.tts', {
        ...runtime,
        manifestVersion: runtime.manifestVersion || '0.1.0',
        manifestName: runtime.manifestName || 'Synthèse vocale',
        dependencies: [
          {
            id: 'voice-engine',
            label: 'Moteur vocal',
            status: 'missing',
            statusLabel: 'Manquant',
            message: 'Module requis introuvable.',
            aria: 'Dépendance Moteur vocal manquante pour Synthèse vocale.'
          },
          {
            id: 'audio-core',
            label: 'Audio Core',
            status: 'ok',
            statusLabel: 'OK',
            message: 'Module disponible.',
            aria: 'Dépendance Audio Core disponible pour Synthèse vocale.'
          }
        ]
      });
    });

    const dependencySection = page.locator('.a11ytb-admin-dependencies').first();
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
