import { formatTimestamp, summarizeReport } from './modules/audit-report.js';
import { diffManifestSnapshots } from './registry.js';

const STATUS_TONE_DEFAULT = 'info';
const STATUS_TONE_ACTIVE = 'active';
const STATUS_TONE_ALERT = 'alert';
const STATUS_TONE_WARNING = 'warning';
const STATUS_TONE_MUTED = 'muted';

const HISTORY_RECENT_THRESHOLD_MS = 1000 * 60 * 60 * 24 * 30; // 30 jours

const SCORE_PRIORITY = new Map([
  ['AAA', 0],
  ['AA', 1],
  ['A', 2],
  ['B', 3],
  ['C', 4],
]);

function normalizeScore(value) {
  if (typeof value !== 'string') return 'AAA';
  const upper = value.trim().toUpperCase();
  return SCORE_PRIORITY.has(upper) ? upper : 'AAA';
}

function pickWorstScore(current, candidate) {
  const normalizedCurrent = normalizeScore(current);
  const normalizedCandidate = normalizeScore(candidate);
  const currentRank = SCORE_PRIORITY.get(normalizedCurrent) ?? 0;
  const candidateRank = SCORE_PRIORITY.get(normalizedCandidate) ?? 0;
  return candidateRank > currentRank ? normalizedCandidate : normalizedCurrent;
}

const DEFAULT_WINDOW_DURATION = 5 * 60 * 1000;
const DEFAULT_FLUSH_INTERVAL = 45 * 1000;
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_WINDOW_AGE = 60 * 60 * 1000;
const AGGREGATED_INCIDENT_LIMIT = 50;
const MAX_SYNC_QUEUE_SIZE = 50;

function isNavigatorOnline() {
  if (typeof navigator === 'undefined' || typeof navigator.onLine === 'undefined') {
    return true;
  }
  return navigator.onLine !== false;
}

function computeBucketLatency(bucket) {
  const loadAverage =
    bucket.latency.load.samples > 0
      ? bucket.latency.load.total / bucket.latency.load.samples
      : null;
  const initAverage =
    bucket.latency.init.samples > 0
      ? bucket.latency.init.total / bucket.latency.init.samples
      : null;
  const combinedAverage =
    (Number.isFinite(loadAverage) ? loadAverage : 0) +
    (Number.isFinite(initAverage) ? initAverage : 0);
  return {
    load: {
      average: Number.isFinite(loadAverage) ? loadAverage : null,
      samples: bucket.latency.load.samples,
    },
    init: {
      average: Number.isFinite(initAverage) ? initAverage : null,
      samples: bucket.latency.init.samples,
    },
    combinedAverage:
      Number.isFinite(combinedAverage) && combinedAverage > 0 ? combinedAverage : null,
  };
}

function bucketToSnapshot(bucket, state, nowFn) {
  const latency = computeBucketLatency(bucket);
  const runtimeEntry =
    typeof state?.get === 'function' ? state.get(`runtime.modules.${bucket.moduleId}`) : null;
  const moduleLabel = runtimeEntry?.manifestName || bucket.moduleId;
  const collections = Array.isArray(runtimeEntry?.collections)
    ? runtimeEntry.collections.slice()
    : [];
  const snapshotIncidents = bucket.incidents.slice(-AGGREGATED_INCIDENT_LIMIT).map((incident) => ({
    type: incident.type || 'incident',
    severity: incident.severity || (incident.type === 'warning' ? 'warning' : 'error'),
    message: incident.message || '',
    at: incident.at,
  }));
  return {
    moduleId: bucket.moduleId,
    moduleLabel,
    windowStart: bucket.windowStart,
    windowEnd: bucket.windowEnd,
    samples: bucket.samples,
    attempts: bucket.attempts,
    successes: bucket.successes,
    failures: bucket.failures,
    retryCount: bucket.retryCount,
    score: bucket.score,
    latency,
    incidents: snapshotIncidents,
    collections,
    lastTimestamp: bucket.lastTimestamp,
    lastIncidentAt: bucket.lastIncidentAt,
    generatedAt: nowFn(),
  };
}

