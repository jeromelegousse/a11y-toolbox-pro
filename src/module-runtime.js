import {
  getModule,
  listBlocks,
  listModuleManifests,
  listModuleManifestHistory,
} from './registry.js';
import { compareSemver } from './utils/semver.js';

const DEPENDENCY_STATUS_LABELS = {
  ok: 'OK',
  missing: 'Manquant',
  incompatible: 'Version incompatible',
};

const DEPENDENCY_STATUS_TONE = {
  missing: 'alert',
  incompatible: 'warning',
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
    score: 'AAA',
  };
}

function safeClone(value) {
  const scope =
    typeof globalThis !== 'undefined'
      ? globalThis
      : typeof window !== 'undefined'
        ? window
        : undefined;
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

const RESOURCE_DEFAULT_MAX_AGE = 5 * 60 * 1000;
const RESOURCE_STATUS_PRIORITY = new Map([
  ['fetching', 5],
  ['error', 4],
  ['offline', 3],
  ['stale', 2],
  ['ready', 1],
  ['idle', 0],
]);

const SUPPORTED_RESOURCE_FORMATS = new Set(['json', 'text', 'arrayBuffer']);
const SUPPORTED_RESOURCE_CACHES = new Set(['memory', 'persistent', 'both', 'none']);
const SUPPORTED_RESOURCE_STRATEGIES = new Set(['on-demand', 'lazy', 'preload']);
const SUPPORTED_BACKGROUND_STRATEGIES = new Set(['idle', 'immediate']);

const RESOURCE_CACHE_STORAGE_KEY = 'a11ytb:module-resources';
const RESOURCE_CACHE_SW_NAME = 'a11ytb-module-runtime';
const RESOURCE_CACHE_SW_PREFIX = 'https://a11ytb-runtime-cache/';

function isNavigatorOnline() {
  if (typeof navigator === 'undefined' || typeof navigator.onLine === 'undefined') {
    return true;
  }
  return navigator.onLine !== false;
}

function ensureArrayBuffer(value) {
  if (value instanceof ArrayBuffer) return value;
  if (ArrayBuffer.isView(value)) {
    return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
  }
  if (Array.isArray(value)) {
    const typed = new Uint8Array(value);
    return typed.buffer;
  }
  return null;
}

function encodeArrayBuffer(value) {
  const buffer = ensureArrayBuffer(value);
  if (!buffer) return null;
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  if (typeof btoa === 'function') {
    return btoa(binary);
  }
  if (typeof globalThis !== 'undefined' && typeof globalThis.Buffer === 'function') {
    return globalThis.Buffer.from(binary, 'binary').toString('base64');
  }
  console.warn('a11ytb: aucun encodeur base64 disponible pour sérialiser une ressource binaire.');
  return null;
}

function decodeArrayBuffer(serialized) {
  if (!serialized) return null;
  try {
    let binary;
    if (typeof atob === 'function') {
      binary = atob(serialized);
    } else if (typeof globalThis !== 'undefined' && typeof globalThis.Buffer === 'function') {
      binary = globalThis.Buffer.from(serialized, 'base64').toString('binary');
    } else {
      console.warn(
        'a11ytb: aucun décodeur base64 disponible pour une ressource binaire mise en cache.'
      );
      return null;
    }
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  } catch (error) {
    console.warn('a11ytb: impossible de décoder une ressource binaire mise en cache.', error);
    return null;
  }
}

function createPersistentResourceCache({
  cacheName = RESOURCE_CACHE_SW_NAME,
  storageKey = RESOURCE_CACHE_STORAGE_KEY,
} = {}) {
  if (typeof caches === 'object' && typeof caches.open === 'function') {
    return {
      ready: Promise.resolve(),
      async get(key) {
        try {
          const cache = await caches.open(cacheName);
          const request = new Request(`${RESOURCE_CACHE_SW_PREFIX}${encodeURIComponent(key)}`);
          const response = await cache.match(request);
          if (!response) return null;
          let metadata = null;
          const header = response.headers.get('X-A11YTB-Metadata');
          if (header) {
            try {
              metadata = JSON.parse(header);
            } catch (error) {
              metadata = null;
            }
          }
          const format = metadata?.format || 'json';
          let data;
          if (format === 'json') {
            data = await response.clone().json();
          } else if (format === 'text') {
            data = await response.clone().text();
          } else if (format === 'arrayBuffer') {
            data = await response.clone().arrayBuffer();
          } else {
            data = await response.clone().text();
          }
          return {
            data,
            format,
            fetchedAt: metadata?.fetchedAt ?? Date.now(),
            expiresAt: metadata?.expiresAt ?? null,
            size: metadata?.size ?? null,
          };
        } catch (error) {
          console.warn('a11ytb: lecture du cache service worker impossible.', error);
          return null;
        }
      },
      async set(key, value) {
        try {
          const cache = await caches.open(cacheName);
          let body;
          if (value.format === 'json') {
            body = JSON.stringify(value.data ?? null);
          } else if (value.format === 'text') {
            body = String(value.data ?? '');
          } else if (value.format === 'arrayBuffer') {
            const buffer = ensureArrayBuffer(value.data);
            body = buffer ? new Blob([buffer]) : new Blob();
          } else {
            body = JSON.stringify(value.data ?? null);
          }
          const headers = new Headers();
          if (value.format === 'json') {
            headers.set('Content-Type', 'application/json');
          } else if (value.format === 'text') {
            headers.set('Content-Type', 'text/plain');
          }
          headers.set(
            'X-A11YTB-Metadata',
            JSON.stringify({
              fetchedAt: value.fetchedAt ?? Date.now(),
              expiresAt: value.expiresAt ?? null,
              format: value.format,
              size: value.size ?? null,
            })
          );
          const request = new Request(`${RESOURCE_CACHE_SW_PREFIX}${encodeURIComponent(key)}`);
          const response = new Response(body, { headers });
          await cache.put(request, response);
        } catch (error) {
          console.warn(
            'a11ytb: impossible de persister une ressource runtime dans le cache SW.',
            error
          );
        }
      },
      async delete(key) {
        try {
          const cache = await caches.open(cacheName);
          await cache.delete(`${RESOURCE_CACHE_SW_PREFIX}${encodeURIComponent(key)}`);
        } catch (error) {
          console.warn('a11ytb: suppression cache SW échouée.', error);
        }
      },
      async clear() {
        try {
          await caches.delete(cacheName);
        } catch (error) {
          console.warn('a11ytb: nettoyage cache SW impossible.', error);
        }
      },
    };
  }

  let store = new Map();
  let storageAvailable = false;
  try {
    if (typeof localStorage?.getItem === 'function') {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          Object.entries(parsed).forEach(([key, value]) => {
            store.set(key, value);
          });
        }
      }
      storageAvailable = true;
    }
  } catch (error) {
    console.warn('a11ytb: stockage local indisponible pour les ressources runtime.', error);
  }

  function persist() {
    if (!storageAvailable) return;
    try {
      const payload = {};
      store.forEach((value, key) => {
        payload[key] = value;
      });
      localStorage.setItem(storageKey, JSON.stringify(payload));
    } catch (error) {
      console.warn('a11ytb: impossible de persister les ressources runtime.', error);
    }
  }

  return {
    ready: Promise.resolve(),
    async get(key) {
      if (!store.has(key)) return null;
      const entry = store.get(key);
      if (entry?.format === 'arrayBuffer' && typeof entry.data === 'string') {
        return { ...entry, data: decodeArrayBuffer(entry.data) };
      }
      return entry;
    },
    async set(key, value) {
      let entry = value;
      if (value.format === 'arrayBuffer') {
        const encoded = encodeArrayBuffer(value.data);
        if (!encoded) return;
        entry = { ...value, data: encoded };
      }
      store.set(key, entry);
      persist();
    },
    async delete(key) {
      if (store.delete(key)) {
        persist();
      }
    },
    async clear() {
      store.clear();
      persist();
    },
  };
}

