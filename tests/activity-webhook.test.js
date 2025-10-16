import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountUI } from '../src/ui.js';

function createTestState(initial = {}) {
  let state = structuredClone(initial);
  const listeners = new Set();
  return {
    get(path) {
      if (!path) return structuredClone(state);
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
    }
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
      collections: { disabled: [] }
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
          published: { label: 'Publication', roles: ['owner'] }
        },
        transitions: []
      },
      syncs: [],
      exports: []
    }
  };
}

describe('intégrations activité', () => {
  const originalFetch = globalThis.fetch;
  let fetchMock;
  const proxyUrl = 'https://example.test/wp-json/a11ytb/v1/activity/sync';
  const serverConnectors = [
    {
      id: 'webhook',
      label: 'Webhook générique',
      help: 'Proxy webhook interne.',
      fields: [],
      supportsBulk: true,
      enabled: true,
      status: 'prêt'
    },
    {
      id: 'jira',
      label: 'Jira (REST)',
      help: 'Proxy Jira interne.',
      fields: [],
      supportsBulk: false,
      enabled: true,
      status: 'prêt'
    },
    {
      id: 'linear',
      label: 'Linear (REST)',
      help: 'Proxy Linear interne.',
      fields: [],
      supportsBulk: false,
      enabled: true,
      status: 'prêt'
    },
    {
      id: 'slack',
      label: 'Slack (Webhook)',
      help: 'Proxy Slack interne.',
      fields: [],
      supportsBulk: true,
      enabled: true,
      status: 'prêt'
    }
  ];

  beforeEach(() => {
    document.body.innerHTML = '';
    fetchMock = vi.fn(async () => ({ ok: true, status: 202, text: async () => '' }));
    globalThis.fetch = fetchMock;
    if (!window.a11ytb) {
      window.a11ytb = {};
    }
    window.a11ytb.feedback = { play: vi.fn() };
  });

  afterEach(() => {
    document.body.innerHTML = '';
    if (originalFetch) {
      globalThis.fetch = originalFetch;
    } else {
      delete globalThis.fetch;
    }
    fetchMock?.mockReset();
  });

  it('pousse automatiquement les entrées via le proxy interne', async () => {
    const state = createTestState(createDefaultState());
    const root = document.createElement('div');
    document.body.appendChild(root);

    const postPayloads = [];
    fetchMock = vi.fn(async (url, options = {}) => {
      const method = (options?.method || 'GET').toUpperCase();
      if (url === proxyUrl && method === 'GET') {
        return { ok: true, status: 200, json: async () => ({ success: true, connectors: serverConnectors }) };
      }
      if (url === proxyUrl && method === 'POST') {
        postPayloads.push(JSON.parse(options.body));
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, connectors: serverConnectors, jobType: 'single', count: 1 })
        };
      }
      throw new Error(`unexpected url ${url} ${method}`);
    });
    globalThis.fetch = fetchMock;

    mountUI({
      root,
      state,
      config: {
        integrations: {
          activity: {
            enabled: true,
            webhookUrl: 'https://example.test/hook',
            hasAuthToken: true,
            proxyUrl
          }
        }
      }
    });

    window.a11ytb.logActivity('Essai proxy', { module: 'activity' });

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    expect(postPayloads).toHaveLength(1);
    const payload = postPayloads[0];
    expect(payload.job.type).toBe('single');
    expect(payload.job.entry.message).toBe('Essai proxy');
    expect(payload.job.entry).not.toHaveProperty('authToken');
    expect(payload.context.page).toBe(window.location.href);

    await vi.waitFor(() => {
      const syncs = state.get('collaboration.syncs');
      expect(Array.isArray(syncs)).toBe(true);
      expect(syncs[0].status).toBe('success');
      expect(syncs[0].count).toBe(1);
    });
  });

  it('journalise les échecs et relance via le bouton manuel', async () => {
    const responses = [
      () => Promise.reject(new Error('network down')),
      () => Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ success: true, connectors: serverConnectors, jobType: 'single', count: 1 })
      }),
      () => Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ success: true, connectors: serverConnectors, jobType: 'bulk', count: 2 })
      })
    ];
    const postPayloads = [];

    fetchMock = vi.fn((url, options = {}) => {
      const method = (options?.method || 'GET').toUpperCase();
      if (url === proxyUrl && method === 'GET') {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ success: true, connectors: serverConnectors }) });
      }
      if (url === proxyUrl && method === 'POST') {
        postPayloads.push(JSON.parse(options.body));
        const factory = responses.shift();
        const fallback = () => Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ success: true, connectors: serverConnectors })
        });
        return (factory || fallback)();
      }
      throw new Error(`unexpected url ${url} ${method}`);
    });
    globalThis.fetch = fetchMock;

    const state = createTestState(createDefaultState());
    const root = document.createElement('div');
    document.body.appendChild(root);

    mountUI({
      root,
      state,
      config: {
        integrations: {
          activity: {
            enabled: true,
            webhookUrl: 'https://example.test/hook',
            hasAuthToken: true,
            proxyUrl
          }
        }
      }
    });

    window.a11ytb.logActivity('Première entrée', { module: 'activity' });

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    await vi.waitFor(() => {
      const entries = state.get('ui.activity');
      expect(entries.some((entry) => entry.message.includes('Échec d’envoi de la synchronisation'))).toBe(true);
      const syncs = state.get('collaboration.syncs');
      expect(syncs.some((entry) => entry.status === 'error')).toBe(true);
    });

    const sendButton = root.querySelector('[data-action="activity-send-sync"]');
    expect(sendButton).toBeTruthy();
    sendButton.click();

    await vi.waitFor(() => {
      expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(4);
    });

    expect(postPayloads.length).toBeGreaterThanOrEqual(3);
    expect(postPayloads[0].job.type).toBe('single');
    const lastPayload = postPayloads.at(-1);
    expect(lastPayload.job.type).toBe('bulk');
    expect(Array.isArray(lastPayload.job.entries)).toBe(true);
    expect(lastPayload.job.entries.length).toBeGreaterThan(0);

    const syncs = state.get('collaboration.syncs');
    expect(syncs[0].status).toBe('success');
    expect(syncs.some((entry) => entry.status === 'queued')).toBe(true);
  });
});