export function createMetricsSyncService({
  state,
  transport,
  storage,
  windowDuration = DEFAULT_WINDOW_DURATION,
  flushInterval = DEFAULT_FLUSH_INTERVAL,
  maxWindowAge = DEFAULT_MAX_WINDOW_AGE,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  now: nowFn = () => Date.now(),
} = {}) {
  const effectiveWindow = Math.max(10, Number(windowDuration) || DEFAULT_WINDOW_DURATION);
  const windows = new Map();
  const counters = new Map();
  let queue = [];
  let timer = null;
  let updateListener = null;

  const ready = storage?.load
    ? Promise.resolve()
        .then(() => storage.load())
        .then((stored) => {
          if (Array.isArray(stored)) {
            queue = stored.slice(0, MAX_SYNC_QUEUE_SIZE);
          }
        })
        .catch((error) => {
          console.warn(
            'a11ytb: impossible de charger la file de synchronisation métriques.',
            error
          );
        })
    : Promise.resolve();

  function emitUpdate() {
    const snapshot = {
      activeWindows: Array.from(windows.values()).map((bucket) =>
        bucketToSnapshot(bucket, state, nowFn)
      ),
      pendingQueue: queue.map((payload) => ({
        generatedAt: payload.generatedAt,
        windows: payload.windows.length,
      })),
      lastUpdatedAt: nowFn(),
    };
    if (state?.set) {
      state.set('runtime.metricsSync', snapshot);
    }
    if (typeof updateListener === 'function') {
      updateListener(snapshot);
    }
  }

  function persistQueue() {
    if (!storage?.save) return Promise.resolve();
    return Promise.resolve()
      .then(() => storage.save(queue))
      .catch((error) => {
        console.warn('a11ytb: impossible de persister la file métriques.', error);
      });
  }

  function ensureBucket(moduleId, windowStart) {
    const key = `${moduleId}:${windowStart}`;
    if (!windows.has(key)) {
      windows.set(key, {
        moduleId,
        windowStart,
        windowEnd: windowStart + effectiveWindow,
        samples: 0,
        attempts: 0,
        successes: 0,
        failures: 0,
        retryCount: 0,
        latency: {
          load: { total: 0, samples: 0 },
          init: { total: 0, samples: 0 },
        },
        incidents: [],
        score: 'AAA',
        lastTimestamp: windowStart,
        lastIncidentAt: 0,
      });
    }
    return windows.get(key);
  }

  function cleanupBuckets(reference = nowFn()) {
    const threshold = Math.max(effectiveWindow, Number(maxWindowAge) || DEFAULT_MAX_WINDOW_AGE);
    windows.forEach((bucket, key) => {
      if (reference - bucket.windowStart > threshold && bucket.samples === 0) {
        windows.delete(key);
      }
    });
  }

  function enqueuePayload(payload) {
    queue.push(payload);
    if (queue.length > MAX_SYNC_QUEUE_SIZE) {
      queue.splice(0, queue.length - MAX_SYNC_QUEUE_SIZE);
    }
  }

  function recordLatencyDelta(bucket, previous, timings = {}) {
    const loadTiming = timings.load || {};
    const initTiming = timings.init || {};
    const loadTotal = Number(loadTiming.total ?? 0);
    const initTotal = Number(initTiming.total ?? 0);
    const loadSamples = Number(loadTiming.samples ?? 0);
    const initSamples = Number(initTiming.samples ?? 0);
    const loadDelta = loadTotal - (previous.loadTotal ?? 0);
    const initDelta = initTotal - (previous.initTotal ?? 0);
    const loadSampleDelta = loadSamples - (previous.loadSamples ?? 0);
    const initSampleDelta = initSamples - (previous.initSamples ?? 0);
    if (loadDelta > 0 && loadSampleDelta > 0) {
      bucket.latency.load.total += loadDelta;
      bucket.latency.load.samples += loadSampleDelta;
    }
    if (initDelta > 0 && initSampleDelta > 0) {
      bucket.latency.init.total += initDelta;
      bucket.latency.init.samples += initSampleDelta;
    }
    previous.loadTotal = loadTotal;
    previous.loadSamples = loadSamples;
    previous.initTotal = initTotal;
    previous.initSamples = initSamples;
  }

  function recordIncidents(bucket, previous, incidents = [], collectedAt) {
    incidents.forEach((incident) => {
      const at = Number.isFinite(incident?.at) ? incident.at : collectedAt;
      if (at > (previous.lastIncidentAt ?? 0)) {
        bucket.incidents.push({
          type: incident?.type || 'incident',
          severity: incident?.severity || (incident?.type === 'warning' ? 'warning' : 'error'),
          message: incident?.message || '',
          at,
        });
        bucket.lastIncidentAt = Math.max(bucket.lastIncidentAt, at);
        previous.lastIncidentAt = at;
      }
    });
  }

  function ingest(sample) {
    if (!sample || !sample.moduleId) return;
    const collectedAt = Number.isFinite(sample.collectedAt)
      ? sample.collectedAt
      : Number(sample.timestamps?.collectedAt) || nowFn();
    const windowStart = Math.floor(collectedAt / effectiveWindow) * effectiveWindow;
    cleanupBuckets(collectedAt);
    const bucket = ensureBucket(sample.moduleId, windowStart);
    const status = sample.status || {};
    const attempts = Number(status.attempts ?? sample.attempts ?? 0);
    const successes = Number(status.successes ?? sample.successes ?? 0);
    const failures = Number(status.failures ?? sample.failures ?? 0);
    const retryCount = Number(status.retryCount ?? Math.max(0, attempts - successes));
    const previous = counters.get(sample.moduleId) || {
      attempts: 0,
      successes: 0,
      failures: 0,
      retryCount: 0,
      loadTotal: 0,
      loadSamples: 0,
      initTotal: 0,
      initSamples: 0,
      lastIncidentAt: 0,
    };

    const deltaAttempts = Math.max(0, attempts - (previous.attempts ?? 0));
    const deltaSuccesses = Math.max(0, successes - (previous.successes ?? 0));
    const deltaFailures = Math.max(0, failures - (previous.failures ?? 0));
    const deltaRetry = Math.max(0, retryCount - (previous.retryCount ?? 0));

    bucket.samples += 1;
    bucket.attempts += deltaAttempts;
    bucket.successes += deltaSuccesses;
    bucket.failures += deltaFailures;
    bucket.retryCount += deltaRetry;
    bucket.lastTimestamp = Math.max(bucket.lastTimestamp, collectedAt);
    bucket.score = pickWorstScore(bucket.score, sample.compat?.score || sample.score || 'AAA');

    recordLatencyDelta(bucket, previous, sample.timings);
    recordIncidents(bucket, previous, sample.incidents, collectedAt);

    const sampleIncidentTimestamp = Number(sample.timestamps?.lastIncidentAt ?? 0);
    if (sampleIncidentTimestamp > (previous.lastIncidentAt ?? 0)) {
      previous.lastIncidentAt = sampleIncidentTimestamp;
    }

    counters.set(sample.moduleId, {
      attempts,
      successes,
      failures,
      retryCount,
      loadTotal: previous.loadTotal,
      loadSamples: previous.loadSamples,
      initTotal: previous.initTotal,
      initSamples: previous.initSamples,
      lastIncidentAt: previous.lastIncidentAt,
    });

    emitUpdate();
  }

  async function processPayload(payload) {
    if (!transport) {
      return false;
    }
    if (!isNavigatorOnline()) {
      return false;
    }
    const shouldTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0;
    const supportsAbort = typeof AbortController === 'function';
    const controller = shouldTimeout && supportsAbort ? new AbortController() : null;
    const transportArgs = controller ? [payload, { signal: controller.signal }] : [payload];
    const sendPromise = Promise.resolve().then(() => transport(...transportArgs));
    let timeoutHandle = null;
    let didTimeout = false;
    try {
      if (shouldTimeout) {
        await Promise.race([
          sendPromise,
          new Promise((_, reject) => {
            timeoutHandle = setTimeout(() => {
              didTimeout = true;
              if (controller) {
                try {
                  controller.abort();
                } catch (abortError) {
                  console.warn(
                    'a11ytb: impossible d’annuler le transport métriques.',
                    abortError
                  );
                }
              }
              reject(new Error('timeout'));
            }, timeoutMs);
          }),
        ]);
      } else {
        await sendPromise;
      }
      return true;
    } catch (error) {
      const isAbort = error?.name === 'AbortError' || didTimeout;
      if (isAbort) {
        console.warn('a11ytb: synchronisation métriques échouée (timeout).', error);
      } else {
        console.warn('a11ytb: synchronisation métriques échouée.', error);
      }
      return false;
    }
    finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      if (didTimeout) {
        sendPromise.catch(() => {});
      }
    }
  }

  async function processQueue() {
    if (!queue.length) return 0;
    const pending = queue.slice();
    queue = [];
    let sent = 0;
    for (let index = 0; index < pending.length; index += 1) {
      const payload = pending[index];
      const delivered = await processPayload(payload);
      if (!delivered) {
        enqueuePayload(payload);
        for (let nextIndex = index + 1; nextIndex < pending.length; nextIndex += 1) {
          enqueuePayload(pending[nextIndex]);
        }
        break;
      }
      sent += payload.windows.length;
    }
    await persistQueue();
    return sent;
  }

  async function flush({ force = false } = {}) {
    await ready;
    cleanupBuckets();
    let sent = await processQueue();
    const nowTs = nowFn();
    const matured = [];
    windows.forEach((bucket, key) => {
      if (!bucket.samples) {
        windows.delete(key);
        return;
      }
      const expired =
        force || nowTs >= bucket.windowEnd || nowTs - bucket.lastTimestamp >= effectiveWindow;
      if (expired) {
        matured.push(bucketToSnapshot(bucket, state, nowFn));
        windows.delete(key);
      }
    });
    if (matured.length) {
      const payload = { generatedAt: nowTs, windows: matured };
      const delivered = await processPayload(payload);
      if (!delivered) {
        enqueuePayload(payload);
        await persistQueue();
      } else {
        sent += payload.windows.length;
      }
    }
    emitUpdate();
    return { sent, queued: queue.length };
  }

  function start() {
    if (timer) return;
    timer = setInterval(
      () => {
        flush().catch((error) => {
          console.warn('a11ytb: flush métriques en arrière-plan impossible.', error);
        });
      },
      Math.max(1000, Number(flushInterval) || DEFAULT_FLUSH_INTERVAL)
    );
  }

  function stop() {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
  }

  function getActiveWindows() {
    return Array.from(windows.values()).map((bucket) => bucketToSnapshot(bucket, state, nowFn));
  }

  function getQueueSnapshot() {
    return queue.slice();
  }

  function setOnUpdate(listener) {
    updateListener = typeof listener === 'function' ? listener : null;
  }

  ready.then(() => emitUpdate());

  return {
    ingest,
    flush,
    start,
    stop,
    getActiveWindows,
    getQueue: getQueueSnapshot,
    setOnUpdate,
    isRunning: () => Boolean(timer),
  };
}

