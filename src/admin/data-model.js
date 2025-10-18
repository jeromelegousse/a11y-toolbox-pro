import { moduleCatalog } from '../module-catalog.js';
import { flattenedModuleCollections } from '../module-collections.js';
import { computeProfiles } from '../profile-utils.js';
import { ensureArray } from './utils.js';

export { computeProfiles } from '../profile-utils.js';

export const collectionLookup = new Map(
  flattenedModuleCollections.map((collection) => [collection.id, collection])
);

const moduleToCollections = new Map();
flattenedModuleCollections.forEach((collection) => {
  const members = ensureArray(collection.modules);
  members.forEach((moduleId) => {
    if (!moduleToCollections.has(moduleId)) {
      moduleToCollections.set(moduleId, new Set());
    }
    moduleToCollections.get(moduleId).add(collection.id);
  });
});

const collectionMetadata = new Map(
  flattenedModuleCollections.map((collection) => [collection.id, collection])
);

function resolveStatus(runtimeEntry, { disabled, hidden, disabledCollections }) {
  const isErrored = runtimeEntry.state === 'error';
  if (isErrored) {
    return { label: 'En erreur', tone: 'alert', enabled: false };
  }

  const blockIds = ensureArray(runtimeEntry.blockIds);
  const fullyDisabled = blockIds.length > 0 && blockIds.every((blockId) => disabled.has(blockId));
  const fullyHidden = blockIds.length > 0 && blockIds.every((blockId) => hidden.has(blockId));
  const disabledByCollection = ensureArray(runtimeEntry.collections).some((collectionId) =>
    disabledCollections.has(collectionId)
  );

  if (fullyDisabled) {
    return { label: 'Désactivé', tone: 'muted', enabled: false };
  }
  if (fullyHidden) {
    return { label: 'Masqué', tone: 'warning', enabled: false };
  }
  if (runtimeEntry.enabled === false || disabledByCollection) {
    return { label: 'Suspendu', tone: 'warning', enabled: false };
  }
  return { label: 'Actif', tone: 'confirm', enabled: true };
}

function determineAvailability({
  enabled,
  statusTone,
  compatStatus,
  collectionDisabled,
  dependencies,
  flags,
}) {
  const dependencyList = ensureArray(dependencies);
  const hasBlockingDependency = dependencyList.some(
    (dependency) => dependency.status && dependency.status !== 'ok'
  );
  const hasAlertFlag = ensureArray(flags).some((flag) => flag.tone === 'alert');
  if (statusTone === 'alert' || hasBlockingDependency || hasAlertFlag) {
    return 'blocked';
  }
  if (!enabled || collectionDisabled || compatStatus === 'partial' || compatStatus === 'unknown') {
    return 'attention';
  }
  return 'ready';
}

function buildFlags(isCollectionDisabled, runtimeEntry, compat) {
  const flags = [];
  if (isCollectionDisabled) {
    flags.push({ tone: 'warning', label: 'Collection désactivée' });
  }
  const dependencies = ensureArray(runtimeEntry.dependencies);
  const blockingDependencies = dependencies.filter(
    (dependency) => dependency.status && dependency.status !== 'ok'
  );
  if (blockingDependencies.length) {
    const label =
      blockingDependencies.length > 1
        ? `${blockingDependencies.length} dépendances à résoudre`
        : `${blockingDependencies[0].label} à vérifier`;
    flags.push({ tone: 'alert', label });
  }
  if (compat?.status === 'unknown') {
    flags.push({ tone: 'warning', label: 'Compatibilité à confirmer' });
  }
  if (compat?.status === 'partial') {
    flags.push({ tone: 'alert', label: 'Compatibilité partielle' });
  }
  const network = runtimeEntry.network || {};
  if (network.status === 'error') {
    flags.push({ tone: 'alert', label: 'Ressources distantes en erreur' });
  }
  if (network.status === 'offline') {
    flags.push({ tone: 'warning', label: 'Ressources servies hors ligne' });
  }
  if (Number.isFinite(network.stale) && network.stale > 0) {
    const label =
      network.stale > 1 ? `${network.stale} ressources à rafraîchir` : '1 ressource à rafraîchir';
    flags.push({ tone: 'warning', label });
  }
  return flags;
}

