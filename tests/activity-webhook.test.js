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
    tts: { status: 'idle', progress: 0 }
  };
}

describe('intégration webhook activité', () => {
  const originalFetch = globalThis.fetch;
  let fetchMock;

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

  it('pousse automatiquement les entrées vers le webhook', async () => {
    const state = createTestState(createDefaultState());
    const root = document.createElement('div');
    document.body.appendChild(root);

    mountUI({
      root,
      state,
      config: {
        integrations: {
          activity: {
            webhookUrl: 'https://example.test/hook',
            authToken: 'token-123'
          }
        }
      }
    });

    window.a11ytb.logActivity('Essai webhook', { module: 'activity' });

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://example.test/hook');
    expect(options.method).toBe('POST');
    expect(options.headers['Authorization']).toBe('Bearer token-123');
    const payload = JSON.parse(options.body);
    expect(payload.event).toBe('a11ytb.activity.entry');
    expect(payload.entry.message).toBe('Essai webhook');
  });

  it('journalise les échecs et relance via le bouton manuel', async () => {
    const responses = [
      () => Promise.reject(new Error('network down')),
      () => Promise.resolve({ ok: true, status: 204, text: async () => '' }),
      () => Promise.resolve({ ok: true, status: 204, text: async () => '' })
    ];
    fetchMock = vi.fn(() => {
      const factory = responses.shift();
      const fallback = () => Promise.resolve({ ok: true, status: 204, text: async () => '' });
      return (factory || fallback)();
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
            webhookUrl: 'https://example.test/hook',
            authToken: 'retry-token'
          }
        }
      }
    });

    window.a11ytb.logActivity('Première entrée', { module: 'activity' });

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    await vi.waitFor(() => {
      const entries = state.get('ui.activity');
      expect(entries.some((entry) => entry.message.includes('Échec d’envoi au webhook'))).toBe(true);
    });

    const sendButton = root.querySelector('[data-action="activity-send-webhook"]');
    expect(sendButton).toBeTruthy();
    sendButton.click();

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    const retryPayload = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(retryPayload.event).toBe('a11ytb.activity.entry');
    const bulkPayload = JSON.parse(fetchMock.mock.calls[2][1].body);
    expect(bulkPayload.event).toBe('a11ytb.activity.bulk');
    expect(Array.isArray(bulkPayload.entries)).toBe(true);
    expect(bulkPayload.entries.length).toBeGreaterThan(0);
  });
});