function toneFromScore(score) {
  const rank = SCORE_PRIORITY.get(normalizeScore(score)) ?? 0;
  if (rank >= 3) return STATUS_TONE_ALERT;
  if (rank === 2) return STATUS_TONE_WARNING;
  if (rank === 1) return STATUS_TONE_ACTIVE;
  return STATUS_TONE_DEFAULT;
}

function summarizeAuditForScore(snapshot = {}) {
  const summary = snapshot?.audit?.summary;
  if (!summary) {
    if (snapshot?.audit?.status === 'error') {
      return 'A';
    }
    return 'AAA';
  }
  switch (summary.outcome) {
    case 'critical':
      return 'A';
    case 'serious':
      return 'AA';
    case 'moderate':
    case 'minor':
      return 'AA';
    case 'pass':
      return 'AAA';
    default:
      return 'AA';
  }
}

function buildGlobalScoreSummary(snapshot = {}) {
  const runtimeEntries = snapshot?.runtime?.modules ?? {};
  let tracked = 0;
  let ready = 0;
  let errors = 0;
  let warnings = 0;
  let worstScore = 'AAA';

  Object.keys(runtimeEntries).forEach((moduleId) => {
    const runtime = runtimeEntries[moduleId];
    if (!runtime || runtime.enabled === false) {
      return;
    }
    tracked += 1;
    if (runtime.state === 'ready') {
      ready += 1;
    }
    if (runtime.state === 'error') {
      errors += 1;
    }
    const metrics = computeModuleMetrics(runtime, { label: runtime.manifestName || moduleId });
    worstScore = pickWorstScore(worstScore, metrics.riskLevel);
    const failureCount = Number.isFinite(metrics.failures)
      ? metrics.failures
      : Number(runtime.metrics?.failures) || 0;
    if (failureCount > 0 && runtime.state !== 'error') {
      warnings += 1;
    }
  });

  const auditScore = summarizeAuditForScore(snapshot);
  worstScore = pickWorstScore(worstScore, auditScore);

  const totalIncidents = errors + warnings;
  const detailParts = [];
  if (tracked > 0) {
    detailParts.push(`${ready}/${tracked} modules prêts`);
  }
  if (errors > 0) {
    detailParts.push(`${errors} en erreur`);
  }
  if (warnings > 0) {
    detailParts.push(`${warnings} à surveiller`);
  }
  if (!detailParts.length) {
    detailParts.push('Aucun incident déclaré');
  }

  return {
    id: 'global-score',
    label: 'Indice de conformité',
    badge: 'Score consolidé',
    value: `Indice ${worstScore}`,
    detail: detailParts.join(' · '),
    tone: toneFromScore(worstScore),
    live: 'polite',
    metaLabels: {
      latency: 'Modules prêts',
      compat: 'Incidents actifs',
    },
    insights: {
      riskLevel: worstScore,
      riskDescription: `Indice global ${worstScore}.`,
      announcement: `Indice global ${worstScore}`,
      latencyLabel: tracked > 0 ? `${ready}/${tracked}` : '0/0',
      compatLabel:
        totalIncidents > 0
          ? `${totalIncidents} incident${totalIncidents > 1 ? 's' : ''}`
          : 'Aucun incident',
    },
  };
}

