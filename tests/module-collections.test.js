import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupModuleRuntime } from '../src/module-runtime.js';
import { registerBlock, registerModule } from '../src/registry.js';
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

describe('module collections integration', () => {
  beforeEach(() => {
    if (!window.a11ytb) {
      window.a11ytb = {};
    }
    window.a11ytb.logActivity = vi.fn();
  });

  it('enables modules when a disabled collection is reactivated without touching ui.disabled', async () => {
    const moduleId = `test-module-${Math.random().toString(16).slice(2)}`;
    const blockId = `${moduleId}-block`;
    const collectionId = `${moduleId}-collection`;
    const initSpy = vi.fn();
    const loader = vi.fn(async () => {
      registerModule({
        id: moduleId,
        init: initSpy,
        manifest: { id: moduleId, name: 'Test module' },
      });
    });
    registerBlock({
      id: blockId,
      moduleId,
      title: 'Test module',
      category: 'vision',
      render: () => '<div>Test block</div>',
    });

    const state = createTestState({
      ui: {
        disabled: [],
        collections: { disabled: [collectionId] },
      },
      runtime: { modules: {} },
    });

    setupModuleRuntime({
      state,
      catalog: [
        {
          id: moduleId,
          loader,
        },
      ],
      collections: [
        {
          id: collectionId,
          label: 'Test collection',
          modules: [moduleId],
        },
      ],
    });

    expect(state.get(`runtime.modules.${moduleId}.enabled`)).toBe(false);
    expect(loader).not.toHaveBeenCalled();
    expect(state.get('ui.disabled')).toEqual([]);

    state.set('ui.collections.disabled', []);

    await vi.waitFor(() => {
      expect(loader).toHaveBeenCalledTimes(1);
      expect(state.get(`runtime.modules.${moduleId}.enabled`)).toBe(true);
    });
    expect(state.get('ui.disabled')).toEqual([]);
  });

  it('updates collection toggles without mutating ui.disabled', async () => {
    const collectionId = 'vision-plus';
    const blockId = `contrast-${Math.random().toString(16).slice(2)}`;
    registerBlock({
      id: blockId,
      moduleId: 'contrast',
      title: 'Contraste test',
      category: 'vision',
      render: () => '<div>Contraste</div>',
    });

    const state = createTestState({
      ui: {
        category: 'all',
        search: '',
        pinned: [],
        hidden: [],
        disabled: [],
        moduleOrder: [],
        showHidden: false,
        organizeFilter: 'all',
        activity: [],
        view: 'modules',
        lastProfile: null,
        priorities: {},
        guides: { completedSteps: {} },
        collections: { disabled: [] },
      },
      profiles: {},
      runtime: { modules: {} },
      audio: {},
      tts: { status: 'idle', progress: 0 },
    });

    const root = document.createElement('div');
    document.body.appendChild(root);
    mountUI({ root, state });

    const button = root.querySelector(
      `button.a11ytb-collection-toggle[data-collection-id="${collectionId}"]`
    );
    expect(button).toBeTruthy();

    button.click();

    await vi.waitFor(() => {
      expect(state.get('ui.collections.disabled')).toContain(collectionId);
    });
    expect(state.get('ui.disabled')).toEqual([]);

    const adminCheckbox = root.querySelector(
      `.a11ytb-admin-item[data-block-id="${blockId}"] input[type="checkbox"]`
    );
    expect(adminCheckbox).toBeTruthy();
    expect(adminCheckbox.disabled).toBe(true);

    button.click();

    await vi.waitFor(() => {
      expect(state.get('ui.collections.disabled')).not.toContain(collectionId);
    });
    expect(state.get('ui.disabled')).toEqual([]);
    expect(adminCheckbox.disabled).toBe(false);
    document.body.removeChild(root);
  });
});
