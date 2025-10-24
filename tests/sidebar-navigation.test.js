import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mountUI } from '../src/ui.js';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createTestState(initial) {
  let state = clone(initial);
  const listeners = new Set();
  return {
    get(path) {
      if (!path) return clone(state);
      return path.split('.').reduce((acc, key) => acc?.[key], state);
    },
    set(path, value) {
      if (!path) return;
      const keys = path.split('.');
      let ref = state;
      for (let i = 0; i < keys.length - 1; i += 1) {
        const key = keys[i];
        if (typeof ref[key] !== 'object' || ref[key] === null) {
          ref[key] = {};
        }
        ref = ref[key];
      }
      ref[keys.at(-1)] = value;
      if (path.startsWith('ui.')) {
        listeners.forEach((fn) => fn(state));
      }
    },
    on(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

describe('sidebar keyboard navigation', () => {
  let root;

  beforeEach(() => {
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
    window.a11ytb = window.a11ytb || {};
    window.a11ytb.logActivity = vi.fn();
    window.a11ytb.feedback = { play: vi.fn() };
    window.a11ytb.overlays = {};
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('ouvre et ferme le menu avec le raccourci global et gère le focus', async () => {
    const state = createTestState({
      ui: {
        view: 'modules',
        dock: 'right',
        category: 'all',
        search: '',
        showHidden: false,
        pinned: [],
        hidden: [],
        disabled: [],
        moduleOrder: [],
        organizeFilter: 'all',
        activity: [],
        fullscreen: false,
        activeProfile: 'custom',
        priorities: {},
        collections: { disabled: [] },
      },
      profiles: {},
      runtime: { modules: {} },
      audio: {},
      tts: { status: 'idle', progress: 0, reader: { open: false } },
    });

    mountUI({ root, state });

    const buttons = Array.from(root.querySelectorAll('.a11ytb-sidebar-button'));
    expect(buttons.length).toBeGreaterThanOrEqual(1);

    const panel = root.querySelector('.a11ytb-panel');
    expect(panel).toBeTruthy();

    const toggleButton = buttons[0];
    toggleButton.focus();

    const pressToggle = () => {
      const event = new KeyboardEvent('keydown', {
        key: 'a',
        altKey: true,
        shiftKey: true,
        bubbles: true,
      });
      window.dispatchEvent(event);
    };

    pressToggle();
    await vi.waitFor(() => {
      expect(panel.dataset.open).toBe('true');
    });
    const title = root.querySelector('.a11ytb-title');
    expect(title).toBeTruthy();
    expect(document.activeElement).toBe(title);
    expect(toggleButton.getAttribute('aria-expanded')).toBe('true');

    const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    window.dispatchEvent(escapeEvent);

    await vi.waitFor(() => {
      expect(panel.dataset.open).toBe('false');
    });
    expect(toggleButton.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(toggleButton);
  });
});
