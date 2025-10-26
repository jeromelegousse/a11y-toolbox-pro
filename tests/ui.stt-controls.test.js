import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderBlock } from '../src/registry.js';
import { createSttControlsBlock } from '../src/blocks/stt-controls.js';

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createState(initial = {}) {
  let snapshot = deepClone(initial);
  const listeners = new Set();
  return {
    get(path) {
      if (!path) return deepClone(snapshot);
      return path.split('.').reduce((acc, key) => acc?.[key], snapshot);
    },
    emit(next) {
      snapshot = deepClone(next);
      listeners.forEach((listener) => listener(deepClone(snapshot)));
    },
    on(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

describe('stt-controls block', () => {
  let host;
  let state;

  beforeEach(() => {
    host = document.createElement('div');
  });

  afterEach(() => {
    host.innerHTML = '';
  });

  it('renders escaped source labels and updates text content safely', () => {
    state = createState({
      stt: {
        inputSource: 'Micro "Ultra" & Co',
        status: 'idle',
        transcript: '',
      },
    });

    const block = createSttControlsBlock({ icon: '<svg></svg>' });
    const article = renderBlock(block, state, host);
    const sourceButton = article.querySelector('[data-ref="source-button"]');
    const sourceLabel = article.querySelector('[data-ref="source-label"]');
    const badge = article.querySelector('[data-ref="badge"]');

    expect(sourceButton).toBeTruthy();
    expect(sourceLabel).toBeTruthy();

    expect(sourceButton.getAttribute('aria-label')).toBe('Source audio : Micro "Ultra" & Co');
    expect(sourceButton.getAttribute('title')).toBe('Source audio : Micro "Ultra" & Co');
    expect(sourceLabel.textContent).toBe('Micro "Ultra" & Co');
    expect(sourceLabel.innerHTML).toBe('Micro "Ultra" &amp; Co');
    expect(badge.hasAttribute('hidden')).toBe(true);

    state.emit({
      stt: {
        inputSource: "Canal 'Focus' <Beta>",
        status: 'listening',
        transcript: '«Bonjour»',
      },
    });

    expect(sourceLabel.textContent).toBe("Canal 'Focus' <Beta>");
    expect(sourceLabel.innerHTML).toBe("Canal 'Focus' &lt;Beta&gt;");
    expect(sourceButton.getAttribute('aria-label')).toBe("Source audio : Canal 'Focus' <Beta>");
    expect(sourceButton.getAttribute('title')).toBe("Source audio : Canal 'Focus' <Beta>");
    expect(badge.hasAttribute('hidden')).toBe(false);

    const textarea = article.querySelector('[data-ref="txt"]');
    expect(textarea.value).toBe('«Bonjour»');
  });
});
