const FOCUSABLE_SELECTORS = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function isElementVisible(el) {
  if (!el) return false;
  if (el.hasAttribute('hidden')) return false;
  if (el.getAttribute('aria-hidden') === 'true') return false;

  const style =
    typeof window !== 'undefined' && typeof window.getComputedStyle === 'function'
      ? window.getComputedStyle(el)
      : null;

  if (style && (style.visibility === 'hidden' || style.display === 'none')) {
    return false;
  }

  return (
    (typeof el.offsetWidth === 'number' && el.offsetWidth > 0) ||
    (typeof el.offsetHeight === 'number' && el.offsetHeight > 0) ||
    (typeof el.getClientRects === 'function' && el.getClientRects().length > 0)
  );
}

export function collectFocusable(container) {
  if (!container) return [];
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTORS)).filter((element) =>
    isElementVisible(element)
  );
}

export { FOCUSABLE_SELECTORS };
