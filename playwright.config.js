import { defineConfig, devices } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4173';

export default defineConfig({
  testDir: './tests/visual',
  timeout: 60_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { outputFolder: 'tests/visual/report', open: 'never' }]],
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.02,
      threshold: 0.2
    }
  },
  use: {
    baseURL,
    trace: 'on-first-retry',
    viewport: { width: 1280, height: 720 },
    headless: true,
    ...devices['Desktop Chrome']
  },
  webServer: {
    command: 'npx http-server . -p 4173 --silent',
    url: `${baseURL}/index.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000
  }
});
