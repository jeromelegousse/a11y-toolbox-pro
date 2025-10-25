import { registerModule } from '../registry.js';
import { manifest } from './vision-assistant.manifest.js';

export { manifest };

const DEFAULT_STATE = manifest?.defaults?.state?.visionAssistant || {
  prompt: '',
  lastResponse: '',
  status: 'idle',
  engine: 'llava-local',
  error: null,
  lastUrl: '',
  availableEngines: [],
};

function cloneState(value) {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch (error) {
      console.warn('a11ytb: structuredClone a échoué pour vision-assistant.', error);
    }
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    console.warn('a11ytb: clonage JSON impossible pour vision-assistant.', error);
    return value;
  }
}

const STATUS_MESSAGES = {
  idle: 'Prêt pour une nouvelle analyse.',
  loading: 'Analyse en cours…',
  ready: 'Analyse terminée.',
  error: 'Analyse impossible.',
  unconfigured: 'Service non configuré.',
};

function getDefaultPrompt() {
  return DEFAULT_STATE.prompt || '';
}

function getDefaultEngine() {
  return DEFAULT_STATE.engine || 'llava-local';
}

function ensureStateDefaults(state) {
  const current = state.get('visionAssistant');
  if (!current || typeof current !== 'object') {
    state.set('visionAssistant', cloneState(DEFAULT_STATE));
    return;
  }
  const next = { ...DEFAULT_STATE, ...current };
  const changed = Object.keys(next).some((key) => next[key] !== current[key]);
  if (changed) {
    state.set('visionAssistant', next);
  }
}

function resolveIntegrationConfig() {
  const config = window.a11ytbPluginConfig?.integrations || {};
  const integration = config.visionAssistant || config['vision-assistant'] || config.vision || {};
  const endpoint = typeof integration.endpoint === 'string' ? integration.endpoint.trim() : '';
  const nonce = typeof integration.nonce === 'string' ? integration.nonce : '';
  const engines = Array.isArray(integration.engines)
    ? [
        ...new Set(
          integration.engines
            .map((value) => (typeof value === 'string' ? value.trim() : ''))
            .filter(Boolean)
        ),
      ]
    : [];
  const defaultEngineRaw =
    typeof integration.defaultEngine === 'string' ? integration.defaultEngine.trim() : '';
  const defaultEngine = defaultEngineRaw && engines.includes(defaultEngineRaw)
    ? defaultEngineRaw
    : '';
  return { endpoint, nonce, engines, defaultEngine };
}

function formatStatus(status, error) {
  if (status === 'error' && error) {
    return `Erreur : ${error}`;
  }
  return STATUS_MESSAGES[status] || STATUS_MESSAGES.idle;
}