function computeResourceStatus(resources) {
  if (!resources.length) return 'idle';
  let current = 'idle';
  resources.forEach((resource) => {
    const status = resource.status || 'idle';
    const currentPriority = RESOURCE_STATUS_PRIORITY.get(current) ?? 0;
    const nextPriority = RESOURCE_STATUS_PRIORITY.get(status) ?? 0;
    if (nextPriority > currentPriority) {
      current = status;
    }
  });
  return current;
}

function estimatePayloadSize(data, format) {
  try {
    if (format === 'arrayBuffer' && data) {
      const buffer = ensureArrayBuffer(data);
      return buffer ? buffer.byteLength : null;
    }
    if (format === 'text') {
      const text = typeof data === 'string' ? data : String(data ?? '');
      return new Blob([text]).size;
    }
    if (format === 'json') {
      return new Blob([JSON.stringify(data ?? null)]).size;
    }
  } catch (error) {
    console.warn('a11ytb: estimation de taille impossible pour une ressource runtime.', error);
  }
  return null;
}

function normalizeResourceConfig(resource, defaults = {}) {
  if (!resource || typeof resource !== 'object') return null;
  const id = typeof resource.id === 'string' && resource.id.trim() ? resource.id.trim() : null;
  const url = typeof resource.url === 'string' && resource.url.trim() ? resource.url.trim() : null;
  if (!id || !url) return null;
  const strategy = SUPPORTED_RESOURCE_STRATEGIES.has(resource.strategy)
    ? resource.strategy
    : SUPPORTED_RESOURCE_STRATEGIES.has(defaults.strategy)
      ? defaults.strategy
      : 'on-demand';
  const cacheMode = SUPPORTED_RESOURCE_CACHES.has(resource.cache)
    ? resource.cache
    : SUPPORTED_RESOURCE_CACHES.has(defaults.cache)
      ? defaults.cache
      : 'memory';
  const format = SUPPORTED_RESOURCE_FORMATS.has(resource.format)
    ? resource.format
    : SUPPORTED_RESOURCE_FORMATS.has(defaults.format)
      ? defaults.format
      : 'json';
  const background = SUPPORTED_BACKGROUND_STRATEGIES.has(resource.background)
    ? resource.background
    : SUPPORTED_BACKGROUND_STRATEGIES.has(defaults.background)
      ? defaults.background
      : strategy === 'preload'
        ? 'idle'
        : 'immediate';
  const maxAge = Number.isFinite(resource.maxAge)
    ? Math.max(0, resource.maxAge)
    : Number.isFinite(defaults.maxAge)
      ? Math.max(0, defaults.maxAge)
      : RESOURCE_DEFAULT_MAX_AGE;
  const staleWhileRevalidate =
    typeof resource.staleWhileRevalidate === 'boolean'
      ? resource.staleWhileRevalidate
      : typeof defaults.staleWhileRevalidate === 'boolean'
        ? defaults.staleWhileRevalidate
        : true;
  const priority = Number.isFinite(resource.priority)
    ? resource.priority
    : (defaults.priority ?? 0);
  const headers =
    resource.headers && typeof resource.headers === 'object'
      ? { ...defaults.headers, ...resource.headers }
      : defaults.headers
        ? { ...defaults.headers }
        : undefined;
  const timeoutMs = Number.isFinite(resource.timeoutMs)
    ? Math.max(0, resource.timeoutMs)
    : Number.isFinite(defaults.timeoutMs)
      ? Math.max(0, defaults.timeoutMs)
      : null;
  return {
    id,
    url,
    strategy,
    cache: cacheMode,
    format,
    background,
    maxAge,
    staleWhileRevalidate,
    priority,
    credentials: resource.credentials || defaults.credentials || 'same-origin',
    headers,
    method: resource.method || defaults.method || 'GET',
    timeoutMs,
  };
}