function buildMetadataSummary(snapshot = {}) {
  const runtimeEntries = snapshot?.runtime?.modules ?? {};
  const moduleIds = Object.keys(runtimeEntries);
  const totalModules = moduleIds.length;
  let tracked = 0;
  let coverageSum = 0;
  let worstLevel = 'AAA';
  const distribution = new Map();
  const missingCounter = new Map();

  moduleIds.forEach((moduleId) => {
    const runtime = runtimeEntries[moduleId];
    const quality = runtime?.metadataQuality;
    if (!quality) return;
    tracked += 1;
    if (Number.isFinite(quality.coverage)) {
      coverageSum += quality.coverage;
    } else if (Number.isFinite(quality.coveragePercent)) {
      coverageSum += quality.coveragePercent / 100;
    }
    const level = typeof quality.level === 'string' ? quality.level.toUpperCase() : 'C';
    distribution.set(level, (distribution.get(level) ?? 0) + 1);
    worstLevel = pickWorstScore(worstLevel, level);
    if (Array.isArray(quality.missing)) {
      quality.missing.forEach((label) => {
        if (!label) return;
        const normalizedLabel = String(label);
        missingCounter.set(normalizedLabel, (missingCounter.get(normalizedLabel) ?? 0) + 1);
      });
    }
  });

  if (tracked === 0) {
    const baseline =
      totalModules > 0
        ? `Ajoutez des manifestes complets pour ${totalModules} module${totalModules > 1 ? 's' : ''} afin de rivaliser avec Accessibility Insights.`
        : 'Ajoutez des manifestes complets pour suivre la qualité face aux outils professionnels.';
    return {
      id: 'metadata-score',
      label: 'Maturité manifestes',
      badge: 'Suivi requis',
      value: 'Manifestes attendus',
      detail: baseline,
      tone: STATUS_TONE_WARNING,
      live: 'polite',
      metaLabels: {
        latency: 'Manifestes évalués',
        compat: 'Priorités',
      },
      insights: {
        riskLevel: 'B',
        coverageAverage: 0,
        evaluatedModules: 0,
        totalModules,
        latencyLabel: `0/${totalModules}`,
        compatLabel: 'Complétez les manifestes pour atteindre la parité Stark',
        missingHighlights: [],
      },
    };
  }

  const averageCoverage = Math.round((coverageSum / Math.max(tracked, 1)) * 100);
  const LEVEL_ORDER = ['AAA', 'AA', 'A', 'B', 'C'];
  const distributionParts = LEVEL_ORDER.map((level) => {
    const count = distribution.get(level) ?? 0;
    return count > 0 ? `${count} ${level}` : null;
  }).filter(Boolean);
  const distributionLabel = distributionParts.length
    ? `Répartition : ${distributionParts.join(' · ')}`
    : 'Répartition : données partielles';

  const missingHighlights = Array.from(missingCounter.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([label, count]) => `${label} (${count})`);

  const missingDetail = missingHighlights.length
    ? `Manques clés : ${missingHighlights.join(' ; ')}.`
    : 'Parité atteinte avec les grilles Stark.';

  const compatLabel = missingHighlights.length ? missingHighlights.join(' · ') : 'Aligné sur Stark';

  return {
    id: 'metadata-score',
    label: 'Maturité manifestes',
    badge: `Qualité ${worstLevel}`,
    value: `Couverture moyenne ${averageCoverage} %`,
    detail: `${distributionLabel}. ${missingDetail}`,
    tone: toneFromScore(worstLevel),
    live: 'polite',
    metaLabels: {
      latency: 'Manifestes évalués',
      compat: 'Écart vs FastPass/Stark',
    },
    insights: {
      riskLevel: worstLevel,
      coverageAverage: averageCoverage,
      evaluatedModules: tracked,
      totalModules,
      latencyLabel: `${tracked}/${totalModules}`,
      compatLabel,
      missingHighlights,
    },
  };
}

function getManifestHistoryBuckets(snapshot = {}) {
  const historyFromManifests = snapshot?.manifests?.history;
  if (Array.isArray(historyFromManifests)) {
    return historyFromManifests;
  }
  const historyFromRuntime = snapshot?.runtime?.manifestHistory;
  if (Array.isArray(historyFromRuntime)) {
    return historyFromRuntime;
  }
  return [];
}

function getDeclaredManifestTotal(snapshot = {}, fallback) {
  const manifestTotals = snapshot?.manifests?.total;
  if (Number.isFinite(manifestTotals)) {
    return manifestTotals;
  }
  const runtimeTotal = snapshot?.runtime?.manifestTotal;
  if (Number.isFinite(runtimeTotal)) {
    return runtimeTotal;
  }
  return fallback;
}

function analyzeManifestHistory(historyBuckets = [], { now = Date.now() } = {}) {
  const metrics = {
    totalModules: historyBuckets.length,
    trackedModules: 0,
    pendingModules: 0,
    totalEntries: 0,
    accepted: 0,
    upgrades: 0,
    refreshes: 0,
    rejections: 0,
    downgradeBlocks: 0,
    recentlyUpdated: 0,
    staleModules: 0,
  };

  historyBuckets.forEach((bucket) => {
    const entries = Array.isArray(bucket?.history) ? bucket.history : [];
    if (!entries.length) {
      metrics.pendingModules += 1;
      return;
    }

    metrics.trackedModules += 1;
    metrics.totalEntries += entries.length;

    let lastTimestamp = Number.NaN;

    entries.forEach((entry) => {
      if (!entry || typeof entry !== 'object') {
        return;
      }
      const status = entry.status;
      const reason = entry.reason;
      if (status === 'accepted') {
        metrics.accepted += 1;
        if (reason === 'upgrade') {
          metrics.upgrades += 1;
        } else if (reason === 'refresh') {
          metrics.refreshes += 1;
        }
      }
      if (status === 'rejected') {
        metrics.rejections += 1;
        if (reason === 'downgrade') {
          metrics.downgradeBlocks += 1;
        }
      }
      const ts = Number(entry.timestamp);
      if (Number.isFinite(ts) && (Number.isNaN(lastTimestamp) || ts > lastTimestamp)) {
        lastTimestamp = ts;
      }
    });

    if (Number.isFinite(lastTimestamp)) {
      if (now - lastTimestamp <= HISTORY_RECENT_THRESHOLD_MS) {
        metrics.recentlyUpdated += 1;
      } else {
        metrics.staleModules += 1;
      }
    } else {
      metrics.staleModules += 1;
    }
  });

  metrics.coverageRate =
    metrics.totalModules > 0
      ? Math.round((metrics.trackedModules / metrics.totalModules) * 100)
      : metrics.trackedModules > 0
        ? 100
        : 0;

  return metrics;
}

