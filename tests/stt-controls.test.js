import { beforeEach, describe, expect, it } from 'vitest';
import { renderBlock } from '../src/registry.js';
import { createSttControlsBlock } from '../src/blocks/stt-controls.js';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createTestState(initial) {
  let snapshot = clone(initial);
  const listeners = new Set();

  return {
    get(path) {
      if (!path) {
        return clone(snapshot);
      }
      return path.split('.').reduce((acc, key) => acc?.[key], snapshot);
    },
    on(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit(next) {
      snapshot = clone(next);
      listeners.forEach((listener) => listener(clone(snapshot)));
    },
  };
}

describe('stt controls block', () => {
  let root;
  let state;
  let block;

  beforeEach(() => {
    document.body.innerHTML = '';
    window.a11ytb = window.a11ytb || {};
    root = document.createElement('div');
    const initialState = {
      stt: {
        inputSource: 'Mic "Pro" & <Test>',
        status: 'idle',
        transcript: '',
      },
    };
    state = createTestState(initialState);
    block = createSttControlsBlock({ icon: '<svg></svg>' });
    renderBlock(block, state, root);
  });

  it('escape les libellés de source audio dans les attributs et le texte', () => {
    const article = root.querySelector('[data-block-id="stt-controls"]');
    expect(article).toBeTruthy();

    const sourceButton = article.querySelector('[data-ref="source-button"]');
    const sourceLabel = article.querySelector('[data-ref="source-label"]');

    expect(sourceButton).toBeTruthy();
    expect(sourceLabel).toBeTruthy();

    expect(sourceLabel.textContent).toBe('Mic "Pro" & <Test>');
    expect(sourceLabel.innerHTML).not.toContain('<Test>');

    expect(sourceButton.getAttribute('aria-label')).toBe(
      'Source audio : Mic &quot;Pro&quot; &amp; &lt;Test&gt;'
    );
    expect(sourceButton.getAttribute('title')).toBe(
      'Source audio : Mic &quot;Pro&quot; &amp; &lt;Test&gt;'
    );

    const buttonMarkup = sourceButton.outerHTML;
    expect(buttonMarkup).toContain('Source audio : Mic &amp;quot;Pro&amp;quot; &amp;amp; &amp;lt;Test&amp;gt;');
    expect(buttonMarkup).not.toContain('Source audio : Mic "Pro" & <Test>');
  });

  it('met à jour les attributs lorsque le libellé change', () => {
    const article = root.querySelector('[data-block-id="stt-controls"]');
    const sourceButton = article.querySelector('[data-ref="source-button"]');
    const sourceLabel = article.querySelector('[data-ref="source-label"]');
    const badge = article.querySelector('[data-ref="badge"]');

    state.emit({
      stt: {
        inputSource: 'Nouvelle "source" <Insecure>',
        status: 'listening',
        transcript: '',
      },
    });

    expect(sourceLabel.textContent).toBe('Nouvelle "source" <Insecure>');
    expect(sourceLabel.innerHTML).toContain('&lt;Insecure&gt;');
    expect(sourceLabel.innerHTML).not.toContain('<Insecure>');

    expect(sourceButton.getAttribute('aria-label')).toBe(
      'Source audio : Nouvelle &quot;source&quot; &lt;Insecure&gt;'
    );
    expect(sourceButton.outerHTML).toContain(
      'Source audio : Nouvelle &amp;quot;source&amp;quot; &amp;lt;Insecure&amp;gt;'
    );
    expect(badge.hasAttribute('hidden')).toBe(false);
  });
});
