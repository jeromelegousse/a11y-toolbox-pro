import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const omitConfig = (process.env.npm_config_omit || '')
  .split(/[\s,]+/)
  .map((value) => value.trim())
  .filter(Boolean);

const isProductionInstall = process.env.npm_config_production === 'true'
  || process.env.NODE_ENV === 'production'
  || omitConfig.includes('dev');

if (isProductionInstall) {
  console.log('Skipping Playwright browser installation during production install.');
  process.exit(0);
}

try {
  require.resolve('@playwright/test/package.json');
} catch {
  console.log('Skipping Playwright browser installation because @playwright/test is not installed.');
  process.exit(0);
}

const playwrightBinary = process.platform === 'win32' ? 'playwright.cmd' : 'playwright';
const playwrightCliPath = path.resolve('node_modules', '.bin', playwrightBinary);

if (!existsSync(playwrightCliPath)) {
  console.log('Skipping Playwright browser installation because the Playwright CLI is unavailable.');
  process.exit(0);
}

const installResult = spawnSync(playwrightCliPath, ['install'], {
  stdio: 'inherit',
});

if (installResult.error) {
  console.error('Failed to install Playwright browsers:', installResult.error.message);
  process.exit(1);
}

process.exit(installResult.status ?? 0);
