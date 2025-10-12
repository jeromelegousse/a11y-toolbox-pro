import { describe, expect, it, vi } from 'vitest';

if (typeof window === 'undefined') {
  globalThis.window = {};
}

const { setupModuleRuntime } = await import('../src/module-runtime.js');
const { registerModule } = await import('../src/registry.js');

function createStubState(initial = {}) {
  let data = structuredClone(initial);
  const listeners = new Set();
  function getPath(path) {
    if (!path) return structuredClone(data);
    return path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), data);
  }
  function setPath(path, value) {
    if (!path) return;
    const keys = path.split('.');
    let ref = data;
    keys.slice(0, -1).forEach((key) => {
      if (typeof ref[key] !== 'object' || ref[key] === null) {
        ref[key] = {};
      }
      ref = ref[key];
    });
    ref[keys.at(-1)] = value;
    const snapshot = structuredClone(data);
    listeners.forEach((listener) => listener(snapshot));
  }
  return {
    get: getPath,
    set: setPath,
    on(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    }
  };
}

describe('setupModuleRuntime metrics', () => {
  it('enregistre la latence et les succès de chargement', async () => {
    const moduleId = `test-metrics-${Date.now()}`;
    const manifest = { id: moduleId };
    const initSpy = vi.fn();
    const times = [0, 48, 60, 72];
    const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => times.shift() ?? 100);

    const state = createStubState({
      ui: { disabled: [] },
      runtime: { modules: {} }
    });

    const catalog = [
      {
        id: moduleId,
        manifest,
        loader: async () => {
          registerModule({ id: moduleId, manifest, init: initSpy });
        }
      }
    ];

    const runtime = setupModuleRuntime({ state, catalog });
    await runtime.loadModule(moduleId);

    const metrics = state.get(`runtime.modules.${moduleId}.metrics`);
    expect(initSpy).toHaveBeenCalledTimes(1);
    expect(metrics.attempts).toBe(1);
    expect(metrics.successes).toBe(1);
    expect(metrics.failures).toBe(0);
    expect(metrics.timings.load.last).toBeCloseTo(48, 5);
    expect(metrics.timings.init.last).toBeCloseTo(12, 5);
    expect(metrics.timings.combinedAverage).toBeCloseTo(60, 5);
    expect(metrics.compat.score).toBe('AAA');

    nowSpy.mockRestore();
  });

  it('trace les échecs et expose les prérequis manquants', async () => {
    const moduleId = `test-metrics-failure-${Date.now()}`;
    const manifest = { id: moduleId, compat: { features: ['SpeechRecognition'] } };
    const times = [0, 55, 70, 90];
    const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => times.shift() ?? 100);

    const state = createStubState({
      ui: { disabled: [] },
      runtime: { modules: {} }
    });

    const catalog = [
      {
        id: moduleId,
        manifest,
        loader: async () => {
          registerModule({
            id: moduleId,
            manifest,
            init: () => {
              throw new Error('init ko');
            }
          });
        }
      }
    ];

    const runtime = setupModuleRuntime({ state, catalog });
    await expect(runtime.loadModule(moduleId)).rejects.toThrow('init ko');

    const metrics = state.get(`runtime.modules.${moduleId}.metrics`);
    expect(metrics.attempts).toBe(1);
    expect(metrics.successes).toBe(0);
    expect(metrics.failures).toBe(1);
    expect(metrics.retryCount).toBe(1);
    expect(metrics.lastError).toBe('init ko');
    expect(metrics.timings.load.last).toBeCloseTo(55, 5);
    expect(metrics.timings.init.last).toBe(null);
    expect(metrics.compat.score).toBe('AA');
    expect(metrics.compat.missing.features).toContain('SpeechRecognition');

    nowSpy.mockRestore();
  });
});