function buildManifestHistorySummary(snapshot = {}) {
  const historyBuckets = getManifestHistoryBuckets(snapshot);
  const now = Number.isFinite(snapshot?.now) ? Number(snapshot.now) : Date.now();
  const metrics = analyzeManifestHistory(historyBuckets, { now });
  const declaredTotal = getDeclaredManifestTotal(
    snapshot,
    Math.max(metrics.totalModules, metrics.trackedModules)
  );
  const totalFallback = declaredTotal ?? metrics.totalModules ?? metrics.trackedModules;

  function pickLatestDiffCandidate(buckets) {
    let candidate = null;
    buckets.forEach((bucket) => {
      const history = Array.isArray(bucket.history) ? bucket.history : [];
      if (history.length < 2) return;
      const sorted = history.slice().sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      const latest = sorted[sorted.length - 1];
      const previous = sorted[sorted.length - 2];
      const timestamp = Number.isFinite(latest.timestamp) ? latest.timestamp : 0;
      if (!candidate || timestamp > candidate.timestamp) {
        candidate = {
          moduleId: bucket.id,
          moduleLabel: latest.name || bucket.id,
          latest,
          previous,
          timestamp,
        };
      }
    });
    return candidate;
  }

  if (metrics.trackedModules === 0) {
    const targetTotal = declaredTotal ?? metrics.totalModules ?? metrics.trackedModules;
    const moduleCountLabel =
      targetTotal && targetTotal > 0
        ? `${targetTotal} manifeste${targetTotal > 1 ? 's' : ''}`
        : 'vos manifestes';
    const summary = {
      id: 'manifest-history',
      label: 'Historique manifestes',
      badge: 'Versionnement requis',
      value: 'Historique inactif',
      detail: `Initialisez l’historique des versions pour ${moduleCountLabel} et atteindre la parité avec axe DevTools et Stark.`,
      tone: STATUS_TONE_WARNING,
      live: 'polite',
      metaLabels: {
        latency: 'Mises à jour < 30 j',
        compat: 'Downgrades bloqués',
      },
      insights: {
        riskLevel: 'AA',
        riskDescription: 'Aucun manifeste suivi dans l’historique.',
        announcement: 'Historique manifestes inactif.',
        trackedModules: 0,
        totalModules: declaredTotal ?? 0,
        recentlyUpdated: 0,
        downgradeBlocks: 0,
        pendingModules: declaredTotal ?? 0,
        upgrades: 0,
        refreshes: 0,
        totalEntries: 0,
        latencyLabel: '0/0',
        compatLabel: 'Aucun blocage',
        coverageRate: 0,
      },
    };
    return summary;
  }

  const detailParts = [];
  if (metrics.recentlyUpdated > 0) {
    detailParts.push(`${metrics.recentlyUpdated} mis à jour < 30 j`);
  }
  if (metrics.downgradeBlocks > 0) {
    detailParts.push(
      `${metrics.downgradeBlocks} rétrogradation${metrics.downgradeBlocks > 1 ? 's' : ''} bloquée${metrics.downgradeBlocks > 1 ? 's' : ''}`
    );
  }
  if (metrics.refreshes > 0) {
    detailParts.push(`${metrics.refreshes} synchronisation${metrics.refreshes > 1 ? 's' : ''}`);
  }
  if (metrics.pendingModules > 0) {
    detailParts.push(
      `${metrics.pendingModules} manifeste${metrics.pendingModules > 1 ? 's' : ''} à historiser`
    );
  }
  if (!detailParts.length) {
    detailParts.push('Suivi aligné sur Accessibility Insights.');
  }

  let tone = STATUS_TONE_ACTIVE;
  if (metrics.recentlyUpdated === 0 || metrics.pendingModules > 0) {
    tone = STATUS_TONE_WARNING;
  }

  const trackedLabel = `${metrics.trackedModules}/${totalFallback}`;

  const summary = {
    id: 'manifest-history',
    label: 'Historique manifestes',
    badge: 'Versionnement',
    value: `${trackedLabel} manifestes suivis`,
    detail: detailParts.join(' · '),
    tone,
    live: 'polite',
    metaLabels: {
      latency: 'Mises à jour < 30 j',
      compat: 'Downgrades bloqués',
    },
    insights: {
      riskLevel: tone === STATUS_TONE_WARNING ? 'AA' : 'AAA',
      riskDescription: `${metrics.trackedModules} manifeste${metrics.trackedModules > 1 ? 's' : ''} suivi${metrics.trackedModules > 1 ? 's' : ''} avec historique versionné.`,
      announcement: `Historique manifestes ${trackedLabel}.`,
      trackedModules: metrics.trackedModules,
      totalModules: totalFallback,
      recentlyUpdated: metrics.recentlyUpdated,
      downgradeBlocks: metrics.downgradeBlocks,
      pendingModules: metrics.pendingModules,
      upgrades: metrics.upgrades,
      refreshes: metrics.refreshes,
      totalEntries: metrics.totalEntries,
      latencyLabel: `${metrics.recentlyUpdated}/${metrics.trackedModules}`,
      compatLabel:
        metrics.downgradeBlocks > 0
          ? `${metrics.downgradeBlocks} blocage${metrics.downgradeBlocks > 1 ? 's' : ''}`
          : 'Aucun blocage',
      coverageRate: metrics.coverageRate,
    },
  };

  const diffCandidate = pickLatestDiffCandidate(historyBuckets);
  if (diffCandidate) {
    summary.insights.manifestDiff = {
      moduleId: diffCandidate.moduleId,
      moduleLabel: diffCandidate.moduleLabel,
      latest: diffCandidate.latest,
      previous: diffCandidate.previous,
      timestamp: diffCandidate.timestamp,
      diff: diffManifestSnapshots(diffCandidate.previous, diffCandidate.latest),
    };
  }

  return summary;
}

function isEmpty(value) {
  return value === null || value === undefined || value === '';
}

function getRuntimeInfo(snapshot, moduleId) {
  return snapshot?.runtime?.modules?.[moduleId] ?? {};
}

function normalizeCompatSection(section) {
  if (!section || typeof section !== 'object') {
    return { features: [], browsers: [] };
  }
  const features = Array.isArray(section.features) ? section.features.filter(Boolean) : [];
  const browsers = Array.isArray(section.browsers) ? section.browsers.filter(Boolean) : [];
  return { features, browsers };
}

