import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountUI } from '../src/ui.js';

function createTestState(initial = {}) {
  let state = structuredClone(initial);
  const listeners = new Set();
  return {
    get(path) {
      if (!path) {
        return structuredClone(state);
      }
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
        const snapshot = structuredClone(state);
        listeners.forEach((fn) => fn(snapshot));
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
        states: {
          draft: { label: 'Brouillon', roles: ['owner'] },
          review: { label: 'Revue', roles: ['reviewer'] },
          published: { label: 'Publication', roles: ['owner'] },
        },
        transitions: [],
      },
      syncs: [],
      exports: [],
    },
  };
}

describe('fullscreen mode', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.body.className = '';
    window.a11ytb = { feedback: { play: vi.fn() } };
  });

  afterEach(() => {
    document.body.innerHTML = '';
    document.body.className = '';
    delete window.a11ytb;
  });

  it('toggles body class when fullscreen is enabled and disabled', async () => {
    const state = createTestState(createDefaultState());
    const root = document.createElement('div');
    document.body.append(root);

    mountUI({ root, state });

    window.a11ytb.panel.open();

    const panel = root.querySelector('.a11ytb-panel');
    await vi.waitFor(() => {
      expect(panel?.dataset.open).toBe('true');
    });

    const fullscreenButton = root.querySelector('button[data-action="toggle-fullscreen"]');
    expect(fullscreenButton).toBeTruthy();

    fullscreenButton.click();
    await vi.waitFor(() => {
      expect(document.body.classList.contains('a11ytb-fullscreen')).toBe(true);
    });

    fullscreenButton.click();
    await vi.waitFor(() => {
      expect(document.body.classList.contains('a11ytb-fullscreen')).toBe(false);
    });

    root.remove();
  });
});
