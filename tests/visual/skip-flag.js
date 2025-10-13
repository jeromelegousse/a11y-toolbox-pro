export const shouldSkipVisualTests = () => {
  const raw = process.env.PLAYWRIGHT_SKIP_VISUAL_TESTS;
  if (typeof raw !== 'string') {
    return false;
  }

  if (raw === '1') {
    return true;
  }

  return raw.toLowerCase() === 'true';
};