function buildSearchText(entry) {
  const manifest = entry.manifest || {};
  const tokens = [entry.id, manifest.name, manifest.description, manifest.category]
    .concat(ensureArray(manifest.keywords))
    .concat(ensureArray(manifest.permissions));
  return tokens
    .filter(Boolean)
    .map((token) => token.toString().toLowerCase())
    .join(' ');
}

export function buildModuleEntries(snapshot = {}) {
  const stateUi = snapshot?.ui || {};
  const runtime = snapshot?.runtime?.modules || {};
  const disabledSet = new Set(ensureArray(stateUi.disabled));
  const hiddenSet = new Set(ensureArray(stateUi.hidden));
  const pinnedSet = new Set(ensureArray(stateUi.pinned));
  const collectionsDisabled = new Set(ensureArray(stateUi.collections?.disabled));
  const { moduleToProfiles } = computeProfiles(snapshot);

  return moduleCatalog.map((entry) => {
    const manifest = entry.manifest || {};
    const runtimeEntry = runtime[entry.id] || {};
    const blockIds = ensureArray(runtimeEntry.blockIds);
    const status = resolveStatus(runtimeEntry, {
      disabled: disabledSet,
      hidden: hiddenSet,
      disabledCollections: collectionsDisabled,
    });

    const collections = moduleToCollections.get(entry.id);
    const collectionIds = collections ? Array.from(collections) : [];
    const isCollectionDisabled = collectionIds.some((collectionId) =>
      collectionsDisabled.has(collectionId)
    );
    const pinned = blockIds.some((blockId) => pinnedSet.has(blockId));
    const compat = runtimeEntry.metrics?.compat ||
      runtimeEntry.compat ||
      manifest.compat || { status: 'none' };
    const compatStatus = compat.status || 'none';

    const dependencies = ensureArray(runtimeEntry.dependencies);
    const network = runtimeEntry.network || {};
    const networkResources = ensureArray(network.resources);

    const metrics = runtimeEntry.metrics
      ? { ...runtimeEntry.metrics }
      : {
          attempts: 0,
          successes: 0,
          failures: 0,
          timings: { load: {}, init: {}, combinedAverage: null },
        };
    if (!Number.isFinite(metrics.lastAttemptAt) && Number.isFinite(runtimeEntry.lastAttemptAt)) {
      metrics.lastAttemptAt = runtimeEntry.lastAttemptAt;
    }

    const profiles = moduleToProfiles.get(entry.id) || new Set();
    const flags = buildFlags(isCollectionDisabled, runtimeEntry, compat);

    const moduleEntry = {
      id: entry.id,
      manifest,
      runtime: runtimeEntry,
      blockIds,
      metrics,
      compat,
      compatStatus,
      status: status.label,
      statusTone: status.tone,
      enabled: status.enabled,
      isDisabled: !status.enabled && status.label === 'Désactivé',
      isHidden: !status.enabled && status.label === 'Masqué',
      isPinned: pinned,
      canToggle: blockIds.length > 0 && !isCollectionDisabled,
      collectionDisabled: isCollectionDisabled,
      profiles: Array.from(profiles),
      collections: collectionIds,
      dependencies,
      network,
      networkStatus: network.status || 'idle',
      networkResources,
      networkRequests: Number.isFinite(network.requests) ? network.requests : 0,
      networkHits: Number.isFinite(network.hits) ? network.hits : 0,
      flags,
      searchText: buildSearchText({ id: entry.id, manifest }),
    };

    moduleEntry.availability = determineAvailability({
      enabled: moduleEntry.enabled,
      statusTone: moduleEntry.statusTone,
      compatStatus,
      collectionDisabled: isCollectionDisabled,
      dependencies: moduleEntry.dependencies,
      flags: moduleEntry.flags,
    });

    return moduleEntry;
  });
}

