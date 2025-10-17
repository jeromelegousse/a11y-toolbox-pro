const ALLOWED_KEYS = [
  'ui',
  'audio',
  'contrast',
  'spacing',
  'tts',
  'stt',
  'braille',
  'profiles',
  'collaboration',
];

function clone(value) {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch (error) {
      /* ignore structuredClone failure */
    }
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    return value;
  }
}

function extractSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    return {};
  }
  const result = {};
  ALLOWED_KEYS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(snapshot, key)) {
      result[key] = clone(snapshot[key]);
    }
  });
  return result;
}

function applyPreferences(state, data) {
  if (!state || typeof state.set !== 'function' || !data || typeof data !== 'object') {
    return;
  }
  ALLOWED_KEYS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      try {
        state.set(key, clone(data[key]));
      } catch (error) {
        console.warn('a11ytb: impossible d’appliquer la clé de préférences', key, error);
      }
    }
  });
}

export function createPreferenceSync({
  state,
  endpoint,
  nonce = '',
  throttleMs = 4000,
  fetchImpl = null,
} = {}) {
  if (!state || typeof state.on !== 'function' || typeof state.get !== 'function') {
    return null;
  }

  const url = typeof endpoint === 'string' ? endpoint.trim() : '';
  if (!url) {
    return null;
  }

  const fetchFn = fetchImpl || (typeof fetch === 'function' ? fetch.bind(window) : null);
  if (typeof fetchFn !== 'function') {
    return null;
  }

  let applying = false;
  let timer = null;
  let stopped = false;
  let unsubscribe = null;
  let pendingPayload = null;
  let lastSignature = '';

  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (nonce) {
    headers['X-WP-Nonce'] = nonce;
  }

  function signature(payload) {
    try {
      return JSON.stringify(payload);
    } catch (error) {
      return '';
    }
  }

  async function send(payload) {
    if (!payload) {
      return;
    }
    try {
      const response = await fetchFn(url, {
        method: 'POST',
        headers,
        credentials: 'same-origin',
        body: JSON.stringify(payload),
      });
      if (response?.ok) {
        lastSignature = signature(payload);
        pendingPayload = null;
      }
    } catch (error) {
      console.warn('a11ytb: échec de la synchronisation des préférences', error);
    }
  }

  async function flush() {
    if (pendingPayload) {
      await send(pendingPayload);
    }
  }

  function schedule(snapshot) {
    if (stopped) {
      return;
    }
    const data = extractSnapshot(snapshot);
    const payload = {
      data,
      meta: { updatedAt: Date.now() },
    };
    const sig = signature(payload);
    if (!sig || sig === lastSignature) {
      return;
    }
    pendingPayload = payload;
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = null;
      flush().catch(() => {});
    }, Math.max(500, Number(throttleMs) || 0));
  }

  async function load() {
    try {
      const response = await fetchFn(url, {
        method: 'GET',
        headers,
        credentials: 'same-origin',
      });
      if (!response?.ok || typeof response.json !== 'function') {
        return;
      }
      const data = await response.json();
      if (!data || typeof data !== 'object') {
        return;
      }
      const payload = {
        data: extractSnapshot(data.data ?? {}),
        meta: {
          updatedAt: Number.isFinite(data?.meta?.updatedAt)
            ? Number(data.meta.updatedAt)
            : Date.now(),
        },
      };
      applying = true;
      try {
        applyPreferences(state, payload.data);
        lastSignature = signature(payload);
      } finally {
        applying = false;
      }
    } catch (error) {
      console.warn('a11ytb: impossible de charger les préférences distantes', error);
    }
  }

  unsubscribe = state.on((nextState) => {
    if (applying || stopped) {
      return;
    }
    schedule(nextState);
  });

  load().catch(() => {});

  return {
    flush,
    stop() {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    },
  };
}

export default createPreferenceSync;