function formatEngineLabel(engine) {
  if (!engine) {
    return '';
  }
  const knownLabels = {
    'llava-local': 'LLaVA local',
    llava: 'LLaVA distant',
    'openai-gpt4o': 'OpenAI GPT-4o',
    'google-gemini': 'Google Gemini Vision',
    moondream: 'Moondream',
  };
  if (knownLabels[engine]) {
    return knownLabels[engine];
  }
  return engine
    .split('-')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function playFeedback(tone) {
  try {
    window.a11ytb?.feedback?.play?.(tone);
  } catch (error) {
    console.warn('a11ytb: lecture feedback impossible pour le module vision.', error);
  }
}

let store = null;
let activeRequestId = 0;

function arraysEqual(left, right) {
  if (left === right) return true;
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

function updateVisionState(key, value) {
  if (!store) return;
  const path = `visionAssistant.${key}`;
  const current = store.get(path);
  if (Array.isArray(value)) {
    if (arraysEqual(current, value)) {
      return;
    }
  } else if (current === value) {
    return;
  }
  store.set(path, value);
}

async function performAnalysis({ file, url, prompt, engine, source } = {}) {
  if (!store) {
    throw new Error('Store non initialisé.');
  }

  const config = resolveIntegrationConfig();
  const availableEngines = Array.isArray(config.engines) ? [...config.engines] : [];
  if (availableEngines.length) {
    updateVisionState('availableEngines', availableEngines);
  } else {
    updateVisionState('availableEngines', DEFAULT_STATE.availableEngines || []);
  }
  if (!config.endpoint) {
    const message =
      'Le proxy WordPress pour l’assistant visuel n’est pas configuré. Contactez un administrateur.';
    updateVisionState('status', 'unconfigured');
    updateVisionState('error', message);
    playFeedback('alert');
    if (typeof window !== 'undefined' && typeof window.alert === 'function') {
      // eslint-disable-next-line no-alert
      window.alert(`Assistant visuel : ${message}`);
    }
    window.a11ytb?.logActivity?.('Assistant visuel indisponible (endpoint manquant)', {
      module: manifest.id,
      tone: 'alert',
      tags: ['vision', 'assistant', 'configuration'],
    });
    throw new Error(message);
  }

  if (!file && !url) {
    const message = 'Aucun fichier ou URL fourni pour l’analyse visuelle.';
    playFeedback('alert');
    if (typeof window !== 'undefined' && typeof window.alert === 'function') {
      // eslint-disable-next-line no-alert
      window.alert(`Assistant visuel : ${message}`);
    }
    throw new Error(message);
  }

  const preparedPrompt =
    (prompt || '').trim() || store.get('visionAssistant.prompt') || getDefaultPrompt();
  const configDefaultEngine =
    config.defaultEngine && (!availableEngines.length || availableEngines.includes(config.defaultEngine))
      ? config.defaultEngine
      : availableEngines[0] || getDefaultEngine();
  let selectedEngine =
    (typeof engine === 'string' ? engine.trim() : '') ||
    (store.get('visionAssistant.engine') || '') ||
    '';

  if (!selectedEngine && configDefaultEngine) {
    selectedEngine = configDefaultEngine;
  }

  if (!selectedEngine) {
    selectedEngine = getDefaultEngine();
  }

  if (availableEngines.length && !availableEngines.includes(selectedEngine)) {
    const fallbackEngine = configDefaultEngine || availableEngines[0];
    if (selectedEngine && selectedEngine !== fallbackEngine) {
      window.a11ytb?.logActivity?.(
        `Moteur assistant visuel indisponible, remplacement par ${fallbackEngine}`,
        {
          module: manifest.id,
          tone: 'info',
          tags: ['vision', 'assistant', 'engine', 'fallback'],
        }
      );
    }
    selectedEngine = fallbackEngine;
  }

  updateVisionState('prompt', preparedPrompt);
  if (url) {
    updateVisionState('lastUrl', url);
  }
  if (selectedEngine) {
    updateVisionState('engine', selectedEngine);
  }
  updateVisionState('status', 'loading');
  updateVisionState('error', null);

  const requestId = ++activeRequestId;

  window.a11ytb?.logActivity?.('Analyse visuelle démarrée', {
    module: manifest.id,
    tone: 'info',
    tags: ['vision', 'assistant', source || (file ? 'upload' : 'url'), selectedEngine].filter(
      Boolean
    ),
  });

  const formData = new FormData();
  formData.append('prompt', preparedPrompt);
  if (selectedEngine) {
    formData.append('engine', selectedEngine);
  }
  if (file) {
    formData.append('file', file, file.name || 'image');
  }
  if (url) {
    formData.append('url', url);
  }

  const headers = {
    Accept: 'application/json',
  };
  if (config.nonce) {
    headers['X-WP-Nonce'] = config.nonce;
  }

  if (typeof fetch !== 'function') {
    const message = 'L’API fetch n’est pas disponible dans ce navigateur.';
    updateVisionState('status', 'error');
    updateVisionState('error', message);
    playFeedback('alert');
    throw new Error(message);
  }

  try {
    const response = await fetch(config.endpoint, {
      method: 'POST',
      credentials: 'same-origin',
      headers,
      body: formData,
    });

    const contentType = response.headers.get('content-type') || '';
    let payload;
    if (contentType.includes('application/json')) {
      payload = await response.json();
    } else {
      const text = await response.text();
      try {
        payload = JSON.parse(text);
      } catch (error) {
        payload = { text };
      }
    }

    if (!response.ok || payload?.success === false) {
      const message =
        payload?.message ||
        payload?.error ||
        `Échec de l’analyse (${response.status} ${response.statusText})`;
      throw new Error(message);
    }

    const textResult =
      typeof payload?.text === 'string'
        ? payload.text
        : typeof payload?.result === 'string'
          ? payload.result
          : typeof payload?.result?.text === 'string'
            ? payload.result.text
            : typeof payload?.data?.text === 'string'
              ? payload.data.text
              : '';

    const cleaned = (textResult || '').trim();
    if (!cleaned) {
      throw new Error('La réponse du service vision est vide.');
    }

    if (requestId === activeRequestId) {
      updateVisionState('lastResponse', cleaned);
      updateVisionState('status', 'ready');
      updateVisionState('error', null);
    }

    playFeedback('confirm');
    window.a11ytb?.logActivity?.('Analyse visuelle terminée', {
      module: manifest.id,
      tone: 'confirm',
      tags: ['vision', 'assistant', selectedEngine].filter(Boolean),
    });

    return { text: cleaned, payload };
  } catch (error) {
    if (requestId === activeRequestId) {
      const message = error?.message || 'Analyse visuelle impossible.';
      updateVisionState('status', 'error');
      updateVisionState('error', message);
    }
    playFeedback('alert');
    window.a11ytb?.logActivity?.(`Erreur assistant visuel : ${error?.message || 'inconnue'}`, {
      module: manifest.id,
      tone: 'alert',
      tags: ['vision', 'assistant', 'error'],
    });
    if (typeof window !== 'undefined' && typeof window.alert === 'function') {
      // eslint-disable-next-line no-alert
      window.alert(`Assistant visuel : ${error?.message || 'Analyse impossible.'}`);
    }
    throw error;
  }
}

function bindUI(elements = {}) {
  if (!store) {
    return () => {};
  }

  const {
    uploadForm,
    fetchForm,
    promptInput,
    urlInput,
    fileInput,
    responseNode,
    statusNode,
    uploadButton,
    fetchButton,
    engineSelect,
  } = elements;

  const listeners = [];
  const unsubscribers = [];

  const syncEngineControl = (visionState) => {
    if (!engineSelect) {
      return;
    }

    const engines = Array.isArray(visionState.availableEngines)
      ? visionState.availableEngines
      : [];
    const currentValues = Array.from(engineSelect.options || []).map((option) => option.value);
    const optionsChanged =
      engines.length !== currentValues.length ||
      engines.some((value, index) => currentValues[index] !== value);

    if (optionsChanged) {
      engineSelect.innerHTML = '';
      if (!engines.length) {
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Aucun moteur disponible';
        engineSelect.append(placeholder);
      } else {
        engines.forEach((value) => {
          const option = document.createElement('option');
          option.value = value;
          option.textContent = formatEngineLabel(value) || value;
          engineSelect.append(option);
        });
      }
    }

    const desiredEngine = visionState.engine || (engines.length ? engines[0] : '');
    if (engineSelect.value !== (desiredEngine || '')) {
      engineSelect.value = desiredEngine || '';
    }
  };

  const update = (snapshot) => {
    const visionState = snapshot?.visionAssistant || {};
    const { status, error, lastResponse, prompt, lastUrl } = visionState;
    const ready = Boolean(resolveIntegrationConfig().endpoint);
    if (statusNode) {
      const message = formatStatus(status, error);
      statusNode.textContent = message;
      if (message) {
        statusNode.removeAttribute('hidden');
      } else {
        statusNode.setAttribute('hidden', '');
      }
    }
    if (responseNode) {
      responseNode.textContent = lastResponse || 'Aucun résultat pour le moment.';
    }
    const isLoading = status === 'loading';
    if (uploadButton) {
      uploadButton.disabled = !ready || isLoading;
      if (ready && isLoading) {
        uploadButton.setAttribute('aria-busy', 'true');
      } else {
        uploadButton.removeAttribute('aria-busy');
      }
    }
    if (fetchButton) {
      fetchButton.disabled = !ready || isLoading;
      if (ready && isLoading) {
        fetchButton.setAttribute('aria-busy', 'true');
      } else {
        fetchButton.removeAttribute('aria-busy');
      }
    }
    if (engineSelect) {
      syncEngineControl(visionState);
      const engines = Array.isArray(visionState.availableEngines)
        ? visionState.availableEngines
        : [];
      engineSelect.disabled = !ready || engines.length <= 1;
    }
    if (promptInput && document.activeElement !== promptInput) {
      const nextPrompt = prompt ?? getDefaultPrompt();
      if (promptInput.value !== nextPrompt) {
        promptInput.value = nextPrompt;
      }
    }
    if (urlInput && document.activeElement !== urlInput) {
      const nextUrl = lastUrl ?? '';
      if (urlInput.value !== nextUrl) {
        urlInput.value = nextUrl;
      }
    }
  };

  unsubscribers.push(store.on(update));
  update(store.get());

  if (promptInput) {
    const onPromptInput = (event) => {
      updateVisionState('prompt', event.target.value || '');
    };
    promptInput.addEventListener('input', onPromptInput);
    listeners.push(() => promptInput.removeEventListener('input', onPromptInput));
  }

  if (engineSelect) {
    engineSelect.disabled = true;
    const onEngineChange = (event) => {
      const next = typeof event.target.value === 'string' ? event.target.value : '';
      updateVisionState('engine', next);
      window.a11ytb?.visionAssistant?.setEngine?.(next);
    };
    engineSelect.addEventListener('change', onEngineChange);
    listeners.push(() => engineSelect.removeEventListener('change', onEngineChange));
  }

  if (uploadForm) {
    const onSubmit = async (event) => {
      event.preventDefault();
      const file = fileInput?.files?.[0] || null;
      if (!file) {
        const message = 'Sélectionnez une image à analyser.';
        playFeedback('alert');
        if (typeof window !== 'undefined' && typeof window.alert === 'function') {
          // eslint-disable-next-line no-alert
          window.alert(`Assistant visuel : ${message}`);
        }
        return;
      }
      try {
        await performAnalysis({
          file,
          prompt: promptInput?.value,
          engine: store.get('visionAssistant.engine'),
          source: 'upload',
        });
        if (fileInput) {
          fileInput.value = '';
        }
      } catch (error) {
        // Erreurs déjà gérées par performAnalysis
      }
    };
    uploadForm.addEventListener('submit', onSubmit);
    listeners.push(() => uploadForm.removeEventListener('submit', onSubmit));
  }

  if (fetchForm) {
    const onSubmit = async (event) => {
      event.preventDefault();
      const url = urlInput?.value?.trim();
      if (!url) {
        const message = 'Saisissez l’URL d’une image à analyser.';
        playFeedback('alert');
        if (typeof window !== 'undefined' && typeof window.alert === 'function') {
          // eslint-disable-next-line no-alert
          window.alert(`Assistant visuel : ${message}`);
        }
        return;
      }
      try {
        await performAnalysis({
          url,
          prompt: promptInput?.value,
          engine: store.get('visionAssistant.engine'),
          source: 'url',
        });
      } catch (error) {
        // Erreurs déjà gérées par performAnalysis
      }
    };
    fetchForm.addEventListener('submit', onSubmit);
    listeners.push(() => fetchForm.removeEventListener('submit', onSubmit));
  }

  return () => {
    listeners.forEach((stop) => {
      try {
        stop();
      } catch (error) {
        console.warn('a11ytb: impossible de retirer un écouteur vision-assistant.', error);
      }
    });
    unsubscribers.forEach((unsubscribe) => {
      try {
        unsubscribe?.();
      } catch (error) {
        console.warn('a11ytb: impossible de se désabonner du store vision-assistant.', error);
      }
    });
  };
}

const visionAssistant = {
  id: manifest.id,
  manifest,
  init({ state }) {
    store = state;
    ensureStateDefaults(state);

    const config = resolveIntegrationConfig();
    const engines = Array.isArray(config.engines) ? config.engines : [];
    if (engines.length) {
      updateVisionState('availableEngines', engines);
      const currentEngine = state.get('visionAssistant.engine');
      const defaultEngine =
        config.defaultEngine && engines.includes(config.defaultEngine)
          ? config.defaultEngine
          : engines[0] || getDefaultEngine();
      if (!currentEngine || !engines.includes(currentEngine)) {
        updateVisionState('engine', defaultEngine);
      }
    } else if (config.defaultEngine) {
      const currentEngine = state.get('visionAssistant.engine');
      if (!currentEngine) {
        updateVisionState('engine', config.defaultEngine);
      }
    }

    const api = {
      analyzeFile(file, options = {}) {
        return performAnalysis({ file, ...options, source: options.source || 'upload' });
      },
      analyzeUrl(url, options = {}) {
        return performAnalysis({ url, ...options, source: options.source || 'url' });
      },
      bindUI,
      getStatus() {
        return store?.get('visionAssistant.status');
      },
      getState() {
        return store?.get('visionAssistant');
      },
      getIntegrationConfig: resolveIntegrationConfig,
      setEngine(value) {
        if (!store) {
          return '';
        }
        const requested = typeof value === 'string' ? value.trim() : '';
        const integration = resolveIntegrationConfig();
        const available = Array.isArray(integration.engines)
          ? integration.engines
          : store.get('visionAssistant.availableEngines') || [];
        const defaultEngine =
          integration.defaultEngine && (!available.length || available.includes(integration.defaultEngine))
            ? integration.defaultEngine
            : available[0] || getDefaultEngine();
        let nextEngine = requested || defaultEngine || getDefaultEngine();
        if (available.length && !available.includes(nextEngine)) {
          nextEngine = defaultEngine || available[0];
        }
        updateVisionState('engine', nextEngine);
        return nextEngine;
      },
    };

    if (!window.a11ytb) window.a11ytb = {};
    window.a11ytb.visionAssistant = api;
  },
};

export const __testables = {
  resolveIntegrationConfig,
  performAnalysis,
  ensureStateDefaults,
  updateVisionState,
  getDefaultEngine,
  getDefaultPrompt,
  formatEngineLabel,
  setStore(value) {
    store = value;
  },
  reset() {
    store = null;
    activeRequestId = 0;
  },
};

registerModule(visionAssistant);
