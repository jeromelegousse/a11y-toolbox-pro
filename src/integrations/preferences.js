const allowedKeys = new Set(['ui', 'profiles', 'audio', 'tts', 'audit', 'collaboration']);

function deepClone(value) {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch (error) {
      /* fall through */
    }
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    return null;
  }
}

function sanitizeSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    return {};
  }
  const cleaned = {};
  allowedKeys.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(snapshot, key)) {
      const cloned = deepClone(snapshot[key]);
      if (cloned !== null && cloned !== undefined) {
        cleaned[key] = cloned;
      }
    }
  });
  return cleaned;
}

function computeHash(payload) {
  try {
    return JSON.stringify(payload);
  } catch (error) {
    return null;
  }
}

export function createPreferenceSync({
  state,
  config = {},
  fetchFn = typeof globalThis?.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null,
  debounceMs = 3000,
  onError,
} = {}) {
  if (!config?.enabled) {
    return null;
  }

  if (!state || typeof state.get !== 'function' || typeof state.tx !== 'function') {
    return null;
  }

  const endpoint = typeof config.endpoint === 'string' ? config.endpoint.trim() : '';
  if (!endpoint || typeof fetchFn !== 'function') {
    return null;
  }

  const nonce = typeof config.nonce === 'string' ? config.nonce : '';
  const delay = Number.isFinite(debounceMs) && debounceMs > 0 ? debounceMs : 3000;

  let timer = null;
  let disposed = false;
  let applyingRemote = false;
  let unsubscribe = null;
  let lastHash = null;

  function handleError(error) {
    if (typeof onError === 'function') {
      try {
        onError(error);
        return;
      } catch (callbackError) {
        console.warn('a11ytb: erreur lors du rappel de synchronisation préférences.', callbackError);
      }
    }
    if (error) {
      console.warn('a11ytb: échec de synchronisation des préférences.', error);
    }
  }

  function applyRemoteSnapshot(snapshot) {
    const sanitized = sanitizeSnapshot(snapshot);
    if (!Object.keys(sanitized).length) {
      return;
    }
    applyingRemote = true;
    try {
      state.tx(sanitized);
    } finally {
      applyingRemote = false;
    }
    lastHash = computeHash(sanitizeSnapshot(state.get()));
  }

  async function pushSnapshot({ force = false } = {}) {
    if (disposed) {
      return;
    }

    if (timer) {
      clearTimeout(timer);
      timer = null;
    }

    const snapshot = sanitizeSnapshot(state.get());
    if (!Object.keys(snapshot).length) {
      return;
    }

    const hash = computeHash(snapshot);
    if (!force && hash && hash === lastHash) {
      return;
    }

    const headers = { 'Content-Type': 'application/json' };
    if (nonce) {
      headers['X-WP-Nonce'] = nonce;
    }

    let response;
    try {
      response = await fetchFn(endpoint, {
        method: 'PUT',
        credentials: 'same-origin',
        headers,
        body: JSON.stringify({ snapshot }),
      });
    } catch (error) {
      handleError(error);
      return;
    }

    if (!response || !response.ok) {
      handleError(response ? new Error(`HTTP ${response.status}`) : new Error('Invalid response'));
      return;
    }

    try {
      const data = await response.json();
      if (data && typeof data === 'object' && data.snapshot) {
        applyRemoteSnapshot(data.snapshot);
        return;
      }
    } catch (error) {
      /* absence de payload JSON valide : ignorer */
    }

    lastHash = hash;
  }

  function scheduleSync() {
    if (disposed) {
      return;
    }
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = null;
      pushSnapshot().catch(handleError);
    }, delay);
  }

  function start() {
    if (disposed || unsubscribe) {
      return;
    }

    if (config.snapshot && typeof config.snapshot === 'object') {
      applyRemoteSnapshot(config.snapshot);
    }

    lastHash = computeHash(sanitizeSnapshot(state.get()));

    const handler = () => {
      if (applyingRemote) {
        return;
      }
      scheduleSync();
    };

    unsubscribe = typeof state.on === 'function' ? state.on(handler) : null;
  }

  function stop() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (unsubscribe) {
      try {
        unsubscribe();
      } catch (error) {
        /* ignore */
      }
      unsubscribe = null;
    }
  }

  function dispose() {
    if (disposed) {
      return;
    }
    stop();
    disposed = true;
  }

  start();

  return {
    start,
    stop,
    dispose,
    flush: (options) => pushSnapshot(options),
    isRunning: () => !disposed,
  };
}
