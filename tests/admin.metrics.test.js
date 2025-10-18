import { describe, expect, it } from 'vitest';

import { computeMetricsOverview } from '../src/admin/data-model.js';

describe('computeMetricsOverview', () => {
  it('agrège les métriques, incidents et collections', () => {
    const entries = [
      {
        id: 'module-one',
        manifest: { name: 'Module One' },
        metrics: {
          attempts: 5,
          successes: 4,
          failures: 1,
          timings: {
            combinedAverage: 120,
            load: { total: 300, samples: 3, average: 100 },
            init: { total: 60, samples: 3, average: 20 },
          },
          incidents: [
            { severity: 'error', at: 1000 },
            { severity: 'warning', at: 1500 },
          ],
          lastIncidentAt: 1500,
          lastAttemptAt: 2000,
          lastSuccessAt: 1800,
          lastFailureAt: 1900,
        },
        runtime: { lastAttemptAt: 2000, lastFailureAt: 1900 },
        collections: ['set-alpha'],
        profiles: ['profile-a'],
        networkRequests: 3,
        networkHits: 1,
        networkResources: [{ status: 'ok' }, { status: 'offline' }],
      },
      {
        id: 'module-two',
        manifest: { name: 'Module Two' },
        metrics: {
          attempts: 3,
          successes: 2,
          failures: 1,
          timings: {
            combinedAverage: 80,
            load: { total: 120, samples: 2, average: 60 },
            init: { total: 40, samples: 2, average: 20 },
          },
          incidents: [],
          lastAttemptAt: 4000,
          lastSuccessAt: 3800,
          lastFailureAt: 3900,
        },
        runtime: { lastAttemptAt: 4000, lastFailureAt: 3900 },
        collections: ['set-alpha', 'set-beta'],
        profiles: [],
        networkRequests: 5,
        networkHits: 4,
        networkResources: [{ status: 'ok' }],
      },
    ];

    const snapshot = {
      runtime: {
        metricsSync: {
          activeWindows: [
            {
              moduleId: 'module-two',
              moduleLabel: 'Module Two',
              incidents: [{ severity: 'warning', message: 'Cache expiré', at: 4500 }],
              lastTimestamp: 4500,
            },
          ],
          pendingQueue: [{ generatedAt: 5000, windows: 1 }],
          lastUpdatedAt: 6000,
        },
      },
    };

    const overview = computeMetricsOverview(entries, snapshot);

    expect(overview.totals.modules).toBe(2);
    expect(overview.totals.attempts).toBe(8);
    expect(overview.totals.successes).toBe(6);
    expect(overview.totals.failures).toBe(2);
    expect(overview.totals.successRate).toBeCloseTo(75, 5);
    expect(overview.totals.latency.combinedAverage).toBeCloseTo(104, 5);
    expect(overview.totals.network.offline).toBe(1);

    expect(overview.incidents.total).toBe(2);
    expect(overview.incidents.errors).toBe(1);
    expect(overview.incidents.warnings).toBe(1);
    expect(overview.incidents.recent[0].moduleId).toBe('module-two');

    expect(overview.sync.activeWindows).toBe(1);
    expect(overview.sync.pendingQueue).toBe(1);

    expect(overview.topFailures[0].id).toBe('module-two');
    expect(overview.topLatency[0].id).toBe('module-one');

    const alphaCollection = overview.collections.find((collection) => collection.id === 'set-alpha');
    expect(alphaCollection?.modules).toBe(2);
    expect(alphaCollection?.attempts).toBe(8);

    const moduleOne = overview.modules.find((module) => module.id === 'module-one');
    expect(moduleOne?.incidents.total).toBe(2);
    expect(moduleOne?.network.offline).toBe(1);

    expect(overview.updatedAt).toBe(6000);
  });
});
