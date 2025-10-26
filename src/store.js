const globalScope =
  typeof globalThis !== 'undefined'
    ? globalThis
    : typeof window !== 'undefined'
      ? window
      : undefined;

const structuredCloneFn =
  typeof globalScope?.structuredClone === 'function'
    ? globalScope.structuredClone.bind(globalScope)
    : null;

let hasWarnedFallback = false;

function warnFallback(detail) {
  if (!hasWarnedFallback) {
    console.warn('a11ytb: clonage approximatif utilisé (structuredClone indisponible).', detail);
    hasWarnedFallback = true;
  }
}

function cloneWithFallback(value, seen = new WeakMap()) {
  if (value === null || value === undefined || typeof value !== 'object') {
    return value;
  }

  if (seen.has(value)) {
    return seen.get(value);
  }

  if (value instanceof Date) {
    return new Date(value.getTime());
  }

  if (value instanceof RegExp) {
    return new RegExp(value.source, value.flags);
  }

  if (value instanceof Map) {
    const result = new Map();
    seen.set(value, result);
    value.forEach((entryValue, key) => {
      result.set(cloneWithFallback(key, seen), cloneWithFallback(entryValue, seen));
    });
    return result;
  }

  if (value instanceof Set) {
    const result = new Set();
    seen.set(value, result);
    value.forEach((item) => {
      result.add(cloneWithFallback(item, seen));
    });
    return result;
  }

  if (ArrayBuffer.isView(value)) {
    if (typeof value.slice === 'function') {
      return value.slice();
    }
    warnFallback(value);
    return value;
  }

  if (Array.isArray(value)) {
    const result = [];
    seen.set(value, result);
    value.forEach((item, index) => {
      result[index] = cloneWithFallback(item, seen);
    });
    return result;
  }

  const proto = Object.getPrototypeOf(value);
  if (proto === Object.prototype || proto === null) {
    const result = {};
    seen.set(value, result);
    Object.keys(value).forEach((key) => {
      result[key] = cloneWithFallback(value[key], seen);
    });
    return result;
  }

  warnFallback(value);
  return value;
}

export function cloneValue(value) {
  if (structuredCloneFn) {
    return structuredCloneFn(value);
  }
  return cloneWithFallback(value);
}

export function createStore(key, initial, options = {}) {
  const { storage: providedStorage, global: providedGlobal } = options;
  const storage =
    providedStorage ??
    (typeof globalScope?.localStorage !== 'undefined' ? globalScope.localStorage : null);
  const hasStorage = Boolean(
    storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function'
  );

  function load() {
    if (!hasStorage) {
      return null;
    }
    try {
      const raw = storage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        delete parsed.runtime;
      }
      return parsed;
    } catch (error) {
      console.warn('a11ytb: impossible de charger l’état depuis le stockage local.', error);
      return null;
    }
  }

  function persist() {
    if (!hasStorage) {
      return;
    }
    try {
      const snapshot = cloneValue(state);
      if (snapshot && typeof snapshot === 'object') {
        if (
          initial &&
          typeof initial === 'object' &&
          Object.prototype.hasOwnProperty.call(initial, 'runtime')
        ) {
          snapshot.runtime = cloneValue(initial.runtime);
        } else {
          delete snapshot.runtime;
        }
      }
      storage.setItem(key, JSON.stringify(snapshot));
    } catch (error) {
      console.warn('a11ytb: impossible d’enregistrer l’état.', error);
    }
  }

  const subs = new Set();
  const loaded = load();
  let state = cloneValue(initial);
  if (loaded && typeof loaded === 'object') {
    state = { ...state, ...loaded };
  }

  const api = {
    get(path) {
      if (!path) return cloneValue(state);
      const value = path.split('.').reduce((acc, k) => acc?.[k], state);
      return cloneValue(value);
    },
    set(path, value) {
      if (!path) return;
      const keys = path.split('.');
      let ref = state;
      const shouldPersist = keys[0] !== 'runtime';
      for (let i = 0; i < keys.length - 1; i++) {
        const k = keys[i];
        if (typeof ref[k] !== 'object' || ref[k] === null) ref[k] = {};
        ref = ref[k];
      }
      ref[keys.at(-1)] = value;
      if (shouldPersist) {
        persist();
      }
      subs.forEach((fn) => fn(cloneValue(state)));
    },
    tx(patch) {
      state = { ...state, ...patch };
      persist();
      subs.forEach((fn) => fn(cloneValue(state)));
    },
    on(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    reset() {
      state = cloneValue(initial);
      persist();
      subs.forEach((fn) => fn(cloneValue(state)));
    },
    serialize() {
      return JSON.stringify(state, null, 2);
    },
  };

  const exposeTargets = [
    providedGlobal,
    typeof window !== 'undefined' ? window : null,
    globalScope && typeof globalScope.window === 'object' ? globalScope.window : null,
  ];
  const target = exposeTargets.find((candidate) => candidate && typeof candidate === 'object');
  if (target) {
    if (!target.a11ytb || typeof target.a11ytb !== 'object') {
      target.a11ytb = {};
    }
    target.a11ytb.state = api;
  }

  return api;
}
