import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const registeredModules = [];

vi.mock('../src/registry.js', () => ({
  registerModule: (definition) => {
    registeredModules.push(definition);
    return definition;
  },
}));

function createMockState(initial = {}) {
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

describe('module audio-feedback', () => {
  let configureSpy;
  let moduleDef;
  let state;

  beforeEach(async () => {
    registeredModules.length = 0;
    vi.resetModules();
    configureSpy = vi.fn();
    globalThis.window = { a11ytb: { feedback: { configure: configureSpy } } };
    await import('../src/modules/audio-feedback.js');
    moduleDef = registeredModules.at(-1);
    expect(moduleDef).toBeTruthy();
    state = createMockState({});
    moduleDef.init({ state });
    moduleDef.mount({ state });
  });

  afterEach(() => {
    moduleDef?.unmount?.();
    configureSpy?.mockReset();
  });

  it('met à jour feedback.configure quand on bascule alert.enabled', () => {
    expect(configureSpy).toHaveBeenCalled();
    const initialSignature = JSON.stringify(configureSpy.mock.calls.at(-1)[0]);

    state.set('audio.events.alert.enabled', false);

    expect(configureSpy.mock.calls.length).toBeGreaterThan(1);
    const payload = configureSpy.mock.calls.at(-1)[0];
    const updatedSignature = JSON.stringify(payload);

    expect(updatedSignature).not.toBe(initialSignature);
    expect(payload.events.alert.enabled).toBe(false);
  });

  it('met à jour feedback.configure quand le son change', () => {
    expect(configureSpy).toHaveBeenCalled();
    const initialSignature = JSON.stringify(configureSpy.mock.calls.at(-1)[0]);

    state.set('audio.events.warning.sound', 'toggle');

    expect(configureSpy.mock.calls.length).toBeGreaterThan(1);
    const payload = configureSpy.mock.calls.at(-1)[0];
    const updatedSignature = JSON.stringify(payload);

    expect(updatedSignature).not.toBe(initialSignature);
    expect(payload.events.warning.sound).toBe('toggle');
  });
});
