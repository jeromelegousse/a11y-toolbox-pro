const rawValue = process.env.PLAYWRIGHT_SKIP_VISUAL_TESTS ?? '';

const normalized = typeof rawValue === 'string' ? rawValue.trim().toLowerCase() : '';

export const shouldSkipVisualTests = normalized === '1' || normalized === 'true';

export const visualSkipReason =
  'Playwright browser dependencies are not available in this environment.';
