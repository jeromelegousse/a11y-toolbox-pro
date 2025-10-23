import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountUI } from '../src/ui.js';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createTestState(initial = {}) {
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
        listeners.forEach((fn) => fn(clone(state)));
      }
    },
    on(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

function createDefaultState() {
  return {
    ui: {
      activity: [],
      view: 'modules',
      category: 'all',
      search: '',
      pinned: [],
      hidden: [],
      disabled: [],
      moduleOrder: [],
      showHidden: false,
      organizeFilter: 'all',
      lastProfile: null,
      priorities: {},
      guides: { completedSteps: {} },
      collections: { disabled: [] },
      dock: 'right',
      fullscreen: false,
    },
    profiles: {},
    runtime: { modules: {} },
    audio: {},
    tts: { status: 'idle', progress: 0 },
    collaboration: {
      accounts: [],
      teams: [],
      workflow: {
        defaultState: 'draft',
        states: {},
        transitions: [],
      },
      syncs: [],
      exports: [],
    },
  };
}

describe('dock menu interactions', () => {
  let root;
  let state;

  beforeEach(() => {
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
    state = createTestState(createDefaultState());
    mountUI({ root, state });
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('ouvre le menu dock et applique la sélection', async () => {
    const trigger = root.querySelector('[data-ref="dock-menu-button"]');
    const menu = root.querySelector('[data-ref="dock-menu"]');
    expect(trigger).toBeTruthy();
    expect(menu).toBeTruthy();

    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(menu.hidden).toBe(true);

    trigger.click();

    await vi.waitFor(() => {
      expect(trigger.getAttribute('aria-expanded')).toBe('true');
      expect(menu.hidden).toBe(false);
    });

    const leftOption = menu.querySelector('[data-position="left"]');
    expect(leftOption).toBeTruthy();

    leftOption.click();

    await vi.waitFor(() => {
      expect(state.get('ui.dock')).toBe('left');
    });

    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(menu.hidden).toBe(true);
    expect(trigger.getAttribute('aria-activedescendant')).toBe(leftOption.id);
  });
});
