import {
  getModule,
  listBlocks,
  listModuleManifests,
  listModuleManifestHistory
} from './registry.js';
import { compareSemver } from './utils/semver.js';

const DEPENDENCY_STATUS_LABELS = {
  ok: 'OK',
  missing: 'Manquant',
  incompatible: 'Version incompatible'
};

const DEPENDENCY_STATUS_TONE = {
  missing: 'alert',
  incompatible: 'warning'
};

function now() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function createEmptyCompat() {
  return {
    required: { features: [], browsers: [] },
    missing: { features: [], browsers: [] },
    unknown: { features: [], browsers: [] },
    status: 'none',
    score: 'AAA'
  };
}

function safeClone(value) {
  const scope = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : undefined);
  if (scope?.structuredClone) {
    try {
      return scope.structuredClone(value);
    } catch (error) {
      console.warn('a11ytb: structuredClone a échoué pour une valeur runtime.', error);
    }
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    console.warn('a11ytb: clonage JSON échoué pour une valeur runtime.', error);
  }
  return value;
}

function resolveFeatureAvailability(feature) {
  if (typeof feature !== 'string' || !feature.trim()) return null;
  const parts = feature.trim().split('.');
  let scope = typeof globalThis !== 'undefined' ? globalThis : window;
  for (const part of parts) {
    if (!scope || !(part in scope)) {
      return false;
    }
    scope = scope[part];
  }
  return scope !== undefined ? true : null;
}

function evaluateCompatibility(manifest) {
  if (!manifest || typeof manifest !== 'object' || !manifest.compat) {
    return createEmptyCompat();
  }

  const compat = manifest.compat;
  const report = createEmptyCompat();

  const requiredFeatures = Array.isArray(compat.features) ? compat.features.filter(Boolean) : [];
  const requiredBrowsers = Array.isArray(compat.browsers) ? compat.browsers.filter(Boolean) : [];

  report.required.features = requiredFeatures;
  report.required.browsers = requiredBrowsers;

  requiredFeatures.forEach((feature) => {
    const availability = resolveFeatureAvailability(feature);
    if (availability === true) return;
    if (availability === false) {
      report.missing.features.push(feature);
    } else {
      report.unknown.features.push(feature);
    }
  });

  if (requiredBrowsers.length) {
    report.unknown.browsers.push(...requiredBrowsers);
  }

  const hasMissing = report.missing.features.length > 0 || report.missing.browsers.length > 0;
  const hasUnknown = report.unknown.features.length > 0 || report.unknown.browsers.length > 0;

  if (hasMissing) {
    report.status = 'partial';
    report.score = 'AA';
  } else if (hasUnknown) {
    report.status = 'unknown';
    report.score = 'AAA';
  } else if (requiredFeatures.length || requiredBrowsers.length) {
    report.status = 'full';
    report.score = 'AAA';
  }

  return report;
}

const METRICS_INCIDENT_LIMIT = 25;

function appendIncident(metrics, incident) {
  if (!metrics || typeof metrics !== 'object') return;
  if (!Array.isArray(metrics.incidents)) {
    metrics.incidents = [];
  }
  const entry = {
    type: incident?.type || 'error',
    severity: incident?.severity || (incident?.type === 'warning' ? 'warning' : 'error'),
    message: incident?.message || '',
    at: Number.isFinite(incident?.at) ? incident.at : Date.now()
  };
  metrics.incidents.push(entry);
  if (metrics.incidents.length > METRICS_INCIDENT_LIMIT) {
    metrics.incidents.splice(0, metrics.incidents.length - METRICS_INCIDENT_LIMIT);
  }
  metrics.lastIncidentAt = entry.at;
}

