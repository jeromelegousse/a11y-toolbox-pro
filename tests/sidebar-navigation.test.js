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

  it('focuses sidebar entries with Ctrl+number and activates matching views', async () => {
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
    expect(buttons.length).toBeGreaterThanOrEqual(4);

    const panel = root.querySelector('.a11ytb-panel');
    expect(panel).toBeTruthy();

    const press = (key) => {
      const event = new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true });
      window.dispatchEvent(event);
    };

    press('1');
    await vi.waitFor(() => {
      expect(panel.dataset.open).toBe('true');
      expect(state.get('ui.view')).toBe('modules');
    });
    expect(buttons[0].getAttribute('aria-expanded')).toBe('true');
    expect(buttons[0].getAttribute('aria-current')).toBe('page');

    press('2');
    await vi.waitFor(() => {
      expect(state.get('ui.view')).toBe('status');
    });
    expect(buttons[1].getAttribute('aria-current')).toBe('page');

    press('3');
    await vi.waitFor(() => {
      expect(state.get('ui.view')).toBe('options');
    });
    expect(buttons[2].getAttribute('aria-current')).toBe('page');

    press('4');
    await vi.waitFor(() => {
      expect(state.get('ui.view')).toBe('guides');
    });
    expect(buttons[3].getAttribute('aria-current')).toBe('page');
  });
});
