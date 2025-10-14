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
    const dateValues = [1000, 2000, 3000, 4000, 5000];
    const dateSpy = vi.spyOn(Date, 'now').mockImplementation(() => dateValues.shift() ?? 6000);

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

    const metricsSpy = vi.fn();
    const runtime = setupModuleRuntime({ state, catalog, onMetricsUpdate: metricsSpy });
    await runtime.loadModule(moduleId);

    const metrics = state.get(`runtime.modules.${moduleId}.metrics`);
    expect(initSpy).toHaveBeenCalledTimes(1);
    expect(metrics.attempts).toBe(1);
    expect(metrics.successes).toBe(1);
    expect(metrics.failures).toBe(0);
    expect(metrics.timings.load.last).toBeCloseTo(48, 5);
    expect(metrics.timings.load.total).toBeCloseTo(48, 5);
    expect(metrics.timings.init.last).toBeCloseTo(12, 5);
    expect(metrics.timings.init.total).toBeCloseTo(12, 5);
    expect(metrics.timings.combinedAverage).toBeCloseTo(60, 5);
    expect(metrics.compat.score).toBe('AAA');
    expect(Number.isFinite(metrics.timestamps.lastAttemptAt)).toBe(true);
    expect(Number.isFinite(metrics.timestamps.lastSuccessAt)).toBe(true);
    expect(metrics.timestamps.lastFailureAt).toBeNull();
    expect(metrics.timestamps.lastAttemptAt).toBeLessThanOrEqual(metrics.timestamps.lastSuccessAt);
    expect(metrics.timestamps.collectedAt).toBeGreaterThanOrEqual(metrics.timestamps.lastSuccessAt);
    expect(Array.isArray(metrics.incidents)).toBe(true);
    expect(metrics.incidents).toHaveLength(0);
    expect(metricsSpy).toHaveBeenCalledTimes(1);
    const sample = metricsSpy.mock.calls[0][0];
    expect(sample).toMatchObject({
      moduleId,
      status: { attempts: 1, successes: 1, failures: 0 }
    });
    expect(sample.timestamps.lastAttemptAt).toBe(metrics.timestamps.lastAttemptAt);
    expect(sample.timestamps.lastSuccessAt).toBe(metrics.timestamps.lastSuccessAt);
    expect(sample.timings.load.total).toBeCloseTo(48, 5);

    nowSpy.mockRestore();
    dateSpy.mockRestore();
  });

  it('trace les échecs et expose les prérequis manquants', async () => {
    const moduleId = `test-metrics-failure-${Date.now()}`;
    const manifest = { id: moduleId, compat: { features: ['SpeechRecognition'] } };
    const times = [0, 55, 70, 90];
    const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => times.shift() ?? 100);
    const dateValues = [2000, 2500, 3000, 3500, 4000];
    const dateSpy = vi.spyOn(Date, 'now').mockImplementation(() => dateValues.shift() ?? 5000);

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

    const metricsSpy = vi.fn();
    const runtime = setupModuleRuntime({ state, catalog, onMetricsUpdate: metricsSpy });
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
    expect(Number.isFinite(metrics.timestamps.lastAttemptAt)).toBe(true);
    expect(Number.isFinite(metrics.timestamps.lastFailureAt)).toBe(true);
    expect(metrics.timestamps.lastAttemptAt).toBeLessThan(metrics.timestamps.lastFailureAt);
    expect(metrics.timestamps.collectedAt).toBeGreaterThanOrEqual(metrics.timestamps.lastFailureAt);
    expect(metrics.incidents).toHaveLength(1);
    expect(metrics.incidents[0]).toMatchObject({
      type: 'error',
      message: 'init ko'
    });
    expect(metricsSpy).toHaveBeenCalledTimes(1);
    const failureSample = metricsSpy.mock.calls[0][0];
    expect(failureSample.status.failures).toBe(1);
    expect(Array.isArray(failureSample.incidents)).toBe(true);
    expect(failureSample.incidents[0].message).toBe('init ko');
    expect(failureSample.timestamps.lastFailureAt).toBe(metrics.timestamps.lastFailureAt);

    nowSpy.mockRestore();
    dateSpy.mockRestore();
  });
});