function buildLatencySnapshot(internal) {
  const loadSamples = internal.loadTimings.samples || 0;
  const initSamples = internal.initTimings.samples || 0;
  const loadAverage = loadSamples > 0 ? internal.loadTimings.total / loadSamples : null;
  const initAverage = initSamples > 0 ? internal.initTimings.total / initSamples : null;
  const combinedAverage = (Number.isFinite(loadAverage) ? loadAverage : 0) + (Number.isFinite(initAverage) ? initAverage : 0);
  return {
    load: {
      last: internal.loadTimings.last,
      total: internal.loadTimings.total,
      average: Number.isFinite(loadAverage) ? loadAverage : null,
      samples: loadSamples
    },
    init: {
      last: internal.initTimings.last,
      total: internal.initTimings.total,
      average: Number.isFinite(initAverage) ? initAverage : null,
      samples: initSamples
    },
    combinedAverage: Number.isFinite(combinedAverage) && combinedAverage > 0 ? combinedAverage : null
  };
}

function serializeMetrics(internal, { collectedAt }) {
  const latency = buildLatencySnapshot(internal);
  const compatSnapshot = internal.compat ? safeClone(internal.compat) : createEmptyCompat();
  const incidents = Array.isArray(internal.incidents)
    ? internal.incidents.map((incident) => ({
      type: incident.type,
      severity: incident.severity || (incident.type === 'warning' ? 'warning' : 'error'),
      message: incident.message || '',
      at: incident.at
    }))
    : [];
  return {
    attempts: internal.attempts,
    successes: internal.successes,
    failures: internal.failures,
    retryCount: Math.max(0, internal.attempts - internal.successes),
    lastAttemptAt: internal.lastAttemptAt,
    lastSuccessAt: internal.lastSuccessAt,
    lastFailureAt: internal.lastFailureAt,
    lastIncidentAt: internal.lastIncidentAt,
    lastError: internal.lastError,
    timings: latency,
    latency,
    compat: compatSnapshot,
    incidents,
    timestamps: {
      collectedAt,
      lastAttemptAt: internal.lastAttemptAt,
      lastSuccessAt: internal.lastSuccessAt,
      lastFailureAt: internal.lastFailureAt,
      lastIncidentAt: internal.lastIncidentAt
    }
  };
}

function createMetricsSample(moduleId, internal, { collectedAt = Date.now() } = {}) {
  internal.lastSampleAt = collectedAt;
  const snapshot = serializeMetrics(internal, { collectedAt });
  const exportSample = {
    moduleId,
    collectedAt,
    status: {
      attempts: snapshot.attempts,
      successes: snapshot.successes,
      failures: snapshot.failures,
      retryCount: snapshot.retryCount,
      lastError: snapshot.lastError
    },
    timings: snapshot.timings,
    latency: snapshot.latency,
    compat: snapshot.compat,
    incidents: snapshot.incidents,
    timestamps: snapshot.timestamps
  };
  return { snapshot, exportSample };
}

