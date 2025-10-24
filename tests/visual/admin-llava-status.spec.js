import { test, expect } from '@playwright/test';

const shouldRunMocks = process.env.A11YTB_PLAYWRIGHT_USE_MOCKS === '1';
const ADMIN_TEMPLATE = `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <title>Admin A11y Toolbox – Démo</title>
    <link rel="stylesheet" href="/assets/admin.css" />
  </head>
  <body>
    <div
      id="a11ytb-admin-app"
      class="a11ytb-admin-app-mount"
      aria-live="polite"
      aria-busy="true"
    ></div>
    <script>
      window.a11ytbAdminData = window.__A11YTB_ADMIN_DATA__ || {};
    </script>
    <script type="module" src="/src/admin/admin-app.js"></script>
  </body>
</html>`;

test.describe('Admin – statut LLaVA', () => {
  test.skip(!shouldRunMocks, 'Ces scénarios nécessitent les mocks REST/runner.');

  test('affiche un état prêt quand LLaVA est configuré', async ({ page }) => {
    await page.addInitScript((data) => {
      window.__A11YTB_ADMIN_DATA__ = data;
    }, {
      llava: {
        endpoint: 'https://llava.admin.test/proxy',
        hasEndpoint: true,
        hasToken: true,
        maskedToken: '••••TOKEN',
        tokenError: false,
        isReady: true,
      },
    });

    await page.setContent(ADMIN_TEMPLATE, { waitUntil: 'domcontentloaded' });

    const status = page.locator('.a11ytb-admin-llava');
    await expect(status).toBeVisible();
    await expect(status).toHaveText(
      /LLaVA prêt \(endpoint https:\/\/llava\.admin\.test\/proxy • ••••TOKEN\)\./
    );
  });

  test('signale les erreurs de secret illisible', async ({ page }) => {
    await page.addInitScript((data) => {
      window.__A11YTB_ADMIN_DATA__ = data;
    }, {
      llava: {
        endpoint: '',
        hasEndpoint: false,
        hasToken: false,
        tokenError: true,
        maskedToken: undefined,
        isReady: false,
      },
    });

    await page.setContent(ADMIN_TEMPLATE, { waitUntil: 'domcontentloaded' });

    const status = page.locator('.a11ytb-admin-llava');
    await expect(status).toBeVisible();
    await expect(status).toContainText(
      'LLaVA non configuré. Renseignez un endpoint et un secret chiffré dans les réglages.'
    );
    await expect(status).toContainText(
      'Le secret stocké est illisible : regénérez-le puis réenregistrez le formulaire.'
    );
  });
});
