import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

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

describe('createStore', () => {
  const KEY = 'a11ytb:test';
  const makeInitialState = () => ({ foo: 'bar', nested: { value: 1 } });
  const originalStructuredClone = globalThis.structuredClone;
  let createStore;

  async function importStore(options = {}) {
    vi.resetModules();
    if (options.disableStructuredClone) {
      delete globalThis.structuredClone;
    } else {
      globalThis.structuredClone = originalStructuredClone;
    }
    ({ createStore } = await import('../src/store.js'));
  }

  beforeEach(async () => {
    await importStore();
    globalThis.localStorage = new MemoryStorage();
    globalThis.window = { a11ytb: {} };
  });

  afterEach(() => {
    globalThis.structuredClone = originalStructuredClone;
  });

  it('expose l’API du store sur window.a11ytb.state', () => {
    const store = createStore(KEY, makeInitialState());

    expect(window.a11ytb.state).toBe(store);
  });

  it('retourne l’état initial quand le stockage est vide', () => {
    const initialState = makeInitialState();
    const store = createStore(KEY, initialState);

    expect(store.get()).toEqual(initialState);
  });

  it('charge l’état depuis le stockage local si disponible', () => {
    const persisted = { foo: 'persisted', nested: { value: 2 } };
    localStorage.setItem(KEY, JSON.stringify(persisted));

    const store = createStore(KEY, makeInitialState());

    expect(store.get()).toEqual(persisted);
  });

  it('renvoie un clone structuré pour get() afin de protéger l’état interne', () => {
    const store = createStore(KEY, makeInitialState());

    const snapshot = store.get();
    snapshot.foo = 'mutated';

    expect(store.get('foo')).toBe('bar');
  });

  it('met à jour des chemins imbriqués via set() et persiste la valeur', () => {
    const store = createStore(KEY, makeInitialState());

    store.set('nested.value', 42);

    expect(store.get('nested.value')).toBe(42);
    expect(JSON.parse(localStorage.getItem(KEY))).toEqual({
      foo: 'bar',
      nested: { value: 42 }
    });
  });

  it('fusionne les patchs avec tx()', () => {
    const store = createStore(KEY, makeInitialState());

    store.tx({ foo: 'baz', extra: true });

    expect(store.get()).toEqual({
      foo: 'baz',
      extra: true,
      nested: { value: 1 }
    });
  });

  it('notifie les abonnés avec une copie immuable et permet la désinscription', () => {
    const initialState = makeInitialState();
    const store = createStore(KEY, initialState);
    const listener = vi.fn();
    const unsubscribe = store.on(listener);

    store.set('foo', 'updated');

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({
      foo: 'updated',
      nested: { value: 1 }
    });

    unsubscribe();
    store.set('foo', 'after');

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('réinitialise l’état et le stockage via reset()', () => {
    const initialState = makeInitialState();
    const store = createStore(KEY, initialState);

    store.set('foo', 'changed');
    store.reset();

    expect(store.get()).toEqual(initialState);
    expect(JSON.parse(localStorage.getItem(KEY))).toEqual(initialState);
  });

  it('sérialise l’état courant en JSON formaté', () => {
    const store = createStore(KEY, makeInitialState());

    store.tx({ foo: 'serialized' });

    expect(store.serialize()).toBe(JSON.stringify({
      foo: 'serialized',
      nested: { value: 1 }
    }, null, 2));
  });

  it('continue de fonctionner quand window et localStorage sont absents', () => {
    const previousWindow = globalThis.window;
    const previousStorage = globalThis.localStorage;
    try {
      delete globalThis.window;
      delete globalThis.localStorage;

      const store = createStore(KEY, makeInitialState());

      expect(store.get()).toEqual(makeInitialState());
      expect(() => store.set('foo', 'stateless')).not.toThrow();
      expect(store.get('foo')).toBe('stateless');
    } finally {
      if (previousWindow === undefined) {
        delete globalThis.window;
      } else {
        globalThis.window = previousWindow;
      }
      if (previousStorage === undefined) {
        delete globalThis.localStorage;
      } else {
        globalThis.localStorage = previousStorage;
      }
    }
  });

  it('accepte un adaptateur de stockage injecté', () => {
    const previousStorage = globalThis.localStorage;
    delete globalThis.localStorage;

    const adapter = new MemoryStorage();
    const store = createStore(KEY, makeInitialState(), { storage: adapter });

    store.set('nested.value', 7);

    expect(JSON.parse(adapter.getItem(KEY))).toEqual({
      foo: 'bar',
      nested: { value: 7 }
    });

    if (previousStorage === undefined) {
      delete globalThis.localStorage;
    } else {
      globalThis.localStorage = previousStorage;
    }
  });

  it('préserve les structures complexes quand structuredClone est indisponible', async () => {
    await importStore({ disableStructuredClone: true });
    globalThis.localStorage = new MemoryStorage();
    globalThis.window = { a11ytb: {} };

    const initial = {
      foo: 'bar',
      nested: { value: 1 },
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      pattern: /test/gi,
      tags: new Set(['a', { deep: true }]),
      entries: new Map([
        ['first', { ready: true }]
      ]),
      bytes: new Uint8Array([1, 2, 3])
    };

    const store = createStore(KEY, initial);
    const snapshot = store.get();

    expect(snapshot).not.toBe(initial);
    expect(snapshot.createdAt).toBeInstanceOf(Date);
    expect(snapshot.createdAt.getTime()).toBe(initial.createdAt.getTime());
    expect(snapshot.pattern).toBeInstanceOf(RegExp);
    expect(snapshot.pattern.source).toBe('test');
    expect(snapshot.pattern.flags).toBe('gi');
    expect(snapshot.tags).toBeInstanceOf(Set);
    expect(snapshot.tags).not.toBe(initial.tags);
    const [, nestedEntry] = [...snapshot.tags];
    expect(nestedEntry).toEqual({ deep: true });
    expect(snapshot.entries).toBeInstanceOf(Map);
    expect(snapshot.entries).not.toBe(initial.entries);
    expect(snapshot.entries.get('first')).toEqual({ ready: true });
    expect(snapshot.bytes).toBeInstanceOf(Uint8Array);
    expect(snapshot.bytes).not.toBe(initial.bytes);

    snapshot.nested.value = 99;
    snapshot.bytes[0] = 9;

    expect(store.get('nested.value')).toBe(1);
    expect(store.get('bytes')[0]).toBe(1);
  });
});