function resolveResourceUrl(resource, baseUrl) {
  const absoluteUrlPattern = /^https?:\/\//i;
  const resolveWithBase = (targetUrl, candidateBase) => {
    if (!candidateBase) return null;
    try {
      return new URL(targetUrl, candidateBase).toString();
    } catch (_) {
      return null;
    }
  };

  try {
    if (absoluteUrlPattern.test(resource.url)) {
      return resource.url;
    }

    const candidateBases = [];
    if (baseUrl) {
      if (absoluteUrlPattern.test(baseUrl)) {
        candidateBases.push(baseUrl);
      } else {
        const documentBase =
          typeof document !== 'undefined'
            ? document.baseURI || (typeof window !== 'undefined' ? window.location?.href : null)
            : null;
        if (documentBase) {
          const resolvedBase = resolveWithBase(baseUrl, documentBase);
          if (resolvedBase) {
            candidateBases.push(resolvedBase);
          }
        }
      }
    }

    if (typeof document !== 'undefined') {
      if (document.baseURI) {
        candidateBases.push(document.baseURI);
      } else if (typeof window !== 'undefined' && window.location?.href) {
        candidateBases.push(window.location.href);
      }
    }

    for (const candidate of candidateBases) {
      const resolved = resolveWithBase(resource.url, candidate);
      if (resolved) return resolved;
    }
  } catch (error) {
    console.warn('a11ytb: résolution URL ressource impossible.', error);
  }

  return resource.url;
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
    at: Number.isFinite(incident?.at) ? incident.at : Date.now(),
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
  const combinedAverage =
    (Number.isFinite(loadAverage) ? loadAverage : 0) +
    (Number.isFinite(initAverage) ? initAverage : 0);
  return {
    load: {
      last: internal.loadTimings.last,
      total: internal.loadTimings.total,
      average: Number.isFinite(loadAverage) ? loadAverage : null,
      samples: loadSamples,
    },
    init: {
      last: internal.initTimings.last,
      total: internal.initTimings.total,
      average: Number.isFinite(initAverage) ? initAverage : null,
      samples: initSamples,
    },
    combinedAverage:
      Number.isFinite(combinedAverage) && combinedAverage > 0 ? combinedAverage : null,
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
        at: incident.at,
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
      lastIncidentAt: internal.lastIncidentAt,
    },
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
      lastError: snapshot.lastError,
    },
    timings: snapshot.timings,
    latency: snapshot.latency,
    compat: snapshot.compat,
    incidents: snapshot.incidents,
    timestamps: snapshot.timestamps,
  };
  return { snapshot, exportSample };
}

