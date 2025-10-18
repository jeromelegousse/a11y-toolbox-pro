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

describe('setupModuleRuntime — ressources réseau', () => {
  beforeEach(() => {
    globalThis.window = { a11ytb: {} };
    window.a11ytb.logActivity = vi.fn();
    __resetMockModules();
    __setMockManifests([]);
    __setMockManifestHistory([]);
  });

  it('met en cache une ressource réseau et réutilise la mémoire', async () => {
    const moduleId = `network-${Date.now()}`;
    __setMockModule(moduleId, { init: vi.fn() });

    const manifest = {
      id: moduleId,
      name: 'Module réseau test',
      version: '1.0.0',
      runtime: {
        fetch: {
          resources: [
            {
              id: 'config',
              url: 'https://example.test/config.json',
              format: 'json',
              strategy: 'on-demand',
              cache: 'memory',
            },
          ],
        },
      },
    };
    __setMockManifests([manifest]);

    const fetchResponse = { ok: true };
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(fetchResponse),
        text: () => Promise.resolve(JSON.stringify(fetchResponse)),
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      })
    );
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock;

    try {
      const state = createStateMock({
        ui: { disabled: [] },
        runtime: { modules: {} },
      });

      const catalog = [
        {
          id: moduleId,
          manifest,
          loader: () => Promise.resolve(),
        },
      ];

      const runtime = setupModuleRuntime({ state, catalog });

      await runtime.fetchResource(moduleId, 'config');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const network = state.get(`runtime.modules.${moduleId}.network`);
      expect(network.status === 'ready' || network.status === 'idle').toBe(true);
      const resource = network.resources.find((entry) => entry.id === 'config');
      expect(resource).toBeDefined();
      expect(resource.status === 'ready' || resource.status === 'idle').toBe(true);

      fetchMock.mockClear();
      await runtime.fetchResource(moduleId, 'config');
      expect(fetchMock).not.toHaveBeenCalled();
      const networkAfter = state.get(`runtime.modules.${moduleId}.network`);
      expect(networkAfter.hits).toBeGreaterThanOrEqual(1);
      const cached = await runtime.getCachedResource(moduleId, 'config');
      expect(cached).toEqual(fetchResponse);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('sert les données depuis le cache lorsque le navigateur est hors ligne', async () => {
    const moduleId = `network-offline-${Date.now()}`;
    __setMockModule(moduleId, { init: vi.fn() });

    const manifest = {
      id: moduleId,
      name: 'Module hors ligne',
      version: '1.0.0',
      runtime: {
        fetch: {
          resources: [
            {
              id: 'dataset',
              url: 'https://example.test/data.json',
              format: 'json',
              strategy: 'on-demand',
              cache: 'memory',
            },
          ],
        },
      },
    };
    __setMockManifests([manifest]);

    const fetchResponse = { offline: false };
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(fetchResponse),
        text: () => Promise.resolve(JSON.stringify(fetchResponse)),
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      })
    );
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock;

    const state = createStateMock({
      ui: { disabled: [] },
      runtime: { modules: {} },
    });

    const catalog = [
      {
        id: moduleId,
        manifest,
        loader: () => Promise.resolve(),
      },
    ];

    const originalNavigator = globalThis.navigator;

    try {
      const runtime = setupModuleRuntime({ state, catalog });

      await runtime.fetchResource(moduleId, 'dataset');
      expect(fetchMock).toHaveBeenCalledTimes(1);

      Object.defineProperty(globalThis, 'navigator', {
        value: { onLine: false },
        configurable: true,
      });

      fetchMock.mockImplementation(() => Promise.reject(new Error('offline')));
      const cached = await runtime.fetchResource(moduleId, 'dataset');
      expect(cached).toEqual(fetchResponse);
      expect(fetchMock).not.toHaveBeenCalledTimes(2);

      const network = state.get(`runtime.modules.${moduleId}.network`);
      const resource = network.resources.find((entry) => entry.id === 'dataset');
      expect(resource.offline).toBe(true);
    } finally {
      if (originalNavigator) {
        Object.defineProperty(globalThis, 'navigator', {
          value: originalNavigator,
          configurable: true,
        });
      } else {
        delete globalThis.navigator;
      }
      globalThis.fetch = originalFetch;
    }
  });
});
