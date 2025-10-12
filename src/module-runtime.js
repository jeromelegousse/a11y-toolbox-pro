import { getModule, listBlocks } from './registry.js';

const FEATURE_CHECKS = {
  SpeechRecognition: () => {
    const scope = typeof window !== 'undefined' ? window : globalThis;
    if (!scope) return false;
    return 'SpeechRecognition' in scope || 'webkitSpeechRecognition' in scope;
  },
  SpeechSynthesis: () => {
    const scope = typeof window !== 'undefined' ? window : globalThis;
    if (!scope) return false;
    return 'speechSynthesis' in scope;
  },
  AudioContext: () => {
    const scope = typeof window !== 'undefined' ? window : globalThis;
    if (!scope) return false;
    return 'AudioContext' in scope || 'webkitAudioContext' in scope;
  }
};

function now() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function evaluateFeature(name) {
  if (!name || typeof name !== 'string') return { status: 'unknown', name };
  const check = FEATURE_CHECKS[name];
  if (typeof check === 'function') {
    return { status: check() ? 'available' : 'missing', name };
  }
  const scope = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : {});
  if (scope && name in scope) {
    return { status: 'available', name };
  }
  return { status: 'unknown', name };
}

function evaluateCompatibility(manifest) {
  const compat = manifest?.compat;
  const requiredBrowsers = Array.isArray(compat?.browsers) ? compat.browsers.slice() : [];
  const requiredFeatures = Array.isArray(compat?.features) ? compat.features.slice() : [];
  const featureEvaluations = requiredFeatures.map((feature) => evaluateFeature(feature));
  const missingFeatures = featureEvaluations
    .filter((entry) => entry.status === 'missing')
    .map((entry) => entry.name);
  const unknownFeatures = featureEvaluations
    .filter((entry) => entry.status === 'unknown')
    .map((entry) => entry.name);
  const status = missingFeatures.length ? 'partial' : 'ok';
  const score = missingFeatures.length ? 'AA' : 'AAA';
  return {
    required: {
      browsers: requiredBrowsers,
      features: requiredFeatures
    },
    missing: {
      browsers: [],
      features: missingFeatures
    },
    unknown: {
      browsers: requiredBrowsers.length ? requiredBrowsers.slice() : [],
      features: unknownFeatures
    },
    status,
    score,
    checkedAt: Date.now()
  };
}

function createInitialMetrics(manifest) {
  return {
    attempts: 0,
    successes: 0,
    failures: 0,
    lastError: null,
    lastAttemptAt: null,
    loadTimings: { total: 0, samples: 0, last: null },
    initTimings: { total: 0, samples: 0, last: null },
    compat: evaluateCompatibility(manifest)
  };
}

function serializeMetrics(internal) {
  if (!internal) return undefined;
  const loadAverage = internal.loadTimings.samples
    ? internal.loadTimings.total / internal.loadTimings.samples
    : null;
  const initAverage = internal.initTimings.samples
    ? internal.initTimings.total / internal.initTimings.samples
    : null;
  let combinedAverage = null;
  if (loadAverage !== null || initAverage !== null) {
    combinedAverage = (loadAverage ?? 0) + (initAverage ?? 0);
  }
  return {
    attempts: internal.attempts,
    successes: internal.successes,
    failures: internal.failures,
    retryCount: Math.max(0, internal.attempts - internal.successes),
    lastError: internal.lastError,
    lastAttemptAt: internal.lastAttemptAt,
    timings: {
      load: {
        last: internal.loadTimings.last,
        average: loadAverage,
        samples: internal.loadTimings.samples
      },
      init: {
        last: internal.initTimings.last,
        average: initAverage,
        samples: internal.initTimings.samples
      },
      combinedAverage
    },
    compat: {
      required: {
        browsers: internal.compat?.required?.browsers ? [...internal.compat.required.browsers] : [],
        features: internal.compat?.required?.features ? [...internal.compat.required.features] : []
      },
      missing: {
        browsers: internal.compat?.missing?.browsers ? [...internal.compat.missing.browsers] : [],
        features: internal.compat?.missing?.features ? [...internal.compat.missing.features] : []
      },
      unknown: {
        browsers: internal.compat?.unknown?.browsers ? [...internal.compat.unknown.browsers] : [],
        features: internal.compat?.unknown?.features ? [...internal.compat.unknown.features] : []
      },
      status: internal.compat?.status ?? 'ok',
      score: internal.compat?.score ?? 'AAA',
      checkedAt: internal.compat?.checkedAt ?? null
    }
  };
}