export function filterModules(entries, filters) {
  return entries.filter((entry) => {
    if (
      filters.availability &&
      filters.availability !== 'all' &&
      entry.availability !== filters.availability
    ) {
      return false;
    }
    if (filters.profile !== 'all' && !entry.profiles.includes(filters.profile)) {
      return false;
    }
    if (filters.collection !== 'all' && !entry.collections.includes(filters.collection)) {
      return false;
    }
    if (filters.compatibility !== 'all' && entry.compatStatus !== filters.compatibility) {
      return false;
    }
    if (filters.search) {
      const query = filters.search.toLowerCase();
      if (!entry.searchText.includes(query)) {
        return false;
      }
    }
    if (filters.onlyPinned && !entry.isPinned) {
      return false;
    }
    return true;
  });
}

export function sortModules(entries, sortKey) {
  const list = [...entries];
  switch (sortKey) {
    case 'status':
      return list.sort((a, b) => a.status.localeCompare(b.status, 'fr'));
    case 'recent':
      return list.sort((a, b) => {
        const aTime = a.metrics.lastAttemptAt || a.runtime.lastAttemptAt || 0;
        const bTime = b.metrics.lastAttemptAt || b.runtime.lastAttemptAt || 0;
        return bTime - aTime;
      });
    case 'compat':
      return list.sort((a, b) => a.compatStatus.localeCompare(b.compatStatus, 'fr'));
    case 'alpha':
    default:
      return list.sort((a, b) =>
        (a.manifest.name || a.id).localeCompare(b.manifest.name || b.id, 'fr')
      );
  }
}

function incrementCount(map, key) {
  if (!key) {
    return;
  }
  const current = map.get(key) || 0;
  map.set(key, current + 1);
}

function sortByCountAndLabel(a, b) {
  if (b.count !== a.count) {
    return b.count - a.count;
  }
  return (a.label || a.id).localeCompare(b.label || b.id, 'fr');
}

function formatCounts(map, lookup) {
  return Array.from(map.entries())
    .map(([id, count]) => {
      const metadata = lookup?.get(id);
      const label = metadata?.label || id;
      const pathLabel = metadata?.pathLabel || label;
      return { id, count, label, pathLabel };
    })
    .sort(sortByCountAndLabel);
}

export function computeAvailabilityBuckets(entries = []) {
  const stats = {
    total: entries.length,
    enabled: 0,
    pinned: 0,
  };

  const initialBuckets = [
    {
      id: 'ready',
      label: 'Prêts à l’usage',
      description: 'Modules actifs ou activables immédiatement.',
      tone: 'confirm',
      modules: [],
    },
    {
      id: 'attention',
      label: 'À surveiller',
      description: 'Compatibilité partielle, collections désactivées ou modules en pause.',
      tone: 'warning',
      modules: [],
    },
    {
      id: 'blocked',
      label: 'Bloqués',
      description: 'Dépendances manquantes, erreurs de chargement ou alertes critiques.',
      tone: 'alert',
      modules: [],
    },
  ];

  const bucketMap = new Map(
    initialBuckets.map((bucket) => [bucket.id, { ...bucket, modules: [] }])
  );
  const profileCounts = new Map();
  const collectionCounts = new Map();

  entries.forEach((entry) => {
    if (entry.enabled) {
      stats.enabled += 1;
    }
    if (entry.isPinned) {
      stats.pinned += 1;
    }

    ensureArray(entry.profiles).forEach((profileId) => incrementCount(profileCounts, profileId));
    ensureArray(entry.collections).forEach((collectionId) =>
      incrementCount(collectionCounts, collectionId)
    );

    const bucketId = bucketMap.has(entry.availability)
      ? entry.availability
      : determineAvailability(entry);
    const bucket = bucketMap.get(bucketId) || bucketMap.get('attention');
    bucket.modules.push(entry);
  });

  const buckets = Array.from(bucketMap.values()).map((bucket) => ({
    ...bucket,
    modules: bucket.modules
      .slice()
      .sort((a, b) => (a.manifest.name || a.id).localeCompare(b.manifest.name || b.id, 'fr')),
    count: bucket.modules.length,
  }));

  return {
    stats,
    buckets,
    profiles: formatCounts(profileCounts),
    collections: formatCounts(collectionCounts, collectionLookup),
  };
}

