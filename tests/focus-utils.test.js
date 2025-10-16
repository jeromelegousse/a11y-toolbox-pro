import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { collectFocusable, isElementVisible } from '../src/utils/focus.js';

function setVisibilityMetrics(element, { offsetWidth = 0, offsetHeight = 0, rectCount = 0 } = {}) {
  Object.defineProperty(element, 'offsetWidth', { configurable: true, value: offsetWidth });
  Object.defineProperty(element, 'offsetHeight', { configurable: true, value: offsetHeight });
  const count = rectCount;
  element.getClientRects = () =>
    count > 0 ? Array.from({ length: count }, () => ({ width: 1, height: 1 })) : [];
}

function overrideComputedStyle(element, overrides = {}) {
  Object.defineProperty(element, '__computedStyleOverride', {
    value: overrides,
    configurable: true,
    writable: true,
  });
}

beforeEach(() => {
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => {
    const overrides = element?.__computedStyleOverride || {};
    return {
      display: overrides.display ?? 'block',
      visibility: overrides.visibility ?? 'visible',
    };
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('isElementVisible', () => {
  it('returns true for elements with visible geometry', () => {
    const button = document.createElement('button');
    setVisibilityMetrics(button, { offsetWidth: 24, offsetHeight: 12, rectCount: 1 });

    expect(isElementVisible(button)).toBe(true);
  });

  it('falls back to client rects when offsets are zero', () => {
    const anchor = document.createElement('a');
    anchor.href = '#';
    setVisibilityMetrics(anchor, { offsetWidth: 0, offsetHeight: 0, rectCount: 1 });

    expect(isElementVisible(anchor)).toBe(true);
  });

  it('returns false for elements hidden via attributes or styles', () => {
    const hiddenButton = document.createElement('button');
    setVisibilityMetrics(hiddenButton, { offsetWidth: 10, offsetHeight: 10, rectCount: 1 });
    hiddenButton.setAttribute('hidden', '');

    const ariaHiddenButton = document.createElement('button');
    setVisibilityMetrics(ariaHiddenButton, { offsetWidth: 10, offsetHeight: 10, rectCount: 1 });
    ariaHiddenButton.setAttribute('aria-hidden', 'true');

    const visuallyHiddenButton = document.createElement('button');
    setVisibilityMetrics(visuallyHiddenButton, { offsetWidth: 10, offsetHeight: 10, rectCount: 1 });
    overrideComputedStyle(visuallyHiddenButton, { visibility: 'hidden' });

    expect(isElementVisible(hiddenButton)).toBe(false);
    expect(isElementVisible(ariaHiddenButton)).toBe(false);
    expect(isElementVisible(visuallyHiddenButton)).toBe(false);
  });
});

describe('collectFocusable', () => {
  it('returns only visible, focusable descendants', () => {
    const container = document.createElement('div');
    document.body.append(container);

    const fixedButton = document.createElement('button');
    fixedButton.textContent = 'Fermer';
    setVisibilityMetrics(fixedButton, { offsetWidth: 18, offsetHeight: 12, rectCount: 1 });
    overrideComputedStyle(fixedButton, { display: 'block', visibility: 'visible' });
    fixedButton.style.position = 'fixed';

    const hiddenButton = document.createElement('button');
    hiddenButton.textContent = 'Caché';
    setVisibilityMetrics(hiddenButton, { offsetWidth: 18, offsetHeight: 12, rectCount: 1 });
    hiddenButton.setAttribute('hidden', '');

    const ariaHiddenButton = document.createElement('button');
    ariaHiddenButton.textContent = 'ARIA';
    setVisibilityMetrics(ariaHiddenButton, { offsetWidth: 18, offsetHeight: 12, rectCount: 1 });
    ariaHiddenButton.setAttribute('aria-hidden', 'true');

    const disabledButton = document.createElement('button');
    disabledButton.textContent = 'Disabled';
    setVisibilityMetrics(disabledButton, { offsetWidth: 18, offsetHeight: 12, rectCount: 1 });
    disabledButton.disabled = true;

    const anchor = document.createElement('a');
    anchor.href = '#';
    anchor.textContent = 'Lien';
    setVisibilityMetrics(anchor, { offsetWidth: 14, offsetHeight: 10, rectCount: 1 });

    container.append(fixedButton, hiddenButton, ariaHiddenButton, disabledButton, anchor);

    const focusables = collectFocusable(container);

    expect(focusables).toEqual([fixedButton, anchor]);
  });
});