export function getModuleCompatibilityScore(runtimeEntry = {}) {
  const compat = runtimeEntry?.metrics?.compat;
  if (!compat || typeof compat !== 'object') return 'AAA';
  const score = typeof compat.score === 'string' ? compat.score.trim().toUpperCase() : 'AAA';
  return score || 'AAA';
}

export function computeModuleMetrics(runtimeEntry = {}, { label } = {}) {
  const metrics = runtimeEntry?.metrics || {};
  const attempts = Number.isFinite(metrics.attempts) ? metrics.attempts : 0;
  const successes = Number.isFinite(metrics.successes) ? metrics.successes : 0;
  const failures = Number.isFinite(metrics.failures) ? metrics.failures : 0;
  const retryCount = Number.isFinite(metrics.retryCount)
    ? metrics.retryCount
    : Math.max(0, attempts - successes);
  const timings = metrics.timings || {};
  const combinedAverage = Number.isFinite(timings.combinedAverage) ? timings.combinedAverage : null;
  const latencyLabel =
    Number.isFinite(combinedAverage) && combinedAverage > 0
      ? `${Math.round(combinedAverage)} ms`
      : 'Non mesuré';

  const compat = metrics.compat && typeof metrics.compat === 'object' ? metrics.compat : {};
  const required = normalizeCompatSection(compat.required);
  const missing = normalizeCompatSection(compat.missing);
  const unknown = normalizeCompatSection(compat.unknown);

  let compatLabel = 'Pré-requis non déclarés';
  const hasRequirements = required.features.length > 0 || required.browsers.length > 0;
  if (hasRequirements) {
    const missingParts = [];
    if (missing.features.length) {
      missingParts.push(`fonctions manquantes : ${missing.features.join(', ')}`);
    }
    if (missing.browsers.length) {
      missingParts.push(`navigateurs requis : ${missing.browsers.join(', ')}`);
    }
    if (missingParts.length) {
      compatLabel = `Pré-requis manquants : ${missingParts.join(' ; ')}.`;
    } else {
      const unknownParts = [];
      if (unknown.features.length) {
        unknownParts.push(`fonctions à vérifier : ${unknown.features.join(', ')}`);
      }
      if (unknown.browsers.length) {
        unknownParts.push(`navigateurs ciblés : ${unknown.browsers.join(', ')}`);
      }
      compatLabel = unknownParts.length
        ? `Compatibilité à vérifier : ${unknownParts.join(' ; ')}.`
        : 'Pré-requis satisfaits.';
    }
  }

  let riskLevel = getModuleCompatibilityScore(runtimeEntry);
  if ((runtimeEntry?.state === 'error' || failures > 0) && riskLevel === 'AAA') {
    riskLevel = 'AA';
  }

  const moduleLabel = label || runtimeEntry?.manifestName || 'Module';
  const riskDescription = `${moduleLabel} — indice de fiabilité ${riskLevel}.`;
  const announcement = `${moduleLabel} : indice ${riskLevel}.`;

  return {
    attempts,
    successes,
    failures,
    retryCount,
    latencyLabel,
    compatLabel,
    riskLevel,
    riskDescription,
    announcement,
    compat: { required, missing, unknown },
  };
}

function finalizeSummary(summary, runtime) {
  const moduleLabel = summary.label || runtime?.manifestName || summary.id || 'Module';
  summary.insights = computeModuleMetrics(runtime, { label: moduleLabel });
  return summary;
}

function toneToStatusTone(tone) {
  switch ((tone || '').toLowerCase()) {
    case 'alert':
      return STATUS_TONE_ALERT;
    case 'warning':
      return STATUS_TONE_WARNING;
    case 'confirm':
      return STATUS_TONE_ACTIVE;
    default:
      return STATUS_TONE_DEFAULT;
  }
}

function buildAuditSummary(snapshot = {}) {
  const audit = snapshot.audit ?? {};
  const runtime = getRuntimeInfo(snapshot, 'audit');
  const enabled = runtime.enabled ?? true;
  const moduleState = runtime.state ?? 'idle';
  const summary = {
    id: 'audit',
    label: 'Audit accessibilité',
    badge: '',
    value: '',
    detail: '',
    tone: STATUS_TONE_DEFAULT,
    live: 'polite',
  };

  if (!enabled) {
    summary.badge = 'Module désactivé';
    summary.value = 'Audit désactivé';
    summary.detail = 'Réactivez la carte « Audit accessibilité » pour lancer une analyse.';
    summary.tone = STATUS_TONE_MUTED;
    return summary;
  }

  if (moduleState === 'loading') {
    summary.badge = 'Chargement…';
    summary.value = 'Initialisation de l’audit';
    summary.detail = 'Le module d’audit charge axe-core.';
    summary.tone = STATUS_TONE_DEFAULT;
    return summary;
  }

  if (moduleState === 'error') {
    summary.badge = 'Erreur de chargement';
    summary.value = 'Module indisponible';
    summary.detail = runtime.error || 'Impossible de charger le module d’audit.';
    summary.tone = STATUS_TONE_ALERT;
    return summary;
  }

  if (audit.status === 'running') {
    summary.badge = 'Analyse en cours';
    summary.value = 'Inspection de la page';
    summary.detail = 'axe-core parcourt le DOM pour détecter les violations.';
    summary.tone = STATUS_TONE_ACTIVE;
    summary.live = 'assertive';
    return summary;
  }

  if (audit.status === 'error') {
    summary.badge = 'Échec de l’audit';
    summary.value = 'Analyse interrompue';
    summary.detail = audit.error || 'Une erreur est survenue pendant l’analyse axe-core.';
    summary.tone = STATUS_TONE_WARNING;
    return summary;
  }

  if (!audit.lastReport) {
    summary.badge = 'Audit prêt';
    summary.value = 'En attente';
    summary.detail = 'Lancez une analyse depuis la carte Audit pour obtenir un rapport détaillé.';
    summary.tone = STATUS_TONE_DEFAULT;
    return summary;
  }

  const reportSummary =
    audit.summary && audit.summary.totals ? audit.summary : summarizeReport(audit.lastReport);
  const timestamp = formatTimestamp(audit.lastRun);
  summary.badge = 'Dernier audit';
  summary.value = reportSummary.headline || 'Audit réalisé';
  const detailParts = [];
  if (timestamp) detailParts.push(`Le ${timestamp}`);
  if (reportSummary.detail) detailParts.push(reportSummary.detail);
  detailParts.push('Export disponible dans le journal d’activité.');
  summary.detail = detailParts.join(' · ');
  summary.tone = toneToStatusTone(reportSummary.tone);

  return summary;
}

