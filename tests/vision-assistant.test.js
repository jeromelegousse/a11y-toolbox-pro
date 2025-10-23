import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __testables } from '../src/modules/vision-assistant.js';

const {
  resolveIntegrationConfig,
  performAnalysis,
  setStore,
  reset,
} = __testables;

function createStore(initialState) {
  let state = JSON.parse(JSON.stringify(initialState));
  const listeners = new Set();

  return {
    get(path) {
      if (!path) {
        return state;
      }
      return path.split('.').reduce((acc, key) => (acc ? acc[key] : undefined), state);
    },
    set(path, value) {
      if (!path) {
        state = value;
      } else {
        const keys = path.split('.');
        let target = state;
        while (keys.length > 1) {
          const key = keys.shift();
          if (!Object.prototype.hasOwnProperty.call(target, key) || typeof target[key] !== 'object') {
            target[key] = {};
          }
          target = target[key];
        }
        target[keys[0]] = value;
      }
      listeners.forEach((listener) => {
        try {
          listener(state);
        } catch (error) {
          console.warn('vision-assistant test listener error', error);
        }
      });
    },
    on(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

describe('vision-assistant module', () => {
  const originalConfig = window.a11ytbPluginConfig;
  const originalFetch = global.fetch;
  const originalAlert = window.alert;
  const originalA11y = window.a11ytb;

  beforeEach(() => {
    window.a11ytbPluginConfig = {
      integrations: {
        vision: {
          endpoint: '/wp-json/a11ytb/v1/vision',
          nonce: 'demo-nonce',
          engines: ['llava-local', 'llava', 'llava'],
          defaultEngine: 'llava-local',
        },
      },
    };
    window.a11ytb = {
      feedback: { play: vi.fn() },
      logActivity: vi.fn(),
    };
    window.alert = vi.fn();
    reset();
  });

  afterEach(() => {
    window.a11ytbPluginConfig = originalConfig;
    window.alert = originalAlert;
    window.a11ytb = originalA11y;
    if (originalFetch) {
      global.fetch = originalFetch;
    } else {
      delete global.fetch;
    }
    reset();
  });

  it('normalise la configuration d’intégration et le moteur par défaut', () => {
    const config = resolveIntegrationConfig();
    expect(config.endpoint).toBe('/wp-json/a11ytb/v1/vision');
    expect(config.nonce).toBe('demo-nonce');
    expect(config.engines).toEqual(['llava-local', 'llava']);
    expect(config.defaultEngine).toBe('llava-local');
  });

  it('sélectionne le moteur adéquat avant une analyse', async () => {
    const store = createStore({
      visionAssistant: {
        prompt: '',
        lastResponse: '',
        status: 'idle',
        engine: 'invalide',
        error: null,
        lastUrl: '',
        availableEngines: [],
      },
    });
    setStore(store);

    const json = vi.fn().mockResolvedValue({ text: 'Réponse de test' });
    const response = {
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json,
      text: vi.fn(),
      status: 200,
      statusText: 'OK',
    };

    const fetchMock = vi.fn().mockResolvedValue(response);
    global.fetch = fetchMock;

    const result = await performAnalysis({
      url: 'https://example.com/image.jpg',
      prompt: 'Décrire la scène',
    });

    expect(result.text).toBe('Réponse de test');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [endpoint, options] = fetchMock.mock.calls[0];
    expect(endpoint).toBe('/wp-json/a11ytb/v1/vision');
    expect(options.method).toBe('POST');

    const formData = options.body;
    const entries = Array.from(formData.entries());
    const engineEntry = entries.find(([key]) => key === 'engine');
    expect(engineEntry?.[1]).toBe('llava-local');
    expect(store.get('visionAssistant.engine')).toBe('llava-local');
  });
});