export function setupModuleRuntime({ state, catalog, collections = [], onMetricsUpdate } = {}) {
  const loaders = new Map(catalog.map((entry) => [entry.id, entry.loader]));
  const manifests = new Map(catalog.map((entry) => [entry.id, entry.manifest]));
  const moduleToBlocks = new Map();
  const moduleToCollections = new Map();
  const blockToModule = new Map();
  const resourcePlans = new Map();
  const resourceStates = new Map();
  const resourceRequests = new Map();
  const resourceMemoryCache = new Map();
  const resourceTelemetry = new Map();
  const resourceIdleHandles = new Map();
  const resourceTriggers = new Map();
  const persistentResourceCache = createPersistentResourceCache();

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

  catalog.forEach((entry) => {
    if (!entry?.id) return;
    const manifest = entry.manifest || manifests.get(entry.id) || {};
    const fetchConfig = manifest?.runtime?.fetch;
    if (!fetchConfig || typeof fetchConfig !== 'object') return;
    const defaults = {
      strategy: fetchConfig.strategy,
      cache: fetchConfig.cache,
      format: fetchConfig.format,
      background: fetchConfig.background,
      maxAge: fetchConfig.maxAge,
      staleWhileRevalidate: fetchConfig.staleWhileRevalidate,
      headers: fetchConfig.headers,
      credentials: fetchConfig.credentials,
      method: fetchConfig.method,
      timeoutMs: fetchConfig.timeoutMs,
    };
    const baseUrl = typeof fetchConfig.baseUrl === 'string' ? fetchConfig.baseUrl : null;
    const resources = Array.isArray(fetchConfig.resources)
      ? fetchConfig.resources
          .map((resource) => normalizeResourceConfig(resource, defaults))
          .filter(Boolean)
          .map((resource) => ({ ...resource, url: resolveResourceUrl(resource, baseUrl) }))
          .sort((a, b) => b.priority - a.priority)
      : [];
    if (!resources.length) return;
    resourcePlans.set(entry.id, {
      baseUrl,
      defaults,
      resources,
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

  function getResourcePlan(moduleId) {
    return resourcePlans.get(moduleId) || null;
  }

  function getResourceConfig(moduleId, resourceId) {
    const plan = getResourcePlan(moduleId);
    if (!plan) return null;
    return plan.resources.find((resource) => resource.id === resourceId) || null;
  }

  function ensureResourceStateMap(moduleId) {
    if (!resourceStates.has(moduleId)) {
      resourceStates.set(moduleId, new Map());
    }
    return resourceStates.get(moduleId);
  }

  function ensureTelemetry(moduleId) {
    if (!resourceTelemetry.has(moduleId)) {
      resourceTelemetry.set(moduleId, {
        requests: 0,
        hits: 0,
        misses: 0,
        bytes: 0,
        lastFetchAt: null,
        lastError: null,
        offlineFallback: false,
      });
    }
    return resourceTelemetry.get(moduleId);
  }

  function ensureResourceState(moduleId, resourceConfigOrId) {
    const map = ensureResourceStateMap(moduleId);
    const config =
      typeof resourceConfigOrId === 'string'
        ? getResourceConfig(moduleId, resourceConfigOrId)
        : resourceConfigOrId;
    if (!config) return null;
    if (!map.has(config.id)) {
      map.set(config.id, {
        id: config.id,
        url: config.url,
        format: config.format,
        cache: config.cache,
        strategy: config.strategy,
        background: config.background,
        maxAge: config.maxAge,
        staleWhileRevalidate: config.staleWhileRevalidate,
        priority: config.priority,
        status: 'idle',
        lastFetchAt: null,
        lastUpdatedAt: null,
        lastError: null,
        size: null,
        source: null,
        expiresAt: null,
        stale: false,
        offline: false,
      });
    }
    return map.get(config.id);
  }

  function snapshotResourceStates(moduleId) {
    const map = resourceStates.get(moduleId);
    if (!map) return [];
    return Array.from(map.values()).map((entry) => ({ ...entry }));
  }

  function applyNetworkState(moduleId) {
    const states = snapshotResourceStates(moduleId);
    if (!states.length) {
      if (resourceStates.has(moduleId)) {
        const telemetry = ensureTelemetry(moduleId);
        updateModuleRuntime(moduleId, {
          network: {
            status: computeResourceStatus(states),
            requests: telemetry.requests,
            hits: telemetry.hits,
            misses: telemetry.misses,
            bytes: telemetry.bytes,
            lastFetchAt: telemetry.lastFetchAt,
            lastError: telemetry.lastError,
            offlineFallback: telemetry.offlineFallback,
            resources: states,
          },
        });
      }
      return;
    }
    const telemetry = ensureTelemetry(moduleId);
    const plan = getResourcePlan(moduleId);
    const status = computeResourceStatus(states);
    const offlineCount = states.filter((entry) => entry.offline).length;
    const staleCount = states.filter((entry) => entry.stale).length;
    const readyCount = states.filter((entry) => entry.status === 'ready').length;
    updateModuleRuntime(moduleId, {
      network: {
        status,
        requests: telemetry.requests,
        hits: telemetry.hits,
        misses: telemetry.misses,
        bytes: telemetry.bytes,
        lastFetchAt: telemetry.lastFetchAt,
        lastError: telemetry.lastError,
        offlineFallback: telemetry.offlineFallback || offlineCount > 0,
        ready: readyCount,
        stale: staleCount,
        offline: offlineCount,
        resources: states,
        plan: plan
          ? {
              baseUrl: plan.baseUrl || null,
              defaultCache: plan.defaults?.cache ?? null,
              defaultStrategy: plan.defaults?.strategy ?? null,
            }
          : null,
      },
    });
  }

  function markResourceTrigger(moduleId, trigger) {
    if (!resourceTriggers.has(moduleId)) {
      resourceTriggers.set(moduleId, new Set());
    }
    resourceTriggers.get(moduleId).add(trigger);
  }

  function hasResourceTrigger(moduleId, trigger) {
    return resourceTriggers.get(moduleId)?.has(trigger) ?? false;
  }

  function logNetworkEvent(moduleId, message, { tone = 'info', resourceId } = {}) {
    if (!message) return;
    const tags = ['modules', 'network'];
    if (resourceId) {
      tags.push(`resource:${resourceId}`);
    }
    try {
      window.a11ytb?.logActivity?.(message, { tone, module: moduleId, tags });
    } catch (error) {
      console.warn('a11ytb: impossible de journaliser un évènement réseau.', error);
    }
  }

  function resourceKey(moduleId, resourceId) {
    return `${moduleId}::${resourceId}`;
  }

  function computeExpiresAt(resourceConfig, fetchedAt) {
    if (!Number.isFinite(resourceConfig?.maxAge) || resourceConfig.maxAge <= 0) {
      return null;
    }
    return (Number.isFinite(fetchedAt) ? fetchedAt : Date.now()) + resourceConfig.maxAge;
  }

  function isEntryExpired(entry, resourceConfig, reference = Date.now()) {
    if (!entry) return true;
    if (!Number.isFinite(resourceConfig?.maxAge) || resourceConfig.maxAge <= 0) {
      return false;
    }
    const expiresAt = Number.isFinite(entry.expiresAt)
      ? entry.expiresAt
      : Number.isFinite(entry.fetchedAt)
        ? entry.fetchedAt + resourceConfig.maxAge
        : null;
    if (!Number.isFinite(expiresAt)) return false;
    return reference > expiresAt;
  }

  function hydrateResourceCache(moduleId) {
    const plan = getResourcePlan(moduleId);
    if (!plan) return;
    plan.resources.forEach((resource) => {
      ensureResourceState(moduleId, resource);
      const key = resourceKey(moduleId, resource.id);
      persistentResourceCache.ready
        .then(() => persistentResourceCache.get(key))
        .then((stored) => {
          if (!stored) return;
          const fetchedAt = Number.isFinite(stored.fetchedAt) ? stored.fetchedAt : Date.now();
          const expiresAt = Number.isFinite(stored.expiresAt)
            ? stored.expiresAt
            : computeExpiresAt(resource, fetchedAt);
          const size = Number.isFinite(stored.size)
            ? stored.size
            : estimatePayloadSize(stored.data, resource.format);
          resourceMemoryCache.set(key, {
            data: stored.data,
            format: resource.format,
            fetchedAt,
            expiresAt,
            size,
            source: stored.source || 'cache',
          });
          const stale = isEntryExpired({ expiresAt }, resource);
          setResourceState(moduleId, resource.id, {
            lastFetchAt: fetchedAt,
            lastUpdatedAt: fetchedAt,
            expiresAt,
            stale,
            status: stale ? 'stale' : 'ready',
            size,
            source: stored.source || 'cache',
            lastError: null,
            offline: false,
          });
        })
        .catch((error) => {
          console.warn('a11ytb: impossible de réhydrater une ressource runtime.', error);
        });
    });
  }

  function initializeResourceState(moduleId) {
    const plan = getResourcePlan(moduleId);
    if (!plan) return;
    plan.resources.forEach((resource) => ensureResourceState(moduleId, resource));
    applyNetworkState(moduleId);
    hydrateResourceCache(moduleId);
    if (!hasResourceTrigger(moduleId, 'init')) {
      activateResourceTriggers(moduleId, 'init');
    }
  }

  function clearScheduledResourceFetch(moduleId, resourceId) {
    const key = resourceKey(moduleId, resourceId);
    const entry = resourceIdleHandles.get(key);
    if (!entry) return;
    try {
      if (typeof entry.cancel === 'function') {
        entry.cancel();
      }
    } catch (error) {
      console.warn('a11ytb: annulation préchargement ressource impossible.', error);
    }
    resourceIdleHandles.delete(key);
  }

  function queueResourceFetch(moduleId, resourceConfig, { idle = false, delay = 0 } = {}) {
    const key = resourceKey(moduleId, resourceConfig.id);
    if (resourceRequests.has(key)) return;
    if (resourceIdleHandles.has(key)) return;

    const run = () => {
      resourceIdleHandles.delete(key);
      fetchModuleResource(moduleId, resourceConfig.id).catch(() => {});
    };

    if (idle && typeof requestIdleCallback === 'function') {
      const handle = requestIdleCallback(run, { timeout: resourceConfig.timeoutMs || 4000 });
      resourceIdleHandles.set(key, {
        cancel: () => {
          if (typeof cancelIdleCallback === 'function') {
            cancelIdleCallback(handle);
          }
        },
      });
      return;
    }

    if (delay > 0) {
      const timeout = setTimeout(run, delay);
      resourceIdleHandles.set(key, { cancel: () => clearTimeout(timeout) });
      return;
    }

    run();
  }

  function activateResourceTriggers(moduleId, trigger) {
    const plan = getResourcePlan(moduleId);
    if (!plan) return;
    markResourceTrigger(moduleId, trigger);
    plan.resources.forEach((resource) => {
      const state = ensureResourceState(moduleId, resource);
      if (!state) return;
      const key = resourceKey(moduleId, resource.id);
      const isFetching = resourceRequests.has(key) || state.status === 'fetching';
      if (resource.strategy === 'on-demand') return;
      if (trigger === 'init' && resource.strategy === 'preload') {
        if (!isFetching && (state.status !== 'ready' || state.stale)) {
          queueResourceFetch(moduleId, resource, { idle: resource.background === 'idle' });
        }
        return;
      }
      if (
        trigger === 'enabled' &&
        (resource.strategy === 'lazy' || resource.strategy === 'preload')
      ) {
        if (!isFetching && (state.status !== 'ready' || state.stale)) {
          queueResourceFetch(moduleId, resource, {
            idle: resource.background === 'idle',
            delay: resource.background === 'idle' ? 0 : 120,
          });
        }
        return;
      }
      if (trigger === 'preload' && resource.strategy === 'lazy') {
        if (!isFetching && (state.status !== 'ready' || state.stale)) {
          queueResourceFetch(moduleId, resource, { idle: resource.background === 'idle' });
        }
      }
    });
  }

  function setResourceState(moduleId, resourceId, patch) {
    const state = ensureResourceState(moduleId, resourceId);
    if (!state) return null;
    Object.assign(state, patch);
    applyNetworkState(moduleId);
    return state;
  }

  function snapshotModuleResources(moduleId) {
    return snapshotResourceStates(moduleId);
  }

  async function readCachedResource(moduleId, resourceId) {
    const key = resourceKey(moduleId, resourceId);
    if (resourceMemoryCache.has(key)) {
      return resourceMemoryCache.get(key);
    }
    try {
      await persistentResourceCache.ready;
      const stored = await persistentResourceCache.get(key);
      if (!stored) return null;
      const fetchedAt = Number.isFinite(stored.fetchedAt) ? stored.fetchedAt : Date.now();
      const expiresAt = Number.isFinite(stored.expiresAt)
        ? stored.expiresAt
        : computeExpiresAt(getResourceConfig(moduleId, resourceId), fetchedAt);
      const size = Number.isFinite(stored.size)
        ? stored.size
        : estimatePayloadSize(
            stored.data,
            getResourceConfig(moduleId, resourceId)?.format || 'json'
          );
      const entry = {
        data: stored.data,
        format: getResourceConfig(moduleId, resourceId)?.format || 'json',
        fetchedAt,
        expiresAt,
        size,
        source: stored.source || 'cache',
      };
      resourceMemoryCache.set(key, entry);
      return entry;
    } catch (error) {
      console.warn(
        'a11ytb: lecture cache persistant impossible pour une ressource runtime.',
        error
      );
      return null;
    }
  }

  function fetchModuleResource(moduleId, resourceId, { force = false } = {}) {
    const resource = getResourceConfig(moduleId, resourceId);
    if (!resource) {
      return Promise.reject(new Error(`Ressource inconnue ${resourceId} pour ${moduleId}.`));
    }
    ensureResourceState(moduleId, resource);
    const key = resourceKey(moduleId, resourceId);
    const existing = resourceRequests.get(key);
    if (existing) {
      return existing;
    }

    const nowTs = Date.now();
    const telemetry = ensureTelemetry(moduleId);

    const cached = resourceMemoryCache.get(key);
    if (!force && cached && !isEntryExpired(cached, resource, nowTs)) {
      telemetry.hits += 1;
      telemetry.lastFetchAt = cached.fetchedAt ?? nowTs;
      const offline = !isNavigatorOnline();
      if (offline) {
        telemetry.offlineFallback = true;
      }
      const stale = Boolean(cached.stale) || isEntryExpired(cached, resource, nowTs);
      const expiresAt = cached.expiresAt ?? computeExpiresAt(resource, cached.fetchedAt ?? nowTs);
      const size = cached.size ?? estimatePayloadSize(cached.data, resource.format);
      setResourceState(moduleId, resourceId, {
        status: stale ? 'stale' : 'ready',
        lastFetchAt: cached.fetchedAt ?? nowTs,
        lastUpdatedAt: cached.fetchedAt ?? nowTs,
        size,
        expiresAt,
        stale,
        source: cached.source || 'memory',
        lastError: null,
        offline,
      });
      if (offline) {
        logNetworkEvent(moduleId, `Ressource ${resourceId} servie depuis le cache (hors ligne).`, {
          tone: 'warning',
          resourceId,
        });
      }
      return Promise.resolve(cached.data);
    }

    const pending = persistentResourceCache.ready
      .then(() => readCachedResource(moduleId, resourceId))
      .then((stored) => {
        if (stored && !force) {
          const stale = isEntryExpired(stored, resource, nowTs);
          if (!stale) {
            telemetry.hits += 1;
            telemetry.lastFetchAt = stored.fetchedAt ?? nowTs;
            const offline = !isNavigatorOnline();
            if (offline) {
              telemetry.offlineFallback = true;
            }
            const expiresAt =
              stored.expiresAt ?? computeExpiresAt(resource, stored.fetchedAt ?? nowTs);
            const size = stored.size ?? estimatePayloadSize(stored.data, resource.format);
            setResourceState(moduleId, resourceId, {
              status: 'ready',
              lastFetchAt: stored.fetchedAt ?? nowTs,
              lastUpdatedAt: stored.fetchedAt ?? nowTs,
              expiresAt,
              stale: false,
              size,
              source: stored.source || 'cache',
              lastError: null,
              offline,
            });
            if (offline) {
              logNetworkEvent(
                moduleId,
                `Ressource ${resourceId} servie depuis le cache (hors ligne).`,
                {
                  tone: 'warning',
                  resourceId,
                }
              );
            }
            return stored.data;
          }
          if (!isNavigatorOnline()) {
            telemetry.hits += 1;
            telemetry.lastFetchAt = stored.fetchedAt ?? nowTs;
            telemetry.offlineFallback = true;
            setResourceState(moduleId, resourceId, {
              status: 'stale',
              lastFetchAt: stored.fetchedAt ?? nowTs,
              lastUpdatedAt: stored.fetchedAt ?? nowTs,
              expiresAt: stored.expiresAt ?? computeExpiresAt(resource, stored.fetchedAt ?? nowTs),
              stale: true,
              size: stored.size ?? estimatePayloadSize(stored.data, resource.format),
              source: stored.source || 'cache',
              lastError: null,
              offline: true,
            });
            logNetworkEvent(moduleId, `Ressource ${resourceId} servie hors ligne (cache).`, {
              tone: 'warning',
              resourceId,
            });
            return stored.data;
          }
        }

        if (!isNavigatorOnline()) {
          telemetry.offlineFallback = true;
          setResourceState(moduleId, resourceId, {
            status: 'offline',
            lastError: 'Réseau hors ligne',
            offline: true,
          });
          logNetworkEvent(moduleId, `Ressource ${resourceId} inaccessible (hors ligne).`, {
            tone: 'alert',
            resourceId,
          });
          throw new Error('Réseau hors ligne');
        }

        telemetry.requests += 1;
        telemetry.misses += 1;
        telemetry.lastFetchAt = Date.now();
        telemetry.offlineFallback = false;
        setResourceState(moduleId, resourceId, {
          status: 'fetching',
          lastError: null,
          offline: false,
          source: 'network',
        });

        const controller = typeof AbortController === 'function' ? new AbortController() : null;
        let timeoutHandle = null;
        if (controller && Number.isFinite(resource.timeoutMs) && resource.timeoutMs > 0) {
          timeoutHandle = setTimeout(() => {
            try {
              controller.abort();
            } catch (error) {
              console.warn('a11ytb: impossible d’annuler une requête ressource.', error);
            }
          }, resource.timeoutMs);
        }

        const requestInit = {
          method: resource.method || 'GET',
          credentials: resource.credentials || 'same-origin',
          headers: resource.headers,
          signal: controller?.signal,
        };

        const fetchPromise = Promise.resolve()
          .then(() => fetch(resource.url, requestInit))
          .then((response) => {
            if (!response.ok) {
              const error = new Error(`Échec (${response.status}) pour ${resourceId}.`);
              error.status = response.status;
              throw error;
            }
            if (resource.format === 'json') return response.json();
            if (resource.format === 'text') return response.text();
            if (resource.format === 'arrayBuffer') return response.arrayBuffer();
            return response.text();
          })
          .then((data) => {
            const fetchedAt = Date.now();
            const expiresAt = computeExpiresAt(resource, fetchedAt);
            const size = estimatePayloadSize(data, resource.format);
            if (resource.cache !== 'none') {
              resourceMemoryCache.set(key, {
                data,
                format: resource.format,
                fetchedAt,
                expiresAt,
                size,
                source: 'network',
              });
            } else {
              resourceMemoryCache.delete(key);
            }
            if (resource.cache === 'persistent' || resource.cache === 'both') {
              persistentResourceCache.ready
                .then(() =>
                  persistentResourceCache.set(key, {
                    data,
                    format: resource.format,
                    fetchedAt,
                    expiresAt,
                    size,
                    source: 'cache',
                  })
                )
                .catch((error) => {
                  console.warn('a11ytb: impossible de persister une ressource runtime.', error);
                });
            }
            telemetry.bytes += Number.isFinite(size) ? size : 0;
            telemetry.lastError = null;
            setResourceState(moduleId, resourceId, {
              status: 'ready',
              lastFetchAt: fetchedAt,
              lastUpdatedAt: fetchedAt,
              expiresAt,
              stale: false,
              size,
              source: 'network',
              lastError: null,
              offline: false,
            });
            logNetworkEvent(
              moduleId,
              `Ressource ${resourceId} synchronisée (${size ? `${Math.round(size / 1024)} Ko` : 'taille inconnue'}).`,
              {
                tone: 'info',
                resourceId,
              }
            );
            return data;
          })
          .catch((error) => {
            telemetry.lastError = error?.message || 'Erreur réseau';
            setResourceState(moduleId, resourceId, {
              status: 'error',
              lastError: telemetry.lastError,
              offline: !isNavigatorOnline(),
            });
            logNetworkEvent(
              moduleId,
              `Échec chargement ressource ${resourceId} : ${telemetry.lastError}`,
              {
                tone: 'alert',
                resourceId,
              }
            );
            throw error;
          })
          .finally(() => {
            if (timeoutHandle) {
              clearTimeout(timeoutHandle);
            }
            resourceRequests.delete(key);
            clearScheduledResourceFetch(moduleId, resourceId);
          });

        resourceRequests.set(key, fetchPromise);
        return fetchPromise;
      });

    return pending;
  }

  function getCachedResource(moduleId, resourceId) {
    return readCachedResource(moduleId, resourceId).then((entry) => entry?.data ?? null);
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
    const runtimeHelpers = {
      fetchResource: (resourceId, options) => fetchModuleResource(moduleId, resourceId, options),
      getResource: (resourceId) => getCachedResource(moduleId, resourceId),
      getResources: () => snapshotModuleResources(moduleId),
    };
    const context = { state, runtime: runtimeHelpers };
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
    const runtimeHelpers = {
      fetchResource: (resourceId, options) => fetchModuleResource(moduleId, resourceId, options),
      getResource: (resourceId) => getCachedResource(moduleId, resourceId),
      getResources: () => snapshotModuleResources(moduleId),
    };
    const context = { state, runtime: runtimeHelpers };
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
        try {
          entry.cancel();
        } catch (error) {
          console.error(
            `a11ytb: échec de l’annulation du préchargement idle pour ${moduleId}.`,
            error
          );
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
          console.error(
            `a11ytb: impossible de retirer un écouteur de préchargement pour ${moduleId}.`,
            error
          );
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
    loadModule(moduleId)
      .then(() => {
        activateResourceTriggers(moduleId, 'preload');
      })
      .catch(() => {});
  }

  function scheduleIdlePreload(moduleId) {
    if (
      initialized.has(moduleId) ||
      loading.has(moduleId) ||
      preloadedModules.has(moduleId) ||
      scheduledPreloads.has(moduleId)
    )
      return;
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
    if (
      !element ||
      initialized.has(moduleId) ||
      loading.has(moduleId) ||
      preloadedModules.has(moduleId)
    )
      return;
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
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          triggerPreload(moduleId);
        }
      },
      { root: document.querySelector('#a11ytb-root') || null, threshold: 0.2 }
    );
    scheduledPreloads.set(moduleId, { strategy: 'visible', observer, observed });
    observer.observe(element);
  }

  function schedulePointerPreload(moduleId, element) {
    if (
      !element ||
      initialized.has(moduleId) ||
      loading.has(moduleId) ||
      preloadedModules.has(moduleId)
    )
      return;
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
    if (initialized.has(moduleId) || loading.has(moduleId) || preloadedModules.has(moduleId))
      return;
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
        activateResourceTriggers(moduleId, 'enabled');
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
      incidents: [],
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
      const requiredVersion =
        typeof dep.version === 'string' && dep.version.trim() ? dep.version.trim() : null;
      const targetManifest = manifests.get(depId);
      const dependencyName = targetManifest?.name || depId;
      const currentVersion = targetManifest?.version || null;
      let status = 'missing';
      if (targetManifest) {
        status =
          requiredVersion && currentVersion
            ? compareSemver(currentVersion, requiredVersion) >= 0
              ? 'ok'
              : 'incompatible'
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
        aria,
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
        tags: ['modules', 'versions'],
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
          window.a11ytb?.logActivity?.(`Conflit résolu pour ${moduleName} : ${entry.label}`, {
            tone: 'confirm',
            module: moduleId,
            tags: ['modules', 'dependencies', `dependency:${entry.id}`],
          });
        }
        return;
      }
      const tone = DEPENDENCY_STATUS_TONE[entry.status] || 'alert';
      window.a11ytb?.logActivity?.(entry.aria, {
        tone,
        module: moduleId,
        tags: ['modules', 'dependencies', `dependency:${entry.id}`],
      });
    });
  }

  function logMetadataQualityChange(moduleId, moduleName, previousQuality, nextQuality) {
    if (!nextQuality) return;
    const previousLevel = previousQuality?.level ?? null;
    const nextLevel = nextQuality.level;
    if (!nextLevel || previousLevel === nextLevel) return;
    const tone = nextLevel === 'AAA' ? 'confirm' : nextLevel === 'AA' ? 'info' : 'warning';
    const coverageLabel = Number.isFinite(nextQuality.coveragePercent)
      ? `${nextQuality.coveragePercent} %`
      : null;
    const summary =
      nextQuality.summary ||
      (coverageLabel
        ? `Mise à jour métadonnées ${nextLevel} (${coverageLabel})`
        : `Mise à jour métadonnées ${nextLevel}`);
    const detail = nextQuality.detail ? ` ${nextQuality.detail}` : '';
    const message = `${moduleName} · ${summary}${detail}`;
    window.a11ytb?.logActivity?.(message, {
      tone,
      module: moduleId,
      tags: ['modules', 'metadata', `metadata:${nextLevel}`],
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
      metadataQuality: manifest.metadataQuality,
    });
    logVersionChange(moduleId, previous.manifestVersion, manifestVersion, moduleName);
    const prevDependencies = Array.isArray(previous.dependencies) ? previous.dependencies : [];
    logDependencyChanges(moduleId, moduleName, prevDependencies, dependencies);
    if (manifest.metadataQuality) {
      logMetadataQualityChange(
        moduleId,
        moduleName,
        previous.metadataQuality,
        manifest.metadataQuality
      );
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
          history: Array.isArray(bucket.history) ? bucket.history.slice() : [],
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
              const runtimeHelpers = {
                fetchResource: (resourceId, options) =>
                  fetchModuleResource(moduleId, resourceId, options),
                getResource: (resourceId) => getCachedResource(moduleId, resourceId),
                getResources: () => snapshotModuleResources(moduleId),
              };
              mod.init({ state, runtime: runtimeHelpers });
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
                severity: 'error',
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
            severity: 'error',
          });
          publishMetrics(moduleId);
        }
        console.error(`a11ytb: impossible de charger le module ${moduleId}.`, error);
        updateModuleRuntime(moduleId, {
          state: 'error',
          error: metrics.lastError || 'Échec de chargement',
        });
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
  let lastDisabledCollections = new Set(
    Array.isArray(initialCollections) ? initialCollections : []
  );

  function refreshManifestGovernance() {
    snapshotManifestGovernance();
    const knownModuleIds = new Set([...moduleToBlocks.keys(), ...catalog.map((entry) => entry.id)]);
    knownModuleIds.forEach((moduleId) => {
      if (!moduleId) return;
      applyModuleMetadata(moduleId);
    });
  }

  moduleToBlocks.forEach((blockIds, moduleId) => {
    const enabled = isModuleEnabled(blockIds, lastDisabled, lastDisabledCollections, moduleId);
    applyModuleMetadata(moduleId);
    updateModuleRuntime(moduleId, {
      blockIds,
      collections: getCollectionsForModule(moduleId),
      enabled,
    });
    initializeResourceState(moduleId);
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
    updateModuleRuntime(moduleId, {
      blockIds: [],
      collections: getCollectionsForModule(moduleId),
      enabled,
    });
    initializeResourceState(moduleId);
    if (enabled) {
      ensureModuleMounted(moduleId);
    } else {
      planPreload(moduleId);
    }
  });

  state.on((snapshot) => {
    const nextDisabled = new Set(snapshot?.ui?.disabled ?? []);
    const nextCollectionList = snapshot?.ui?.collections?.disabled;
    const nextDisabledCollections = new Set(
      Array.isArray(nextCollectionList) ? nextCollectionList : []
    );
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
  window.a11ytb.runtime.fetchResource = (moduleId, resourceId, options) =>
    fetchModuleResource(moduleId, resourceId, options);
  window.a11ytb.runtime.getResource = (moduleId, resourceId) =>
    getCachedResource(moduleId, resourceId);
  window.a11ytb.runtime.getResourceSnapshot = (moduleId) => snapshotModuleResources(moduleId);
  window.a11ytb.runtime.registerBlockElement = (blockId, element) => {
    if (!blockId || !element) return;
    const moduleId = blockToModule.get(blockId);
    if (!moduleId) return;
    const manifest = manifests.get(moduleId);
    const strategy = manifest?.runtime?.preload;
    if (!strategy) return;
    if (initialized.has(moduleId) || loading.has(moduleId) || preloadedModules.has(moduleId))
      return;
    if (strategy === 'visible') {
      scheduleVisibilityPreload(moduleId, element);
    } else if (strategy === 'pointer') {
      schedulePointerPreload(moduleId, element);
    }
  };
  window.a11ytb.runtime.moduleStatus = (id) => ({
    loaded: initialized.has(id),
    blockIds: moduleToBlocks.get(id) ?? [],
    ...(state.get(`runtime.modules.${id}`) || {}),
  });
  if (window.a11ytb.registry) {
    window.a11ytb.registry.loadModule = loadModule;
  }

  return {
    loadModule,
    isModuleLoaded: (id) => initialized.has(id),
    fetchResource: (moduleId, resourceId, options) =>
      fetchModuleResource(moduleId, resourceId, options),
    getCachedResource,
    getResourceSnapshot: snapshotModuleResources,
  };
}