export function setupModuleRuntime({ state, catalog, collections = [], onMetricsUpdate } = {}) {
  const loaders = new Map(catalog.map((entry) => [entry.id, entry.loader]));
  const manifests = new Map(catalog.map((entry) => [entry.id, entry.manifest]));
  const moduleToBlocks = new Map();
  const moduleToCollections = new Map();
  const blockToModule = new Map();

  collections.forEach((collection) => {
    if (!collection || typeof collection !== 'object') return;
    const { id, modules } = collection;
    if (!id) return;
    const members = Array.isArray(modules) ? modules.filter(Boolean) : [];
    members.forEach((moduleId) => {
      if (!moduleToCollections.has(moduleId)) {
        moduleToCollections.set(moduleId, new Set());
      }
      moduleToCollections.get(moduleId).add(id);
    });
  });
  listBlocks().forEach((block) => {
    if (!block || !block.moduleId) return;
    if (!moduleToBlocks.has(block.moduleId)) {
      moduleToBlocks.set(block.moduleId, []);
    }
    moduleToBlocks.get(block.moduleId).push(block.id);
    blockToModule.set(block.id, block.moduleId);
  });

  function getCollectionsForModule(moduleId) {
    const memberships = moduleToCollections.get(moduleId);
    if (!memberships) return [];
    return Array.from(memberships);
  }

  function isModuleCollectionEnabled(moduleId, disabledCollections) {
    const memberships = moduleToCollections.get(moduleId);
    if (!memberships || memberships.size === 0) return true;
    for (const collectionId of memberships) {
      if (disabledCollections.has(collectionId)) {
        return false;
      }
    }
    return true;
  }

  const initialized = new Set();
  const loading = new Map();
  const metricsCache = new Map();
  const moduleLifecycle = new Map();
  const preloadedModules = new Set();
  const scheduledPreloads = new Map();
  const metricsListener = typeof onMetricsUpdate === 'function' ? onMetricsUpdate : null;

  function getLifecycleEntry(moduleId) {
    if (!moduleLifecycle.has(moduleId)) {
      moduleLifecycle.set(moduleId, { mounted: false, teardowns: [] });
    }
    return moduleLifecycle.get(moduleId);
  }

  function runTeardowns(entry, moduleId) {
    const handlers = Array.isArray(entry.teardowns) ? entry.teardowns : [];
    entry.teardowns = [];
    handlers.forEach((teardown) => {
      if (typeof teardown !== 'function') return;
      try {
        teardown();
      } catch (error) {
        console.error(`a11ytb: erreur lors du nettoyage du module ${moduleId}.`, error);
      }
    });
  }

  function mountModule(moduleId) {
    const mod = getModule(moduleId);
    if (!mod) return;
    const entry = getLifecycleEntry(moduleId);
    if (entry.mounted) return;
    const teardowns = [];
    const context = { state };
    if (typeof mod.mount === 'function') {
      try {
        const result = mod.mount(context);
        if (typeof result === 'function') {
          teardowns.push(result);
        }
      } catch (error) {
        console.error(`a11ytb: échec du montage du module ${moduleId}.`, error);
      }
    }
    if (mod.lifecycle?.mount && typeof mod.lifecycle.mount === 'function') {
      try {
        const result = mod.lifecycle.mount(context);
        if (typeof result === 'function') {
          teardowns.push(result);
        }
      } catch (error) {
        console.error(`a11ytb: échec du montage complémentaire pour ${moduleId}.`, error);
      }
    }
    entry.teardowns = teardowns;
    entry.mounted = true;
    moduleLifecycle.set(moduleId, entry);
  }

  function unmountModule(moduleId) {
    const mod = getModule(moduleId);
    if (!mod) return;
    const entry = getLifecycleEntry(moduleId);
    if (!entry.mounted) return;
    runTeardowns(entry, moduleId);
    const context = { state };
    if (typeof mod.unmount === 'function') {
      try {
        mod.unmount(context);
      } catch (error) {
        console.error(`a11ytb: échec du déchargement du module ${moduleId}.`, error);
      }
    }
    if (mod.lifecycle?.unmount && typeof mod.lifecycle.unmount === 'function') {
      try {
        mod.lifecycle.unmount(context);
      } catch (error) {
        console.error(`a11ytb: échec du déchargement complémentaire pour ${moduleId}.`, error);
      }
    }
    entry.mounted = false;
    entry.teardowns = [];
    moduleLifecycle.set(moduleId, entry);
  }

  function cancelScheduledPreload(moduleId) {
    const entry = scheduledPreloads.get(moduleId);
    if (!entry) return;
    if (entry.strategy === 'idle') {
      if (typeof entry.cancel === 'function') {
        try { entry.cancel(); } catch (error) {
          console.error(`a11ytb: échec de l’annulation du préchargement idle pour ${moduleId}.`, error);
        }
      }
    } else if (entry.strategy === 'visible') {
      entry.observer?.disconnect?.();
    } else if (entry.strategy === 'pointer') {
      entry.records?.forEach(({ pointerHandler, focusHandler }, element) => {
        try {
          element.removeEventListener('pointerenter', pointerHandler);
          element.removeEventListener('focusin', focusHandler);
        } catch (error) {
          console.error(`a11ytb: impossible de retirer un écouteur de préchargement pour ${moduleId}.`, error);
        }
      });
    }
    scheduledPreloads.delete(moduleId);
  }

  function triggerPreload(moduleId) {
    if (initialized.has(moduleId) || loading.has(moduleId) || preloadedModules.has(moduleId)) {
      cancelScheduledPreload(moduleId);
      return;
    }
    cancelScheduledPreload(moduleId);
    preloadedModules.add(moduleId);
    loadModule(moduleId).catch(() => {});
  }

  function scheduleIdlePreload(moduleId) {
    if (initialized.has(moduleId) || loading.has(moduleId) || preloadedModules.has(moduleId) || scheduledPreloads.has(moduleId)) return;
    const supportsIdle = typeof requestIdleCallback === 'function';
    if (supportsIdle) {
      const handle = requestIdleCallback(() => triggerPreload(moduleId), { timeout: 2000 });
      const cancel = () => {
        if (typeof cancelIdleCallback === 'function') {
          cancelIdleCallback(handle);
        }
      };
      scheduledPreloads.set(moduleId, { strategy: 'idle', cancel });
    } else {
      const timeout = setTimeout(() => triggerPreload(moduleId), 600);
      const cancel = () => clearTimeout(timeout);
      scheduledPreloads.set(moduleId, { strategy: 'idle', cancel });
    }
  }

  function scheduleVisibilityPreload(moduleId, element) {
    if (!element || initialized.has(moduleId) || loading.has(moduleId) || preloadedModules.has(moduleId)) return;
    if (!('IntersectionObserver' in window)) {
      scheduleIdlePreload(moduleId);
      return;
    }
    const existing = scheduledPreloads.get(moduleId);
    if (existing?.strategy === 'visible') {
      if (existing.observed.has(element)) return;
      existing.observed.add(element);
      existing.observer.observe(element);
      return;
    }
    const observed = new Set([element]);
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        triggerPreload(moduleId);
      }
    }, { root: document.querySelector('#a11ytb-root') || null, threshold: 0.2 });
    scheduledPreloads.set(moduleId, { strategy: 'visible', observer, observed });
    observer.observe(element);
  }

  function schedulePointerPreload(moduleId, element) {
    if (!element || initialized.has(moduleId) || loading.has(moduleId) || preloadedModules.has(moduleId)) return;
    let entry = scheduledPreloads.get(moduleId);
    if (!entry || entry.strategy !== 'pointer') {
      entry = { strategy: 'pointer', records: new Map() };
      scheduledPreloads.set(moduleId, entry);
    }
    if (entry.records.has(element)) return;
    const handler = () => triggerPreload(moduleId);
    const pointerHandler = () => handler();
    const focusHandler = () => handler();
    element.addEventListener('pointerenter', pointerHandler, { once: true });
    element.addEventListener('focusin', focusHandler, { once: true });
    entry.records.set(element, { pointerHandler, focusHandler });
  }

  function planPreload(moduleId) {
    const manifest = manifests.get(moduleId);
    const strategy = manifest?.runtime?.preload;
    if (!strategy) return;
    if (initialized.has(moduleId) || loading.has(moduleId) || preloadedModules.has(moduleId)) return;
    const hasBlocks = (moduleToBlocks.get(moduleId) || []).length > 0;
    if (strategy === 'idle') {
      scheduleIdlePreload(moduleId);
    } else if (!hasBlocks) {
      scheduleIdlePreload(moduleId);
    }
  }

  function ensureModuleMounted(moduleId) {
    cancelScheduledPreload(moduleId);
    return loadModule(moduleId)
      .then(() => {
        mountModule(moduleId);
      })
      .catch(() => {});
  }

  function ensureMetrics(moduleId) {
    if (metricsCache.has(moduleId)) {
      return metricsCache.get(moduleId);
    }
    const base = {
      attempts: 0,
      successes: 0,
      failures: 0,
      lastAttemptAt: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastIncidentAt: null,
      lastSampleAt: null,
      lastError: null,
      loadTimings: { last: null, total: 0, samples: 0 },
      initTimings: { last: null, total: 0, samples: 0 },
      compat: createEmptyCompat(),
      incidents: []
    };
    const manifest = manifests.get(moduleId);
    if (manifest) {
      base.compat = evaluateCompatibility(manifest);
    }
    metricsCache.set(moduleId, base);
    return base;
  }

  function buildDependencyMetadata(moduleId) {
    const manifest = manifests.get(moduleId);
    if (!manifest) return [];
    const moduleName = manifest.name || moduleId;
    const dependencies = Array.isArray(manifest.dependencies) ? manifest.dependencies : [];
    if (!dependencies.length) return [];

    return dependencies.map((dep) => {
      const depId = dep.id;
      const requiredVersion = typeof dep.version === 'string' && dep.version.trim() ? dep.version.trim() : null;
      const targetManifest = manifests.get(depId);
      const dependencyName = targetManifest?.name || depId;
      const currentVersion = targetManifest?.version || null;
      let status = 'missing';
      if (targetManifest) {
        status = requiredVersion && currentVersion
          ? (compareSemver(currentVersion, requiredVersion) >= 0 ? 'ok' : 'incompatible')
          : 'ok';
      }

      let message = '';
      if (status === 'missing') {
        message = 'Module requis introuvable.';
      } else if (status === 'incompatible') {
        const detected = currentVersion || 'inconnue';
        message = `Version détectée ${detected} (minimum ${requiredVersion}).`;
      } else if (requiredVersion && currentVersion) {
        message = `Version détectée ${currentVersion} (minimum ${requiredVersion}).`;
      } else {
        message = 'Module disponible.';
      }

      let aria = '';
      if (status === 'missing') {
        aria = `Dépendance ${dependencyName} manquante pour ${moduleName}.`;
      } else if (status === 'incompatible') {
        const detected = currentVersion || 'inconnue';
        aria = `Dépendance ${dependencyName} incompatible pour ${moduleName} : version ${detected}, minimum ${requiredVersion}.`;
      } else {
        aria = `Dépendance ${dependencyName} disponible pour ${moduleName}.`;
      }

      return {
        id: depId,
        label: dependencyName,
        status,
        statusLabel: DEPENDENCY_STATUS_LABELS[status] || status,
        requiredVersion,
        currentVersion,
        message,
        aria
      };
    });
  }

  function logVersionChange(moduleId, previousVersion, nextVersion, moduleName) {
    if (!previousVersion || previousVersion === nextVersion) return;
    window.a11ytb?.logActivity?.(
      `Version du module ${moduleName} mise à jour : ${previousVersion} → ${nextVersion}`,
      {
        tone: 'info',
        module: moduleId,
        tags: ['modules', 'versions']
      }
    );
  }

  function logDependencyChanges(moduleId, moduleName, previous = [], next = []) {
    const prevMap = new Map(previous.map((entry) => [entry.id, entry]));
    next.forEach((entry) => {
      const prev = prevMap.get(entry.id);
      const prevStatus = prev?.status ?? null;
      if (entry.status === prevStatus) return;
      if (entry.status === 'ok') {
        if (prevStatus && prevStatus !== 'ok') {
          window.a11ytb?.logActivity?.(
            `Conflit résolu pour ${moduleName} : ${entry.label}`,
            {
              tone: 'confirm',
              module: moduleId,
              tags: ['modules', 'dependencies', `dependency:${entry.id}`]
            }
          );
        }
        return;
      }
      const tone = DEPENDENCY_STATUS_TONE[entry.status] || 'alert';
      window.a11ytb?.logActivity?.(entry.aria, {
        tone,
        module: moduleId,
        tags: ['modules', 'dependencies', `dependency:${entry.id}`]
      });
    });
  }

  function logMetadataQualityChange(moduleId, moduleName, previousQuality, nextQuality) {
    if (!nextQuality) return;
    const previousLevel = previousQuality?.level ?? null;
    const nextLevel = nextQuality.level;
    if (!nextLevel || previousLevel === nextLevel) return;
    const tone = nextLevel === 'AAA' ? 'confirm' : (nextLevel === 'AA' ? 'info' : 'warning');
    const coverageLabel = Number.isFinite(nextQuality.coveragePercent)
      ? `${nextQuality.coveragePercent} %`
      : null;
    const summary = nextQuality.summary || (coverageLabel
      ? `Mise à jour métadonnées ${nextLevel} (${coverageLabel})`
      : `Mise à jour métadonnées ${nextLevel}`);
    const detail = nextQuality.detail ? ` ${nextQuality.detail}` : '';
    const message = `${moduleName} · ${summary}${detail}`;
    window.a11ytb?.logActivity?.(message, {
      tone,
      module: moduleId,
      tags: ['modules', 'metadata', `metadata:${nextLevel}`]
    });
  }

  function applyModuleMetadata(moduleId) {
    const manifest = manifests.get(moduleId);
    if (!manifest) return;
    const moduleName = manifest.name || moduleId;
    const dependencies = buildDependencyMetadata(moduleId);
    const manifestVersion = manifest.version || '0.0.0';
    const previous = state.get(`runtime.modules.${moduleId}`) || {};
    updateModuleRuntime(moduleId, {
      manifestVersion,
      manifestName: moduleName,
      dependencies,
      metadataQuality: manifest.metadataQuality
    });
    logVersionChange(moduleId, previous.manifestVersion, manifestVersion, moduleName);
    const prevDependencies = Array.isArray(previous.dependencies) ? previous.dependencies : [];
    logDependencyChanges(moduleId, moduleName, prevDependencies, dependencies);
    if (manifest.metadataQuality) {
      logMetadataQualityChange(moduleId, moduleName, previous.metadataQuality, manifest.metadataQuality);
    }
  }

  function snapshotManifestGovernance() {
    const normalizedManifests = listModuleManifests();
    if (Array.isArray(normalizedManifests)) {
      normalizedManifests.forEach((manifest) => {
        if (manifest?.id) {
          manifests.set(manifest.id, manifest);
        }
      });
    }

    const historyList = listModuleManifestHistory();
    const historyBuckets = Array.isArray(historyList)
      ? historyList.map((bucket) => ({
        id: bucket.id,
        history: Array.isArray(bucket.history) ? bucket.history.slice() : []
      }))
      : [];

    const bucketsById = new Map(historyBuckets.map((bucket) => [bucket.id, bucket]));
    catalog.forEach((entry) => {
      if (!entry?.id) return;
      if (!bucketsById.has(entry.id)) {
        bucketsById.set(entry.id, { id: entry.id, history: [] });
      }
    });

    const manifestTotal = Math.max(bucketsById.size, manifests.size, catalog.length);
    state.set('runtime.manifestTotal', manifestTotal);
    state.set('runtime.manifestHistory', safeClone(Array.from(bucketsById.values())));
  }

  snapshotManifestGovernance();

  function captureMetricsSample(moduleId, { collectedAt = Date.now() } = {}) {
    const internal = ensureMetrics(moduleId);
    internal.compat = evaluateCompatibility(manifests.get(moduleId));
    return createMetricsSample(moduleId, internal, { collectedAt });
  }

  function updateModuleRuntime(moduleId, patch) {
    const current = state.get(`runtime.modules.${moduleId}`) || {};
    const next = { ...current, ...patch };
    if (!Object.prototype.hasOwnProperty.call(patch, 'metrics')) {
      next.metrics = captureMetricsSample(moduleId).snapshot;
    }
    state.set(`runtime.modules.${moduleId}`, next);
  }

  function publishMetrics(moduleId) {
    const { snapshot, exportSample } = captureMetricsSample(moduleId);
    updateModuleRuntime(moduleId, { metrics: snapshot });
    if (metricsListener) {
      try {
        metricsListener(exportSample);
      } catch (error) {
        console.error('a11ytb: publication métriques impossible.', error);
      }
    }
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
    const { snapshot: loadingSnapshot } = captureMetricsSample(moduleId);
    updateModuleRuntime(moduleId, { state: 'loading', error: null, metrics: loadingSnapshot });
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
              metrics.lastFailureAt = Date.now();
              appendIncident(metrics, {
                type: 'error',
                message: metrics.lastError,
                at: metrics.lastFailureAt,
                severity: 'error'
              });
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
        metrics.lastSuccessAt = Date.now();
        metrics.lastError = null;
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
          metrics.lastFailureAt = Date.now();
          appendIncident(metrics, {
            type: 'error',
            message: metrics.lastError,
            at: metrics.lastFailureAt,
            severity: 'error'
          });
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

  function isModuleEnabled(blockIds, disabledSet, disabledCollections, moduleId) {
    const enabledByBlocks = blockIds.some((blockId) => !disabledSet.has(blockId));
    if (!enabledByBlocks) return false;
    return isModuleCollectionEnabled(moduleId, disabledCollections);
  }

  let lastDisabled = new Set(state.get('ui.disabled') ?? []);
  const initialCollections = state.get('ui.collections.disabled');
  let lastDisabledCollections = new Set(Array.isArray(initialCollections) ? initialCollections : []);

  function refreshManifestGovernance() {
    snapshotManifestGovernance();
    const knownModuleIds = new Set([
      ...moduleToBlocks.keys(),
      ...catalog.map((entry) => entry.id)
    ]);
    knownModuleIds.forEach((moduleId) => {
      if (!moduleId) return;
      applyModuleMetadata(moduleId);
    });
  }

  moduleToBlocks.forEach((blockIds, moduleId) => {
    const enabled = isModuleEnabled(blockIds, lastDisabled, lastDisabledCollections, moduleId);
    applyModuleMetadata(moduleId);
    updateModuleRuntime(moduleId, { blockIds, collections: getCollectionsForModule(moduleId), enabled });
    if (enabled) {
      ensureModuleMounted(moduleId);
    } else {
      planPreload(moduleId);
    }
  });

  const modulesWithoutBlocks = catalog
    .map((entry) => entry.id)
    .filter((id) => !moduleToBlocks.has(id));

  modulesWithoutBlocks.forEach((moduleId) => {
    const enabled = isModuleCollectionEnabled(moduleId, lastDisabledCollections);
    applyModuleMetadata(moduleId);
    updateModuleRuntime(moduleId, { blockIds: [], collections: getCollectionsForModule(moduleId), enabled });
    if (enabled) {
      ensureModuleMounted(moduleId);
    } else {
      planPreload(moduleId);
    }
  });

  state.on((snapshot) => {
    const nextDisabled = new Set(snapshot?.ui?.disabled ?? []);
    const nextCollectionList = snapshot?.ui?.collections?.disabled;
    const nextDisabledCollections = new Set(Array.isArray(nextCollectionList) ? nextCollectionList : []);
    moduleToBlocks.forEach((blockIds, moduleId) => {
      const wasEnabled = isModuleEnabled(blockIds, lastDisabled, lastDisabledCollections, moduleId);
      const isEnabled = isModuleEnabled(blockIds, nextDisabled, nextDisabledCollections, moduleId);
      if (wasEnabled !== isEnabled) {
        updateModuleRuntime(moduleId, { enabled: isEnabled });
      }
      if (isEnabled && !wasEnabled) {
        ensureModuleMounted(moduleId);
      } else if (!isEnabled && wasEnabled) {
        unmountModule(moduleId);
      }
    });
    modulesWithoutBlocks.forEach((moduleId) => {
      const wasEnabled = isModuleCollectionEnabled(moduleId, lastDisabledCollections);
      const isEnabled = isModuleCollectionEnabled(moduleId, nextDisabledCollections);
      if (wasEnabled !== isEnabled) {
        updateModuleRuntime(moduleId, { enabled: isEnabled });
      }
      if (isEnabled && !wasEnabled) {
        ensureModuleMounted(moduleId);
      } else if (!isEnabled && wasEnabled) {
        unmountModule(moduleId);
      }
    });
    lastDisabled = nextDisabled;
    lastDisabledCollections = nextDisabledCollections;
  });

  if (!window.a11ytb) window.a11ytb = {};
  if (!window.a11ytb.runtime) window.a11ytb.runtime = {};
  window.a11ytb.runtime.loadModule = loadModule;
  window.a11ytb.runtime.refreshManifestGovernance = refreshManifestGovernance;
  window.a11ytb.runtime.registerBlockElement = (blockId, element) => {
    if (!blockId || !element) return;
    const moduleId = blockToModule.get(blockId);
    if (!moduleId) return;
    const manifest = manifests.get(moduleId);
    const strategy = manifest?.runtime?.preload;
    if (!strategy) return;
    if (initialized.has(moduleId) || loading.has(moduleId) || preloadedModules.has(moduleId)) return;
    if (strategy === 'visible') {
      scheduleVisibilityPreload(moduleId, element);
    } else if (strategy === 'pointer') {
      schedulePointerPreload(moduleId, element);
    }
  };
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
