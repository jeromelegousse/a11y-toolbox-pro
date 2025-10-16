import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/registry.js', () => {
  const modules = new Map();
  let blocks = [
    { id: 'alpha-block', moduleId: 'alpha' },
    { id: 'beta-block', moduleId: 'beta' },
    { id: 'gamma-block', moduleId: 'gamma' },
  ];
  let manifests = [];
  let manifestHistory = [];
  return {
    getModule: (id) => modules.get(id),
    listBlocks: () => blocks,
    listModuleManifests: () => manifests,
    listModuleManifestHistory: () => manifestHistory,
    __setMockModule(id, mod) {
      modules.set(id, mod);
    },
    __resetMockModules() {
      modules.clear();
    },
    __setMockBlocks(next) {
      blocks = next;
    },
    __setMockManifests(next) {
      manifests = next;
    },
    __setMockManifestHistory(next) {
      manifestHistory = next;
    },
  };
});

import { setupModuleRuntime } from '../src/module-runtime.js';
import {
  __setMockModule,
  __resetMockModules,
  __setMockManifests,
  __setMockManifestHistory,
} from '../src/registry.js';

function createStateMock(initial = {}) {
  let data = structuredClone(initial);
  const listeners = new Set();
  return {
    get(path) {
      if (!path) return structuredClone(data);
      return path
        .split('.')
        .reduce((acc, key) => (acc && typeof acc === 'object' ? acc[key] : undefined), data);
    },
    set(path, value) {
      if (!path) return;
      const keys = path.split('.');
      let ref = data;
      for (let i = 0; i < keys.length - 1; i += 1) {
        const key = keys[i];
        if (typeof ref[key] !== 'object' || ref[key] === null) {
          ref[key] = {};
        }
        ref = ref[key];
      }
      ref[keys.at(-1)] = value;
      const snapshot = structuredClone(data);
      listeners.forEach((fn) => fn(snapshot));
    },
    on(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

describe('setupModuleRuntime — dépendances', () => {
  beforeEach(() => {
    globalThis.window = { a11ytb: {} };
    __resetMockModules();
    __setMockModule('alpha', { init: vi.fn() });
    __setMockModule('beta', { init: vi.fn() });
    __setMockModule('gamma', { init: vi.fn() });
    __setMockManifests([]);
    __setMockManifestHistory([]);
  });

  it('résout les dépendances et les versions disponibles', () => {
    const state = createStateMock({ ui: { disabled: [] }, runtime: { modules: {} } });
    window.a11ytb.logActivity = vi.fn();

    const catalog = [
      {
        id: 'alpha',
        manifest: {
          id: 'alpha',
          name: 'Module Alpha',
          version: '1.0.0',
          dependencies: [{ id: 'beta', version: '1.0.0' }],
        },
        loader: () => Promise.resolve(),
      },
      {
        id: 'beta',
        manifest: {
          id: 'beta',
          name: 'Module Beta',
          version: '1.2.0',
        },
        loader: () => Promise.resolve(),
      },
    ];

    __setMockManifests(catalog.map((entry) => ({ ...entry.manifest })));
    setupModuleRuntime({ state, catalog });

    const alphaRuntime = state.get('runtime.modules.alpha');
    expect(alphaRuntime.manifestVersion).toBe('1.0.0');
    expect(alphaRuntime.manifestName).toBe('Module Alpha');
    expect(alphaRuntime.dependencies).toEqual([
      expect.objectContaining({
        id: 'beta',
        label: 'Module Beta',
        status: 'ok',
        statusLabel: 'OK',
        currentVersion: '1.2.0',
        requiredVersion: '1.0.0',
      }),
    ]);
    expect(window.a11ytb.logActivity).not.toHaveBeenCalled();
  });

  it('signale les dépendances manquantes ou incompatibles et journalise un conflit', () => {
    const state = createStateMock({ ui: { disabled: [] }, runtime: { modules: {} } });
    window.a11ytb.logActivity = vi.fn();

    const catalog = [
      {
        id: 'gamma',
        manifest: {
          id: 'gamma',
          name: 'Module Gamma',
          version: '2.0.0',
          dependencies: [{ id: 'delta' }, { id: 'beta', version: '2.5.0' }],
        },
        loader: () => Promise.resolve(),
      },
      {
        id: 'beta',
        manifest: {
          id: 'beta',
          name: 'Module Beta',
          version: '1.4.0',
        },
        loader: () => Promise.resolve(),
      },
    ];

    __setMockManifests(catalog.map((entry) => ({ ...entry.manifest })));
    setupModuleRuntime({ state, catalog });

    const gammaRuntime = state.get('runtime.modules.gamma');
    expect(gammaRuntime.dependencies).toEqual([
      expect.objectContaining({ id: 'delta', status: 'missing' }),
      expect.objectContaining({
        id: 'beta',
        status: 'incompatible',
        currentVersion: '1.4.0',
        requiredVersion: '2.5.0',
      }),
    ]);
    expect(window.a11ytb.logActivity).toHaveBeenCalledWith(
      expect.stringContaining('manquante'),
      expect.objectContaining({ module: 'gamma' })
    );
    expect(window.a11ytb.logActivity).toHaveBeenCalledWith(
      expect.stringContaining('incompatible'),
      expect.objectContaining({ module: 'gamma' })
    );
  });

  it('journalise un changement de version lorsque le manifeste évolue', () => {
    const state = createStateMock({
      ui: { disabled: [] },
      runtime: { modules: { alpha: { manifestVersion: '0.9.0' } } },
    });
    window.a11ytb.logActivity = vi.fn();

    const catalog = [
      {
        id: 'alpha',
        manifest: {
          id: 'alpha',
          name: 'Module Alpha',
          version: '1.0.0',
        },
        loader: () => Promise.resolve(),
      },
    ];

    __setMockManifests(catalog.map((entry) => ({ ...entry.manifest })));
    setupModuleRuntime({ state, catalog });

    expect(window.a11ytb.logActivity).toHaveBeenCalledWith(
      expect.stringContaining('0.9.0'),
      expect.objectContaining({ module: 'alpha' })
    );
  });
});
