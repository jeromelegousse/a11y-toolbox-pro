import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createStore } from '../src/store.js';

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

  beforeEach(() => {
    const storage = new MemoryStorage();
    globalThis.localStorage = storage;
    globalThis.window = { a11ytb: {} };
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
});
