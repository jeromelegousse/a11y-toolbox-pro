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

  it('pousse automatiquement les entrées vers les connecteurs configurés', async () => {
    const state = createTestState(createDefaultState());
    const root = document.createElement('div');
    document.body.appendChild(root);

    fetchMock = vi.fn(async (url, options = {}) => {
      if (url === 'https://example.test/hook') {
        return { ok: true, status: 202, text: async () => '' };
      }
      if (url === 'https://jira.example.test/rest/api/3/issue') {
        return { ok: true, status: 201, text: async () => JSON.stringify({ id: 'A11Y-42' }) };
      }
      if (url === 'https://api.linear.app/rest/issues') {
        return { ok: true, status: 201, text: async () => JSON.stringify({ id: 'linear-1' }) };
      }
      if (url === 'https://hooks.slack.test/T123') {
        return { ok: true, status: 200, text: async () => '' };
      }
      throw new Error(`unexpected url ${url}`);
    });
    globalThis.fetch = fetchMock;

    mountUI({
      root,
      state,
      config: {
        integrations: {
          activity: {
            webhookUrl: 'https://example.test/hook',
            authToken: 'token-123',
            slackWebhookUrl: 'https://hooks.slack.test/T123',
            jiraBaseUrl: 'https://jira.example.test',
            jiraProjectKey: 'A11Y',
            jiraToken: 'jira-basic',
            jiraIssueType: 'Bug',
            linearApiKey: 'lin_api_test',
            linearTeamId: 'team_123'
          }
        }
      }
    });

    window.a11ytb.logActivity('Essai webhook', { module: 'activity' });

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    const calls = fetchMock.mock.calls;
    const [webhookUrl, webhookOptions] = calls[0];
    expect(webhookUrl).toBe('https://example.test/hook');
    expect(webhookOptions.headers['Authorization']).toBe('Bearer token-123');
    const webhookPayload = JSON.parse(webhookOptions.body);
    expect(webhookPayload.event).toBe('a11ytb.activity.entry');

    const [jiraUrl, jiraOptions] = calls[1];
    expect(jiraUrl).toBe('https://jira.example.test/rest/api/3/issue');
    const jiraBody = JSON.parse(jiraOptions.body);
    expect(jiraBody.fields.project.key).toBe('A11Y');
    expect(jiraOptions.headers.Authorization).toBe('Basic jira-basic');

    const [linearUrl, linearOptions] = calls[2];
    expect(linearUrl).toBe('https://api.linear.app/rest/issues');
    expect(linearOptions.headers.Authorization).toBe('lin_api_test');

    const [slackUrl, slackOptions] = calls[3];
    expect(slackUrl).toBe('https://hooks.slack.test/T123');
    expect(slackOptions.method).toBe('POST');

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
      expect(entries.some((entry) => entry.message.includes('Échec d’envoi de la synchronisation'))).toBe(true);
      const syncs = state.get('collaboration.syncs');
      expect(syncs.some((entry) => entry.status === 'error')).toBe(true);
    });

    const sendButton = root.querySelector('[data-action="activity-send-sync"]');
    expect(sendButton).toBeTruthy();
    sendButton.click();

    await vi.waitFor(() => {
      expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3);
    });

    const retryPayload = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(retryPayload.event).toBe('a11ytb.activity.entry');
    const lastCall = fetchMock.mock.calls.at(-1);
    const bulkPayload = JSON.parse(lastCall[1].body);
    expect(bulkPayload.event).toBe('a11ytb.activity.bulk');
    expect(Array.isArray(bulkPayload.entries)).toBe(true);
    expect(bulkPayload.entries.length).toBeGreaterThan(0);

    const syncs = state.get('collaboration.syncs');
    expect(syncs[0].status).toBe('success');
    expect(syncs.some((entry) => entry.status === 'queued')).toBe(true);
  });
});
