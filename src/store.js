export function createStore(key, initial) {
  const subs = new Set();
  let state = load() ?? initial;

  function load() {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }
  function persist() {
    try { localStorage.setItem(key, JSON.stringify(state)); } catch {}
  }

  const api = {
    get(path) {
      if (!path) return structuredClone(state);
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
      subs.forEach(fn => fn(structuredClone(state)));
    },
    tx(patch) {
      state = { ...state, ...patch };
      persist();
      subs.forEach(fn => fn(structuredClone(state)));
    },
    on(fn) { subs.add(fn); return () => subs.delete(fn); },
    reset() { state = structuredClone(initial); persist(); subs.forEach(fn => fn(structuredClone(state))); },
    serialize() { return JSON.stringify(state, null, 2); }
  };
  if (!window.a11ytb) window.a11ytb = {};
  window.a11ytb.state = api;
  return api;
}