function buildTtsSummary(snapshot = {}) {
  const tts = snapshot.tts ?? {};
  const runtime = getRuntimeInfo(snapshot, 'tts');
  const enabled = runtime.enabled ?? true;
  const moduleState = runtime.state ?? 'idle';
  const summary = {
    id: 'tts',
    label: 'Synthèse vocale',
    badge: '',
    value: '',
    detail: '',
    tone: STATUS_TONE_DEFAULT,
    live: 'polite',
  };

  if (!enabled) {
    summary.badge = 'Module désactivé';
    summary.value = 'Synthèse désactivée';
    summary.detail = 'Réactivez la carte « Lecture vocale » depuis l’onglet Organisation.';
    summary.tone = STATUS_TONE_MUTED;
    return finalizeSummary(summary, runtime);
  }

  if (moduleState === 'loading') {
    summary.badge = 'Chargement…';
    summary.value = 'Initialisation du module';
    summary.detail = 'Le module de synthèse vocale se charge.';
    return finalizeSummary(summary, runtime);
  }

  if (moduleState === 'error') {
    summary.badge = 'Erreur de chargement';
    summary.value = 'Module indisponible';
    summary.detail = runtime.error || 'Impossible de charger la synthèse vocale.';
    summary.tone = STATUS_TONE_ALERT;
    return finalizeSummary(summary, runtime);
  }

  summary.badge = 'Module prêt';

  switch (tts.status) {
    case 'speaking': {
      const progress = Math.round((tts.progress ?? 0) * 100);
      summary.value = 'Lecture en cours';
      summary.detail = `Progression\u00A0: ${Number.isFinite(progress) ? progress : 0}\u00A0%`;
      summary.tone = STATUS_TONE_ACTIVE;
      summary.live = 'assertive';
      summary.badge = 'Lecture active';
      break;
    }
    case 'unsupported':
      summary.value = 'Synthèse non disponible';
      summary.detail = 'La synthèse vocale n’est pas prise en charge par ce navigateur.';
      summary.tone = STATUS_TONE_ALERT;
      summary.badge = 'Pré-requis manquants';
      break;
    case 'error':
      summary.value = 'Erreur de lecture';
      summary.detail = 'Une erreur est survenue pendant la lecture vocale.';
      summary.tone = STATUS_TONE_WARNING;
      summary.badge = 'Lecture en échec';
      break;
    default: {
      const voices = Array.isArray(tts.availableVoices) ? tts.availableVoices : [];
      const selectedVoice = voices.find((voice) => voice.voiceURI === tts.voice);
      const voiceLabel = selectedVoice
        ? `${selectedVoice.name} (${selectedVoice.lang})`
        : 'Voix du navigateur';
      summary.value = 'En veille';
      summary.detail = `Voix active\u00A0: ${voiceLabel}`;
      break;
    }
  }

  return finalizeSummary(summary, runtime);
}

function buildSttSummary(snapshot = {}) {
  const stt = snapshot.stt ?? {};
  const runtime = getRuntimeInfo(snapshot, 'stt');
  const enabled = runtime.enabled ?? true;
  const moduleState = runtime.state ?? 'idle';
  const summary = {
    id: 'stt',
    label: 'Reconnaissance vocale',
    badge: '',
    value: '',
    detail: '',
    tone: STATUS_TONE_DEFAULT,
    live: 'polite',
  };

  if (!enabled) {
    summary.badge = 'Module désactivé';
    summary.value = 'Dictée désactivée';
    summary.detail = 'Rendez-vous dans Organisation pour réactiver la carte « Dictée vocale ».';
    summary.tone = STATUS_TONE_MUTED;
    return finalizeSummary(summary, runtime);
  }

  if (moduleState === 'loading') {
    summary.badge = 'Chargement…';
    summary.value = 'Initialisation de la dictée';
    summary.detail = 'Le module de dictée vocale se charge.';
    return finalizeSummary(summary, runtime);
  }

  if (moduleState === 'error') {
    summary.badge = 'Erreur de chargement';
    summary.value = 'Module indisponible';
    summary.detail = runtime.error || 'Impossible de charger la dictée vocale.';
    summary.tone = STATUS_TONE_ALERT;
    return finalizeSummary(summary, runtime);
  }

  summary.badge = 'Module prêt';

  switch (stt.status) {
    case 'listening':
      summary.value = 'Écoute en cours';
      summary.detail = 'Parlez pour dicter du texte.';
      summary.tone = STATUS_TONE_ACTIVE;
      summary.live = 'assertive';
      break;
    case 'unsupported':
      summary.value = 'Dictée non disponible';
      summary.detail = 'La reconnaissance vocale n’est pas prise en charge sur ce navigateur.';
      summary.tone = STATUS_TONE_ALERT;
      summary.badge = 'Pré-requis manquants';
      break;
    case 'error':
      summary.value = 'Erreur de dictée';
      summary.detail = runtime.error || 'Une erreur est survenue pendant la dictée.';
      summary.tone = STATUS_TONE_WARNING;
      break;
    default:
      summary.value = 'En veille';
      summary.detail = 'Prêt à démarrer une dictée vocale.';
      break;
  }

  return finalizeSummary(summary, runtime);
}

