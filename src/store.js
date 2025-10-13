const globalScope = typeof globalThis !== 'undefined' ? globalThis : window;
const hasStructuredClone = Boolean(globalScope && typeof globalScope.structuredClone === 'function');

export function safeClone(value) {
  if (hasStructuredClone) {
    return globalScope.structuredClone(value);
  }
  if (value === undefined || value === null) {
    return value;
  }
  if (typeof value !== 'object') {
    return value;
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    console.warn('a11ytb: clonage approximatif utilisé (structuredClone indisponible).', error);
    return Array.isArray(value) ? value.slice() : { ...value };
  }
}

export function createStore(key, initial) {
  const subs = new Set();
  let state = load() ?? safeClone(initial);

  function load() {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      console.warn('a11ytb: impossible de charger l’état depuis le stockage local.', error);
      return null;
    }
  }
  function persist() {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch (error) {
      console.warn('a11ytb: impossible d’enregistrer l’état.', error);
    }
  }

  const api = {
    get(path) {
      if (!path) return safeClone(state);
      return path.split('.').reduce((acc, k) => acc?.[k], state);
    },
    set(path, value) {
      if (!path) return;
      const keys = path.split('.');
      let ref = state;
      for (let i = 0; i < keys.length - 1; i++) {
        const k = keys[i];
        if (typeof ref[k] !== 'object' || ref[k] === null) ref[k] = {};
        ref = ref[k];
      }
      ref[keys.at(-1)] = value;
      persist();
      subs.forEach(fn => fn(safeClone(state)));
    },
    tx(patch) {
      state = { ...state, ...patch };
      persist();
      subs.forEach(fn => fn(safeClone(state)));
    },
    on(fn) { subs.add(fn); return () => subs.delete(fn); },
    reset() { state = safeClone(initial); persist(); subs.forEach(fn => fn(safeClone(state))); },
    serialize() { return JSON.stringify(state, null, 2); }
  };
  if (!window.a11ytb) window.a11ytb = {};
  window.a11ytb.state = api;
  return api;
}
