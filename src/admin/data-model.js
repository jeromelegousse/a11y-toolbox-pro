import { moduleCatalog } from '../module-catalog.js';
import { flattenedModuleCollections } from '../module-collections.js';
import { NAMESPACE_TO_MODULE } from './constants.js';
import { ensureArray } from './utils.js';

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

function resolveModuleFromNamespace(namespace) {
  if (typeof namespace !== 'string') {
    return null;
  }
  const key = namespace.split('.')[0];
  return NAMESPACE_TO_MODULE.get(key) || null;
}

export function computeProfiles(snapshot = {}) {
  const profiles = snapshot?.profiles || {};
  const entries = Object.entries(profiles)
    .map(([id, profile]) => {
      const settings = profile?.settings || {};
      const modules = new Set();
      Object.keys(settings).forEach((path) => {
        const moduleId = resolveModuleFromNamespace(path);
        if (moduleId) {
          modules.add(moduleId);
        }
      });
      return {
        id,
        label: profile?.name || id,
        modules: Array.from(modules),
      };
    })
    .filter((entry) => entry.modules.length > 0);

  const moduleToProfiles = new Map();
  entries.forEach((profile) => {
    profile.modules.forEach((moduleId) => {
      if (!moduleToProfiles.has(moduleId)) {
        moduleToProfiles.set(moduleId, new Set());
      }
      moduleToProfiles.get(moduleId).add(profile.id);
    });
  });

  return {
    list: entries,
    moduleToProfiles,
  };
}

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

  return moduleCatalog.map((moduleDefinition) => {
    const manifest = moduleDefinition.manifest || {};
    const runtimeEntry = runtime[moduleDefinition.id] || {};
    const blockIds = ensureArray(runtimeEntry.blockIds);
    const status = resolveStatus(runtimeEntry, {
      disabled: disabledSet,
      hidden: hiddenSet,
      disabledCollections: collectionsDisabled,
    });

    const collections = moduleToCollections.get(moduleDefinition.id);
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

    const profiles = moduleToProfiles.get(moduleDefinition.id) || new Set();
    const flags = buildFlags(isCollectionDisabled, runtimeEntry, compat);

    const entry = {
      id: moduleDefinition.id,
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
      flags,
      searchText: buildSearchText({ id: moduleDefinition.id, manifest }),
    };

    entry.availability = determineAvailability({
      enabled: entry.enabled,
      statusTone: entry.statusTone,
      compatStatus,
      collectionDisabled: isCollectionDisabled,
      dependencies: entry.dependencies,
      flags: entry.flags,
    });

    return entry;
  });
}

export function filterModules(entries, filters) {
  return entries.filter((entry) => {
    if (filters.availability && filters.availability !== 'all' && entry.availability !== filters.availability) {
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

  const bucketMap = new Map(initialBuckets.map((bucket) => [bucket.id, { ...bucket, modules: [] }]));
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
    ensureArray(entry.collections).forEach((collectionId) => incrementCount(collectionCounts, collectionId));

    const bucketId = bucketMap.has(entry.availability) ? entry.availability : determineAvailability(entry);
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