function buildBrailleSummary(snapshot = {}) {
  const braille = snapshot.braille ?? {};
  const runtime = getRuntimeInfo(snapshot, 'braille');
  const enabled = runtime.enabled ?? true;
  const moduleState = runtime.state ?? 'idle';
  const summary = {
    id: 'braille',
    label: 'Transcription braille',
    badge: '',
    value: '',
    detail: '',
    tone: STATUS_TONE_DEFAULT,
    live: 'polite',
  };

  if (!enabled) {
    summary.badge = 'Module désactivé';
    summary.value = 'Transcription désactivée';
    summary.detail = 'Réactivez la carte « Braille » pour convertir le texte sélectionné.';
    summary.tone = STATUS_TONE_MUTED;
    return finalizeSummary(summary, runtime);
  }

  if (moduleState === 'loading') {
    summary.badge = 'Chargement…';
    summary.value = 'Initialisation du braille';
    summary.detail = 'Le module braille se charge.';
    return finalizeSummary(summary, runtime);
  }

  if (moduleState === 'error') {
    summary.badge = 'Erreur de chargement';
    summary.value = 'Module indisponible';
    summary.detail = runtime.error || 'Impossible de charger le module braille.';
    summary.tone = STATUS_TONE_ALERT;
    return finalizeSummary(summary, runtime);
  }

  summary.badge = 'Module prêt';

  if (!isEmpty(braille.output)) {
    const length = String(braille.output).length;
    summary.value = 'Sortie disponible';
    summary.detail = `Dernière transcription\u00A0: ${length} caractère${length > 1 ? 's' : ''}.`;
    summary.tone = STATUS_TONE_ACTIVE;
  } else {
    summary.value = 'En veille';
    summary.detail = 'Aucune transcription active pour le moment.';
  }

  return finalizeSummary(summary, runtime);
}

function buildContrastSummary(snapshot = {}) {
  const contrast = snapshot.contrast ?? {};
  const runtime = getRuntimeInfo(snapshot, 'contrast');
  const enabled = runtime.enabled ?? true;
  const moduleState = runtime.state ?? 'idle';
  const summary = {
    id: 'contrast',
    label: 'Contraste renforcé',
    badge: '',
    value: '',
    detail: '',
    tone: STATUS_TONE_DEFAULT,
    live: 'polite',
  };

  if (!enabled) {
    summary.badge = 'Module désactivé';
    summary.value = 'Contraste désactivé';
    summary.detail = 'Activez la carte « Contraste élevé » pour appliquer le thème renforcé.';
    summary.tone = STATUS_TONE_MUTED;
    return finalizeSummary(summary, runtime);
  }

  if (moduleState === 'loading') {
    summary.badge = 'Chargement…';
    summary.value = 'Initialisation du thème';
    summary.detail = 'Le module de contraste se charge.';
    return finalizeSummary(summary, runtime);
  }

  if (moduleState === 'error') {
    summary.badge = 'Erreur de chargement';
    summary.value = 'Contraste indisponible';
    summary.detail = runtime.error || 'Impossible de charger le module de contraste.';
    summary.tone = STATUS_TONE_ALERT;
    return finalizeSummary(summary, runtime);
  }

  const isActive = contrast.enabled === true;
  summary.badge = isActive ? 'Actif' : 'Module prêt';
  summary.value = isActive ? 'Thème actif' : 'En veille';
  summary.detail = isActive
    ? 'Contraste élevé appliqué sur la page.'
    : 'Prêt à renforcer le contraste.';
  if (isActive) {
    summary.tone = STATUS_TONE_ACTIVE;
    summary.live = 'assertive';
  }

  return finalizeSummary(summary, runtime);
}

function buildSpacingSummary(snapshot = {}) {
  const spacing = snapshot.spacing ?? {};
  const runtime = getRuntimeInfo(snapshot, 'spacing');
  const enabled = runtime.enabled ?? true;
  const moduleState = runtime.state ?? 'idle';
  const summary = {
    id: 'spacing',
    label: 'Espacements typographiques',
    badge: '',
    value: '',
    detail: '',
    tone: STATUS_TONE_DEFAULT,
    live: 'polite',
  };

  if (!enabled) {
    summary.badge = 'Module désactivé';
    summary.value = 'Espacements désactivés';
    summary.detail = 'Réactivez la carte « Espacements » pour ajuster interlignage et lettres.';
    summary.tone = STATUS_TONE_MUTED;
    return finalizeSummary(summary, runtime);
  }

  if (moduleState === 'loading') {
    summary.badge = 'Chargement…';
    summary.value = 'Initialisation des espacements';
    summary.detail = 'Le module d’espacements se charge.';
    return finalizeSummary(summary, runtime);
  }

  if (moduleState === 'error') {
    summary.badge = 'Erreur de chargement';
    summary.value = 'Espacements indisponibles';
    summary.detail = runtime.error || 'Impossible de charger le module d’espacements.';
    summary.tone = STATUS_TONE_ALERT;
    return finalizeSummary(summary, runtime);
  }

  const lineHeight = Number(spacing.lineHeight ?? 1.5);
  const letterSpacing = Number(spacing.letterSpacing ?? 0);
  const hasCustomLineHeight = Number.isFinite(lineHeight) && Math.abs(lineHeight - 1.5) > 0.05;
  const hasCustomLetterSpacing =
    Number.isFinite(letterSpacing) && Math.abs(letterSpacing - 0) > 0.01;
  const hasCustomSettings = hasCustomLineHeight || hasCustomLetterSpacing;

  if (hasCustomSettings) {
    const readableLineHeight = Number.isFinite(lineHeight) ? `${lineHeight.toFixed(1)}×` : '—';
    const readableLetterSpacing = Number.isFinite(letterSpacing)
      ? `${Math.round(letterSpacing * 100)} %`
      : '—';
    summary.badge = 'Réglages personnalisés';
    summary.value = 'Espacements ajustés';
    summary.detail = `Interlignage ${readableLineHeight} • Lettres ${readableLetterSpacing}`;
    summary.tone = STATUS_TONE_ACTIVE;
  } else {
    summary.badge = 'Module prêt';
    summary.value = 'Réglages standards';
    summary.detail = 'Utilise les valeurs par défaut, prêtes à personnaliser.';
  }

  return finalizeSummary(summary, runtime);
}

export function summarizeStatuses(snapshot = {}) {
  return [
    buildGlobalScoreSummary(snapshot),
    buildMetadataSummary(snapshot),
    buildManifestHistorySummary(snapshot),
    buildAuditSummary(snapshot),
    buildTtsSummary(snapshot),
    buildSttSummary(snapshot),
    buildBrailleSummary(snapshot),
    buildContrastSummary(snapshot),
    buildSpacingSummary(snapshot),
  ];
}

export const STATUS_TONES = {
  DEFAULT: STATUS_TONE_DEFAULT,
  ACTIVE: STATUS_TONE_ACTIVE,
  ALERT: STATUS_TONE_ALERT,
  WARNING: STATUS_TONE_WARNING,
  MUTED: STATUS_TONE_MUTED,
};
