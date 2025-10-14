import { describe, expect, it, vi, afterEach } from 'vitest';
import { createMetricsSyncService } from '../src/status-center.js';

function createStubState(initial = {}) {
  let snapshot = structuredClone(initial);
  return {
    set(path, value) {
      if (!path) return;
      const keys = path.split('.');
      let ref = snapshot;
      keys.slice(0, -1).forEach((key) => {
        if (typeof ref[key] !== 'object' || ref[key] === null) {
          ref[key] = {};
        }
        ref = ref[key];
      });
      ref[keys.at(-1)] = value;
    },
    get(path) {
      if (!path) return structuredClone(snapshot);
      return path.split('.').reduce((acc, key) => acc?.[key], snapshot);
    }
  };
}

describe('createMetricsSyncService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('agrège les échantillons et publie les fenêtres', async () => {
    const state = createStubState({
      runtime: {
        modules: {
          foo: { manifestName: 'Module Foo', collections: ['vision'] }
        }
      }
    });
    const transport = vi.fn(() => Promise.resolve());
    const service = createMetricsSyncService({
      state,
      transport,
      windowDuration: 60_000,
      flushInterval: 60_000,
      now: () => 60_000
    });

    service.ingest({
      moduleId: 'foo',
      collectedAt: 60_000,
      status: { attempts: 1, successes: 1, failures: 0, retryCount: 0 },
      timings: {
        load: { total: 48, samples: 1 },
        init: { total: 12, samples: 1 }
      },
      compat: { score: 'AA' },
      incidents: []
    });

    const active = service.getActiveWindows();
    expect(active).toHaveLength(1);
    expect(active[0].moduleId).toBe('foo');
    expect(active[0].latency.load.samples).toBe(1);
    const snapshot = state.get('runtime.metricsSync');
    expect(snapshot.activeWindows).toHaveLength(1);

    const result = await service.flush({ force: true });
    expect(result.sent).toBeGreaterThan(0);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0][0].windows[0].moduleId).toBe('foo');
  });

  it('met en file d’attente les fenêtres hors ligne', async () => {
    const storage = {
      load: vi.fn().mockResolvedValue([]),
      save: vi.fn().mockResolvedValue(undefined)
    };
    const originalNavigator = global.navigator;
    global.navigator = { onLine: false };

    const service = createMetricsSyncService({
      storage,
      windowDuration: 60_000,
      now: () => 120_000
    });

    service.ingest({
      moduleId: 'bar',
      collectedAt: 120_000,
      status: { attempts: 2, successes: 1, failures: 1, retryCount: 1 },
      timings: {
        load: { total: 80, samples: 2 },
        init: { total: 40, samples: 1 }
      },
      compat: { score: 'A' },
      incidents: [{ type: 'error', message: 'boom', at: 120_000 }]
    });

    const result = await service.flush({ force: true });
    expect(result.sent).toBe(0);
    expect(result.queued).toBeGreaterThan(0);
    expect(storage.save).toHaveBeenCalled();

    global.navigator = originalNavigator;
  });

  it('utilise un timeout pour les transports lents', async () => {
    const transport = vi.fn(() => new Promise(() => {}));
    const service = createMetricsSyncService({
      transport,
      timeoutMs: 10,
      now: () => 200_000
    });

    service.ingest({
      moduleId: 'slow',
      collectedAt: 200_000,
      status: { attempts: 1, successes: 0, failures: 1, retryCount: 1 },
      timings: {
        load: { total: 40, samples: 1 },
        init: { total: 0, samples: 0 }
      },
      compat: { score: 'B' },
      incidents: [{ type: 'error', message: 'timeout', at: 200_000 }]
    });

    const result = await service.flush({ force: true });
    expect(result.sent).toBe(0);
    expect(service.getQueue().length).toBeGreaterThan(0);
  });
});
