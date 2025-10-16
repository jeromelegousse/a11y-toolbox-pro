import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createStore } from '../src/store.js';
import { createDefaultAudioState } from '../src/audio-config.js';
import { setupAudioFeedback } from '../src/audio-feedback.js';
import { createFeedback } from '../src/feedback.js';

class MemoryStorage {
  constructor() {
    this.map = new Map();
  }

  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }

  setItem(key, value) {
    this.map.set(key, String(value));
  }

  removeItem(key) {
    this.map.delete(key);
  }

  clear() {
    this.map.clear();
  }
}

describe('setupAudioFeedback', () => {
  const STORE_KEY = 'a11ytb:audio-feedback:test';
  const RAAG_PROFILE = {
    name: 'RAAG - Réponse Audio Alerte Généralisée',
    settings: {
      'audio.theme': 'soft',
      'audio.volume': 0.42,
      'audio.events.alert.sound': 'alert',
      'audio.events.warning.sound': 'warning',
      'audio.events.success.sound': 'confirm',
      'audio.events.info.sound': 'toggle'
    }
  };

  let originalWindow;
  let store;
  let feedback;
  let unsubscribe;

  beforeEach(() => {
    originalWindow = globalThis.window;
    globalThis.window = { a11ytb: {} };
    globalThis.localStorage = new MemoryStorage();
    store = createStore(STORE_KEY, {
      audio: createDefaultAudioState(),
      profiles: {
        raag: RAAG_PROFILE
      }
    });
    feedback = createFeedback();
    unsubscribe = setupAudioFeedback({ state: store, feedback });
  });

  afterEach(() => {
    unsubscribe?.();
    store?.reset?.();
    if (originalWindow) {
      globalThis.window = originalWindow;
    } else {
      delete globalThis.window;
    }
    delete globalThis.localStorage;
  });

  it('applique le profil RAAG et propage le thème et le volume à feedback', () => {
    const profile = store.get('profiles.raag');
    Object.entries(profile.settings).forEach(([path, value]) => {
      store.set(path, value);
    });

    const config = feedback.getConfig();

    expect(config.theme).toBe('soft');
    expect(config.volume).toBeCloseTo(0.42, 2);
  });

  it("clone la configuration des événements même sans 'structuredClone'", () => {
    const originalStructuredClone = globalThis.structuredClone;
    try {
      try {
        delete globalThis.structuredClone;
      } catch (error) {
        globalThis.structuredClone = undefined;
      }

      const instance = createFeedback();
      const configA = instance.getConfig();
      const configB = instance.getConfig();

      expect(configA.events).toBeDefined();
      expect(configB.events).toBeDefined();
      expect(configA.events).not.toBe(configB.events);
      expect(configA.events.alert).not.toBe(configB.events.alert);

      configA.events.alert.enabled = false;
      expect(configB.events.alert.enabled).toBe(true);
      expect(instance.getConfig().events.alert.enabled).toBe(true);
    } finally {
      if (originalStructuredClone === undefined) {
        delete globalThis.structuredClone;
      } else {
        globalThis.structuredClone = originalStructuredClone;
      }
    }
  });
});