const COMPATIBILITY_SEVERITY = new Map([
  ['full', 0],
  ['unknown', 1],
  ['partial', 2],
  ['none', 3],
]);

function pickWorstCompatStatus(current, candidate) {
  const currentWeight = COMPATIBILITY_SEVERITY.get(current) ?? 0;
  const candidateWeight = COMPATIBILITY_SEVERITY.get(candidate) ?? 0;
  return candidateWeight > currentWeight ? candidate : current;
}

function normalizeFlags(entry) {
  const seen = new Set();
  const result = [];
  ensureArray(entry?.flags).forEach((flag) => {
    if (!flag || typeof flag.label !== 'string') {
      return;
    }
    const key = `${flag.tone || 'info'}::${flag.label}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push({ tone: flag.tone || 'info', label: flag.label });
    }
  });
  return result;
}

function computeRate(part, total) {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) {
    return null;
  }
  const ratio = (part / total) * 100;
  return Number.isFinite(ratio) ? ratio : null;
}

function countOfflineResources(resources) {
  return ensureArray(resources).filter(
    (resource) => resource?.offline || resource?.status === 'offline'
  ).length;
}

function getCollectionLabel(collectionId) {
  const metadata = collectionMetadata.get(collectionId);
  if (!metadata) {
    return { label: collectionId, pathLabel: collectionId };
  }
  return {
    label: metadata.label || collectionId,
    pathLabel: metadata.pathLabel || metadata.label || collectionId,
  };
}

export function computeMetricsOverview(entries = [], snapshot = {}) {
  const totals = {
    attempts: 0,
    successes: 0,
    failures: 0,
    incidentCount: 0,
    incidentWarnings: 0,
    incidentErrors: 0,
    latency: {
      load: { total: 0, samples: 0 },
      init: { total: 0, samples: 0 },
    },
    lastTimestamp: 0,
    network: { requests: 0, hits: 0, offline: 0 },
  };

  const moduleSummaries = [];
  const moduleIndex = new Map();
  const collectionAggregates = new Map();

  entries.forEach((entry) => {
    const attempts = Number(entry.metrics?.attempts) || 0;
    const successes = Number(entry.metrics?.successes) || 0;
    const failures = Number(entry.metrics?.failures) || 0;
    totals.attempts += attempts;
    totals.successes += successes;
    totals.failures += failures;

    const timings = entry.metrics?.timings || {};
    const loadTiming = timings.load || {};
    const initTiming = timings.init || {};
    const loadSamples = Number(loadTiming.samples) || 0;
    const initSamples = Number(initTiming.samples) || 0;
    const loadTotal = Number(loadTiming.total) || 0;
    const initTotal = Number(initTiming.total) || 0;
    if (loadSamples > 0 && loadTotal > 0) {
      totals.latency.load.total += loadTotal;
      totals.latency.load.samples += loadSamples;
    }
    if (initSamples > 0 && initTotal > 0) {
      totals.latency.init.total += initTotal;
      totals.latency.init.samples += initSamples;
    }

    const manifestName = entry.manifest?.name || entry.id;
    const moduleIncidents = ensureArray(entry.metrics?.incidents);
    let lastIncidentAt = Number(entry.metrics?.lastIncidentAt) || 0;
    let warningCount = 0;
    let errorCount = 0;
    moduleIncidents.forEach((incident) => {
      const severity = incident?.severity || (incident?.type === 'warning' ? 'warning' : 'error');
      if (severity === 'warning') {
        warningCount += 1;
        totals.incidentWarnings += 1;
      } else {
        errorCount += 1;
        totals.incidentErrors += 1;
      }
      if (Number.isFinite(incident?.at) && incident.at > lastIncidentAt) {
        lastIncidentAt = incident.at;
      }
    });
    totals.incidentCount += moduleIncidents.length;

    const offlineResources = countOfflineResources(entry.networkResources);
    if (Number.isFinite(entry.networkRequests)) {
      totals.network.requests += entry.networkRequests;
    }
    if (Number.isFinite(entry.networkHits)) {
      totals.network.hits += entry.networkHits;
    }
    totals.network.offline += offlineResources;

    const lastAttemptAt = Number(entry.metrics?.lastAttemptAt) || Number(entry.runtime?.lastAttemptAt) || 0;
    const lastSuccessAt = Number(entry.metrics?.lastSuccessAt) || 0;
    const lastFailureAt = Number(entry.metrics?.lastFailureAt) || Number(entry.runtime?.lastFailureAt) || 0;
    const moduleLastTimestamp = Math.max(lastAttemptAt, lastSuccessAt, lastFailureAt, lastIncidentAt);
    if (moduleLastTimestamp > totals.lastTimestamp) {
      totals.lastTimestamp = moduleLastTimestamp;
    }

    const summary = {
      id: entry.id,
      label: manifestName,
      attempts,
      successes,
      failures,
      successRate: computeRate(successes, attempts),
      failureRate: computeRate(failures, attempts) ?? 0,
      latency: {
        combinedAverage: Number.isFinite(timings.combinedAverage) ? timings.combinedAverage : null,
        loadAverage: Number.isFinite(loadTiming.average) ? loadTiming.average : null,
        initAverage: Number.isFinite(initTiming.average) ? initTiming.average : null,
      },
      incidents: {
        total: moduleIncidents.length,
        warnings: warningCount,
        errors: errorCount,
        lastAt: lastIncidentAt,
      },
      collections: ensureArray(entry.collections),
      profiles: ensureArray(entry.profiles),
      network: {
        requests: Number(entry.networkRequests) || 0,
        hits: Number(entry.networkHits) || 0,
        offline: offlineResources,
      },
      lastUpdatedAt: moduleLastTimestamp,
    };

    moduleSummaries.push(summary);
    moduleIndex.set(entry.id, summary);

    summary.collections.forEach((collectionId) => {
      if (!collectionId) return;
      if (!collectionAggregates.has(collectionId)) {
        const { label, pathLabel } = getCollectionLabel(collectionId);
        collectionAggregates.set(collectionId, {
          id: collectionId,
          label,
          pathLabel,
          modules: new Set(),
          attempts: 0,
          successes: 0,
          failures: 0,
          incidents: 0,
        });
      }
      const aggregate = collectionAggregates.get(collectionId);
      aggregate.modules.add(entry.id);
      aggregate.attempts += attempts;
      aggregate.successes += successes;
      aggregate.failures += failures;
      aggregate.incidents += moduleIncidents.length;
    });
  });

  const metricsSyncState = snapshot?.runtime?.metricsSync || {};
  const activeWindows = ensureArray(metricsSyncState.activeWindows);
  const pendingQueue = ensureArray(metricsSyncState.pendingQueue);
  const recentIncidents = [];

  activeWindows.forEach((windowData) => {
    const moduleId = windowData?.moduleId;
    const incidents = ensureArray(windowData?.incidents);
    if (!moduleId || !incidents.length) {
      return;
    }
    const moduleSummary = moduleIndex.get(moduleId);
    const moduleLabel =
      moduleSummary?.label || windowData.moduleLabel || windowData.moduleId || moduleId;
    incidents.forEach((incident) => {
      const severity = incident?.severity || (incident?.type === 'warning' ? 'warning' : 'error');
      const at = Number.isFinite(incident?.at) ? incident.at : Number(windowData.lastTimestamp) || 0;
      recentIncidents.push({
        moduleId,
        moduleLabel,
        severity,
        message: incident?.message || '',
        at,
      });
    });
  });

  recentIncidents.sort((a, b) => (b.at || 0) - (a.at || 0));

  const loadAverage =
    totals.latency.load.samples > 0
      ? totals.latency.load.total / totals.latency.load.samples
      : null;
  const initAverage =
    totals.latency.init.samples > 0
      ? totals.latency.init.total / totals.latency.init.samples
      : null;
  const combinedAverage =
    (Number.isFinite(loadAverage) ? loadAverage : 0) +
    (Number.isFinite(initAverage) ? initAverage : 0);

  const successRate = computeRate(totals.successes, totals.attempts);

  const modulesWithAttempts = moduleSummaries.filter((module) => module.attempts > 0);
  const topFailures = modulesWithAttempts
    .slice()
    .sort((a, b) => {
      if ((b.failureRate || 0) !== (a.failureRate || 0)) {
        return (b.failureRate || 0) - (a.failureRate || 0);
      }
      if (b.failures !== a.failures) {
        return b.failures - a.failures;
      }
      return (b.attempts || 0) - (a.attempts || 0);
    })
    .slice(0, 8);

  const topLatency = moduleSummaries
    .filter((module) => Number.isFinite(module.latency.combinedAverage))
    .slice()
    .sort((a, b) => b.latency.combinedAverage - a.latency.combinedAverage)
    .slice(0, 6);

  const collections = Array.from(collectionAggregates.values())
    .map((aggregate) => ({
      id: aggregate.id,
      label: aggregate.label,
      pathLabel: aggregate.pathLabel,
      modules: aggregate.modules.size,
      attempts: aggregate.attempts,
      successes: aggregate.successes,
      failures: aggregate.failures,
      successRate: computeRate(aggregate.successes, aggregate.attempts),
      incidentCount: aggregate.incidents,
    }))
    .sort((a, b) => {
      if ((b.failures || 0) !== (a.failures || 0)) {
        return (b.failures || 0) - (a.failures || 0);
      }
      if ((a.successRate ?? 0) !== (b.successRate ?? 0)) {
        return (a.successRate ?? 0) - (b.successRate ?? 0);
      }
      return (a.label || a.id).localeCompare(b.label || b.id, 'fr');
    })
    .slice(0, 6);

  const updatedAt = Math.max(
    totals.lastTimestamp,
    Number(metricsSyncState.lastUpdatedAt) || 0,
    recentIncidents.length ? recentIncidents[0].at || 0 : 0
  );

  return {
    totals: {
      modules: entries.length,
      attempts: totals.attempts,
      successes: totals.successes,
      failures: totals.failures,
      successRate,
      latency: {
        loadAverage: Number.isFinite(loadAverage) ? loadAverage : null,
        initAverage: Number.isFinite(initAverage) ? initAverage : null,
        combinedAverage:
          Number.isFinite(combinedAverage) && combinedAverage > 0 ? combinedAverage : null,
      },
      network: totals.network,
    },
    modules: moduleSummaries,
    topFailures,
    topLatency,
    collections,
    incidents: {
      total: totals.incidentCount,
      warnings: totals.incidentWarnings,
      errors: totals.incidentErrors,
      recent: recentIncidents.slice(0, 8),
    },
    sync: {
      activeWindows: activeWindows.length,
      pendingQueue: pendingQueue.length,
    },
    updatedAt,
  };
}

function buildChildHighlights(collection, moduleSet, entryById) {
  return flattenedModuleCollections
    .filter((child) => child.parentId === collection.id)
    .map((child) => {
      const directModules = ensureArray(child.directModules).filter(Boolean);
      if (!directModules.length) {
        return null;
      }
      const matched = directModules.filter((moduleId) => moduleSet.has(moduleId));
      const missing = directModules.filter((moduleId) => !moduleSet.has(moduleId));
      const hasIssues = matched.length > 0 && missing.length > 0;
      if (!hasIssues) {
        return null;
      }
      return {
        id: child.id,
        label: child.label || child.id,
        matched: matched.length,
        total: directModules.length,
        missingModules: missing.map((moduleId) => ({
          id: moduleId,
          label: entryById.get(moduleId)?.manifest?.name || moduleId,
        })),
      };
    })
    .filter(Boolean);
}

export function computeProfileCollectionSuggestions(entries = [], snapshot = {}) {
  const entryById = new Map(entries.map((entry) => [entry.id, entry]));
  const { list: profiles } = computeProfiles(snapshot);
  const disabledCollections = new Set(ensureArray(snapshot?.ui?.collections?.disabled));
  const result = [];

  const topLevelCollections = flattenedModuleCollections.filter(
    (collection) => collection.depth === 0
  );

  profiles.forEach((profile) => {
    const moduleSet = new Set(ensureArray(profile.modules));
    const profileSuggestions = [];

    topLevelCollections.forEach((collection) => {
      const directModules = ensureArray(collection.directModules).filter(Boolean);
      if (!directModules.length) {
        return;
      }

      const moduleDetails = directModules.map((moduleId) => {
        const entry = entryById.get(moduleId) || null;
        return {
          id: moduleId,
          entry,
          inProfile: moduleSet.has(moduleId),
        };
      });

      const matched = moduleDetails.filter((detail) => detail.inProfile);
      if (!matched.length) {
        return;
      }

      const missing = moduleDetails.filter((detail) => !detail.inProfile);
      const blockedCount = matched.filter(
        (detail) => detail.entry?.availability === 'blocked'
      ).length;
      const attentionCount = matched.filter(
        (detail) => detail.entry?.availability === 'attention'
      ).length;
      const readyCount = matched.filter((detail) => detail.entry?.availability === 'ready').length;
      const compatStatus = moduleDetails.reduce(
        (worst, detail) => pickWorstCompatStatus(worst, detail.entry?.compatStatus || 'full'),
        'full'
      );

      const aggregatedFlags = [];
      const seenFlags = new Set();
      moduleDetails.forEach((detail) => {
        normalizeFlags(detail.entry).forEach((flag) => {
          const key = `${flag.tone}::${flag.label}`;
          if (!seenFlags.has(key)) {
            seenFlags.add(key);
            aggregatedFlags.push(flag);
          }
        });
      });

      const isCollectionDisabled = disabledCollections.has(collection.id);

      const shouldInclude =
        missing.length > 0 || blockedCount > 0 || attentionCount > 0 || isCollectionDisabled;
      if (!shouldInclude) {
        return;
      }

      const childHighlights = buildChildHighlights(collection, moduleSet, entryById);

      const coverage = directModules.length ? matched.length / directModules.length : 0;

      let tone = 'info';
      if (blockedCount > 0) {
        tone = 'alert';
      } else if (attentionCount > 0 || missing.length > 0 || isCollectionDisabled) {
        tone = 'warning';
      } else if (readyCount === matched.length && matched.length > 0) {
        tone = 'confirm';
      }

      const requires = ensureArray(collection.requires)
        .map((requirement) => {
          if (!requirement || typeof requirement !== 'object') {
            return null;
          }
          if (requirement.type === 'module') {
            const moduleEntry = entryById.get(requirement.id);
            return {
              id: requirement.id,
              type: 'module',
              label: moduleEntry?.manifest?.name || requirement.label || requirement.id,
              reason: requirement.reason || '',
            };
          }
          const target = collectionLookup.get(requirement.id);
          return {
            id: requirement.id,
            type: 'collection',
            label: requirement.label || target?.label || requirement.id,
            reason: requirement.reason || '',
          };
        })
        .filter(Boolean);

      profileSuggestions.push({
        id: collection.id,
        label: collection.label || collection.id,
        description: collection.description || '',
        coverage: {
          matched: matched.length,
          total: directModules.length,
          percent: coverage,
        },
        missingModules: missing.map((detail) => ({
          id: detail.id,
          label: detail.entry?.manifest?.name || detail.id,
          compatStatus: detail.entry?.compatStatus || 'none',
        })),
        modules: moduleDetails.map((detail) => ({
          id: detail.id,
          label: detail.entry?.manifest?.name || detail.id,
          availability: detail.entry?.availability || 'attention',
          status: detail.entry?.status || '',
          tone: detail.entry?.statusTone || 'info',
          compatStatus: detail.entry?.compatStatus || 'none',
          inProfile: detail.inProfile,
        })),
        flags: aggregatedFlags,
        blockedCount,
        attentionCount,
        readyCount,
        compatStatus,
        tone,
        requires,
        isCollectionDisabled,
        children: childHighlights,
        score: blockedCount * 100 + attentionCount * 50 + (missing.length > 0 ? 25 : 0) + coverage,
      });
    });

    if (profileSuggestions.length) {
      profileSuggestions.sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        if (b.coverage.percent !== a.coverage.percent) {
          return b.coverage.percent - a.coverage.percent;
        }
        return (a.label || a.id).localeCompare(b.label || b.id, 'fr');
      });
      result.push({
        profileId: profile.id,
        profileLabel: profile.label,
        suggestions: profileSuggestions,
      });
    }
  });

  return result;
}