export function setupModuleRuntime({ state, catalog }) {
  const loaders = new Map(catalog.map((entry) => [entry.id, entry.loader]));
  const manifests = new Map(catalog.map((entry) => [entry.id, entry.manifest]));
  const moduleToBlocks = new Map();
  listBlocks().forEach((block) => {
    if (!block || !block.moduleId) return;
    if (!moduleToBlocks.has(block.moduleId)) {
      moduleToBlocks.set(block.moduleId, []);
    }
    moduleToBlocks.get(block.moduleId).push(block.id);
  });

  const initialized = new Set();
  const loading = new Map();
  const metricsCache = new Map();

  function ensureMetrics(moduleId) {
    if (!metricsCache.has(moduleId)) {
      metricsCache.set(moduleId, createInitialMetrics(manifests.get(moduleId)));
    }
    return metricsCache.get(moduleId);
  }

  function updateModuleRuntime(moduleId, patch = {}) {
    const current = state.get(`runtime.modules.${moduleId}`) || {};
    const next = { ...current, ...patch };
    if (!Object.prototype.hasOwnProperty.call(patch, 'metrics')) {
      next.metrics = serializeMetrics(ensureMetrics(moduleId));
    }
    state.set(`runtime.modules.${moduleId}`, next);
  }

  function publishMetrics(moduleId) {
    const internal = ensureMetrics(moduleId);
    internal.compat = evaluateCompatibility(manifests.get(moduleId));
    updateModuleRuntime(moduleId, { metrics: serializeMetrics(internal) });
  }

  function loadModule(moduleId) {
    if (initialized.has(moduleId)) {
      updateModuleRuntime(moduleId, { state: 'ready', error: null });
      return Promise.resolve(getModule(moduleId));
    }
    if (loading.has(moduleId)) {
      return loading.get(moduleId);
    }
    const loader = loaders.get(moduleId);
    if (!loader) {
      return Promise.reject(new Error(`Module loader missing for "${moduleId}".`));
    }
    const metrics = ensureMetrics(moduleId);
    metrics.attempts += 1;
    metrics.lastAttemptAt = Date.now();
    metrics.lastError = null;
    updateModuleRuntime(moduleId, { state: 'loading', error: null, metrics: serializeMetrics(metrics) });
    const loadStartedAt = now();
    const promise = Promise.resolve()
      .then(() => loader())
      .then(() => {
        const mod = getModule(moduleId);
        if (!mod) {
          throw new Error(`Module "${moduleId}" did not register itself.`);
        }
        const loadDuration = now() - loadStartedAt;
        metrics.loadTimings.last = loadDuration;
        metrics.loadTimings.total += loadDuration;
        metrics.loadTimings.samples += 1;
        if (!initialized.has(moduleId)) {
          if (typeof mod.init === 'function') {
            const initStartedAt = now();
            try {
              mod.init({ state });
            } catch (error) {
              console.error(`a11ytb: échec de l’initialisation du module ${moduleId}.`, error);
              metrics.failures += 1;
              metrics.lastError = error?.message || "Échec d'initialisation";
              metrics.initTimings.last = null;
              error.__a11ytbTracked = true;
              publishMetrics(moduleId);
              updateModuleRuntime(moduleId, { state: 'error', error: metrics.lastError });
              throw error;
            }
            const initDuration = now() - initStartedAt;
            metrics.initTimings.last = initDuration;
            metrics.initTimings.total += initDuration;
            metrics.initTimings.samples += 1;
          }
          initialized.add(moduleId);
        }
        metrics.successes += 1;
        publishMetrics(moduleId);
        updateModuleRuntime(moduleId, { state: 'ready', error: null });
        return mod;
      })
      .catch((error) => {
        const tracked = error && typeof error === 'object' && error.__a11ytbTracked;
        const metrics = ensureMetrics(moduleId);
        if (!tracked) {
          metrics.failures += 1;
          metrics.lastError = error?.message || 'Échec de chargement';
          metrics.loadTimings.last = null;
          publishMetrics(moduleId);
        }
        console.error(`a11ytb: impossible de charger le module ${moduleId}.`, error);
        updateModuleRuntime(moduleId, { state: 'error', error: metrics.lastError || 'Échec de chargement' });
        throw error;
      })
      .finally(() => {
        loading.delete(moduleId);
      });
    loading.set(moduleId, promise);
    return promise;
  }

  function isModuleEnabled(blockIds, disabledSet) {
    return blockIds.some((blockId) => !disabledSet.has(blockId));
  }

  let lastDisabled = new Set(state.get('ui.disabled') ?? []);
  moduleToBlocks.forEach((blockIds, moduleId) => {
    const enabled = isModuleEnabled(blockIds, lastDisabled);
    updateModuleRuntime(moduleId, { blockIds, enabled });
    publishMetrics(moduleId);
    if (enabled) {
      loadModule(moduleId).catch(() => {});
    }
  });

  const modulesWithoutBlocks = catalog
    .map((entry) => entry.id)
    .filter((id) => !moduleToBlocks.has(id));

  modulesWithoutBlocks.forEach((moduleId) => {
    updateModuleRuntime(moduleId, { blockIds: [], enabled: true });
    publishMetrics(moduleId);
    loadModule(moduleId).catch(() => {});
  });

  state.on((snapshot) => {
    const nextDisabled = new Set(snapshot?.ui?.disabled ?? []);
    moduleToBlocks.forEach((blockIds, moduleId) => {
      const wasEnabled = isModuleEnabled(blockIds, lastDisabled);
      const isEnabled = isModuleEnabled(blockIds, nextDisabled);
      if (wasEnabled !== isEnabled) {
        updateModuleRuntime(moduleId, { enabled: isEnabled });
      }
      if (isEnabled && !wasEnabled) {
        loadModule(moduleId).catch(() => {});
      }
    });
    modulesWithoutBlocks.forEach((moduleId) => {
      if (!loading.has(moduleId) && !initialized.has(moduleId)) {
        loadModule(moduleId).catch(() => {});
      }
    });
    lastDisabled = nextDisabled;
  });

  if (!window.a11ytb) window.a11ytb = {};
  if (!window.a11ytb.runtime) window.a11ytb.runtime = {};
  window.a11ytb.runtime.loadModule = loadModule;
  window.a11ytb.runtime.moduleStatus = (id) => ({
    loaded: initialized.has(id),
    blockIds: moduleToBlocks.get(id) ?? [],
    ...(state.get(`runtime.modules.${id}`) || {})
  });
  if (window.a11ytb.registry) {
    window.a11ytb.registry.loadModule = loadModule;
  }

  return {
    loadModule,
    isModuleLoaded: (id) => initialized.has(id)
  };
}
